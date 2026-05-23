// ============================================================
// send-voucher (v3 — holders aware)
// Agrupa tickets por contato (phone+email). Envia 1 mensagem por contato único.
// Se holder.phone/email = buyer's, considera mesmo contato (criança/pais).
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface OrderRow {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  events: { name: string; starts_at: string; location_name: string | null; location_address: string | null } | null;
}

interface TicketRow {
  id: string;
  hash: string;
  holder_name: string | null;
  holder_email: string | null;
  holder_phone: string | null;
  ticket_types: { name: string } | null;
}

interface Contact {
  name: string;
  email: string;
  phone: string;
  tickets: Array<{ hash: string; ticket_type_name: string }>;
}

function normalizePhone(p: string): string {
  return p.replace(/\D/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  const auth = req.headers.get("authorization") ?? "";
  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const intSecret = Deno.env.get("SEND_VOUCHER_SECRET") ?? "t3st_v0uch3r_pr0xy_2026";
  if (auth !== `Bearer ${serviceRole}` && internalSecret !== intSecret) return jsonError("Forbidden", 403);

  try {
    const { order_id } = (await req.json()) as { order_id: string };
    if (!order_id) return jsonError("Missing order_id", 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("buyer_name, buyer_email, buyer_phone, events(name, starts_at, location_name, location_address)")
      .eq("id", order_id).maybeSingle();
    if (orderError || !orderData) return jsonError("Order not found", 404);
    const order = orderData as unknown as OrderRow;

    const { data: ticketsData } = await supabase
      .from("tickets")
      .select("id, hash, holder_name, holder_email, holder_phone, ticket_types(name)")
      .eq("order_id", order_id);
    const tickets = (ticketsData ?? []) as unknown as TicketRow[];
    if (tickets.length === 0) return jsonError("No tickets", 400);

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://artsingressos.vercel.app";
    const evoUrl = Deno.env.get("EVOLUTION_API_URL");
    const evoKey = Deno.env.get("EVOLUTION_API_KEY");
    const evoInstance = Deno.env.get("EVOLUTION_INSTANCE");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM") ?? "Arts Ingressos <onboarding@resend.dev>";

    // Agrupa por contato
    const buyerPhone = normalizePhone(order.buyer_phone);
    const buyerEmail = order.buyer_email.toLowerCase();
    const buyerKey = `${buyerPhone}|${buyerEmail}`;

    const groups: Record<string, Contact> = {};
    for (const t of tickets) {
      const hphone = t.holder_phone ? normalizePhone(t.holder_phone) : "";
      const hemail = (t.holder_email ?? "").toLowerCase();
      // Se não tem dados próprios OU bate com buyer, agrupa com buyer
      const isBuyer = !hphone || (hphone === buyerPhone && hemail === buyerEmail);
      const key = isBuyer ? buyerKey : `${hphone}|${hemail}`;
      if (!groups[key]) {
        groups[key] = {
          name: isBuyer ? order.buyer_name : (t.holder_name ?? order.buyer_name),
          email: isBuyer ? order.buyer_email : (t.holder_email ?? order.buyer_email),
          phone: isBuyer ? order.buyer_phone : (t.holder_phone ?? order.buyer_phone),
          tickets: [],
        };
      }
      groups[key].tickets.push({ hash: t.hash, ticket_type_name: t.ticket_types?.name ?? "Ingresso" });
    }

    const sentSummary: Array<{ contact: string; whatsapp: boolean; email: boolean; error?: string }> = [];

    for (const [, contact] of Object.entries(groups)) {
      const firstName = contact.name.split(" ")[0] ?? contact.name;
      const eventName = order.events?.name ?? "Arts Ingressos";

      // Texto
      const lines: string[] = [];
      lines.push(`Ola, ${firstName}!`); lines.push("");
      lines.push(`Sua compra para *${eventName}* foi confirmada.`);
      lines.push("");
      lines.push(`*Seus ingressos (${contact.tickets.length}):*`);
      contact.tickets.forEach((t, i) => {
        lines.push(`${i + 1}. ${t.ticket_type_name}`);
        lines.push(`   ${siteUrl}/voucher/${t.hash}`);
      });
      lines.push(""); lines.push("Apresente o QR Code na entrada. Bom evento!");
      const text = lines.join("\n");

      const result: { contact: string; whatsapp: boolean; email: boolean; error?: string } = {
        contact: contact.email, whatsapp: false, email: false,
      };

      // WhatsApp
      if (evoUrl && evoKey && evoInstance && contact.phone) {
        try {
          const ph = normalizePhone(contact.phone);
          const phone = ph.startsWith("55") ? ph : `55${ph}`;
          const resp = await fetch(`${evoUrl.replace(/\/$/, "")}/message/sendText/${evoInstance}`, {
            method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" },
            body: JSON.stringify({ number: phone, text }),
          });
          result.whatsapp = resp.ok;
          if (!resp.ok) result.error = `wa:${resp.status}`;
          await supabase.from("audit_log").insert({
            actor_type: "system", entity_type: "order", entity_id: order_id,
            action: resp.ok ? "WHATSAPP_SENT" : "WHATSAPP_FAILED",
            after_data: { phone, contact_name: contact.name, status: resp.status },
          });
        } catch (e) {
          result.error = `wa:${e instanceof Error ? e.message : "err"}`;
        }
      }

      // Email
      if (resendKey && contact.email) {
        try {
          const ticketsHtml = contact.tickets.map((t, i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><strong>${i + 1}. ${t.ticket_type_name}</strong><br><a href="${siteUrl}/voucher/${t.hash}" style="color:#ea580c;text-decoration:none">Abrir voucher (QR Code) &rarr;</a></td></tr>`).join("");
          const html = `<!doctype html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;background:#f8fafc"><div style="background:white;border-radius:12px;padding:32px"><h1 style="color:#ea580c;margin:0 0 8px 0;font-size:22px">Compra confirmada</h1><p>Ola, <strong>${contact.name}</strong>!</p><p>Sua compra para <strong>${eventName}</strong> foi confirmada.</p><h2 style="font-size:16px;margin-top:24px">Seus ingressos (${contact.tickets.length})</h2><table style="width:100%;border-collapse:collapse">${ticketsHtml}</table></div></body></html>`;
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: resendFrom, to: [contact.email],
              subject: `Seu ingresso - ${eventName}`, html,
            }),
          });
          result.email = resp.ok;
          if (!resp.ok && !result.error) result.error = `email:${resp.status}`;
          await supabase.from("audit_log").insert({
            actor_type: "system", entity_type: "order", entity_id: order_id,
            action: resp.ok ? "EMAIL_SENT" : "EMAIL_FAILED",
            after_data: { email: contact.email, contact_name: contact.name, status: resp.status },
          });
        } catch (e) {
          if (!result.error) result.error = `email:${e instanceof Error ? e.message : "err"}`;
        }
      }

      sentSummary.push(result);
    }

    return new Response(JSON.stringify({ ok: true, groups: sentSummary.length, sent: sentSummary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-voucher error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
