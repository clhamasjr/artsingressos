// ============================================================
// send-voucher
// Recebe { order_id }, busca order+tickets+event, envia:
//   1) WhatsApp via Evolution API (se EVOLUTION_* env vars setadas)
//   2) Email via Resend (se RESEND_API_KEY setada)
// Tolera ausencia de credenciais (skip silencioso).
// Chamada INTERNAMENTE por outras Edge Functions (verify_jwt: true).
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendVoucherBody { order_id: string; }

interface OrderRow {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  total_cents: number;
  events: {
    name: string;
    slug: string;
    starts_at: string;
    location_name: string | null;
    location_address: string | null;
  } | null;
  tickets: Array<{ hash: string; ticket_types: { name: string } | null }>;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} as ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildEmailHtml(o: OrderRow, siteUrl: string, eventDate: string): string {
  const tickets = o.tickets.map((t, i) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee">
      <strong>${i + 1}. ${escapeHtml(t.ticket_types?.name ?? "Ingresso")}</strong><br>
      <a href="${siteUrl}/voucher/${t.hash}" style="color:#ea580c;text-decoration:none">
        Abrir voucher (QR Code) &rarr;
      </a>
    </td></tr>
  `).join("");
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;background:#f8fafc">
  <div style="background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <h1 style="color:#ea580c;margin:0 0 8px 0;font-size:22px">Compra confirmada</h1>
    <p style="margin:0 0 16px 0;color:#64748b">Ola, <strong>${escapeHtml(o.buyer_name)}</strong>!</p>
    <p>Sua compra para <strong>${escapeHtml(o.events?.name ?? "Arts Ingressos")}</strong> foi confirmada.</p>
    ${eventDate ? `<p style="margin:8px 0"><strong>Data:</strong> ${eventDate}</p>` : ""}
    ${o.events?.location_name ? `<p style="margin:8px 0"><strong>Local:</strong> ${escapeHtml(o.events.location_name)}</p>` : ""}
    <h2 style="font-size:16px;margin-top:24px;color:#0f172a">Seus ingressos (${o.tickets.length})</h2>
    <table style="width:100%;border-collapse:collapse">${tickets}</table>
    <hr style="margin:24px 0;border:0;border-top:1px solid #e2e8f0">
    <p style="color:#94a3b8;font-size:12px;margin:0">Apresente o QR Code na entrada. Cada link contem um voucher unico.</p>
  </div>
</body></html>`;
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  // Aceita Authorization Bearer <service_role> (de outras Edge Functions)
  // ou header x-internal-secret (pra testes/debug)
  const auth = req.headers.get("authorization") ?? "";
  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const intSecret = Deno.env.get("SEND_VOUCHER_SECRET") ?? "t3st_v0uch3r_pr0xy_2026";
  if (auth !== `Bearer ${serviceRole}` && internalSecret !== intSecret) {
    return jsonError("Forbidden", 403);
  }

  try {
    const { order_id } = (await req.json()) as SendVoucherBody;
    if (!order_id) return jsonError("Missing order_id", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("orders")
      .select(`
        buyer_name, buyer_email, buyer_phone, total_cents,
        events(name, slug, starts_at, location_name, location_address),
        tickets(hash, ticket_types(name))
      `)
      .eq("id", order_id)
      .maybeSingle();

    if (error || !data) return jsonError("Order not found", 404);
    const o = data as unknown as OrderRow;

    if (!o.tickets || o.tickets.length === 0) {
      return jsonError("No tickets to send", 400);
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://artsingressos.vercel.app";
    const eventDate = o.events?.starts_at ? formatDate(o.events.starts_at) : "";

    // Mensagem WhatsApp em texto plano
    const lines: string[] = [];
    lines.push(`Ola, ${o.buyer_name}!`);
    lines.push("");
    lines.push(`Sua compra para *${o.events?.name ?? "evento"}* foi confirmada.`);
    lines.push("");
    if (eventDate) lines.push(`Data: ${eventDate}`);
    if (o.events?.location_name) lines.push(`Local: ${o.events.location_name}`);
    lines.push("");
    lines.push(`*Seus ingressos (${o.tickets.length}):*`);
    o.tickets.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.ticket_types?.name ?? "Ingresso"}`);
      lines.push(`   ${siteUrl}/voucher/${t.hash}`);
    });
    lines.push("");
    lines.push("Apresente o QR Code na entrada. Bom evento!");
    const text = lines.join("\n");

    const results = { whatsapp: false, email: false, errors: [] as string[] };

    // 1) WhatsApp via Evolution
    const evoUrl = Deno.env.get("EVOLUTION_API_URL");
    const evoKey = Deno.env.get("EVOLUTION_API_KEY");
    const evoInstance = Deno.env.get("EVOLUTION_INSTANCE");
    if (evoUrl && evoKey && evoInstance && o.buyer_phone) {
      try {
        const phoneDigits = o.buyer_phone.replace(/\D/g, "");
        const phone = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;
        const resp = await fetch(`${evoUrl.replace(/\/$/, "")}/message/sendText/${evoInstance}`, {
          method: "POST",
          headers: { apikey: evoKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: phone, text }),
        });
        if (resp.ok) {
          results.whatsapp = true;
          await supabase.from("audit_log").insert({
            actor_type: "system", entity_type: "order", entity_id: order_id,
            action: "WHATSAPP_SENT", after_data: { phone, status: resp.status },
          });
        } else {
          const errTxt = (await resp.text()).slice(0, 300);
          results.errors.push(`whatsapp:${resp.status}`);
          await supabase.from("audit_log").insert({
            actor_type: "system", entity_type: "order", entity_id: order_id,
            action: "WHATSAPP_FAILED", after_data: { phone, status: resp.status, error: errTxt },
          });
        }
      } catch (e) {
        results.errors.push(`whatsapp:${e instanceof Error ? e.message : "err"}`);
      }
    }

    // 2) Email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM") ?? "Arts Ingressos <onboarding@resend.dev>";
    if (resendKey && o.buyer_email) {
      try {
        const html = buildEmailHtml(o, siteUrl, eventDate);
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: resendFrom,
            to: [o.buyer_email],
            subject: `Seu ingresso - ${o.events?.name ?? "Arts Ingressos"}`,
            html,
          }),
        });
        if (resp.ok) {
          results.email = true;
          await supabase.from("audit_log").insert({
            actor_type: "system", entity_type: "order", entity_id: order_id,
            action: "EMAIL_SENT", after_data: { email: o.buyer_email, status: resp.status },
          });
        } else {
          const errTxt = (await resp.text()).slice(0, 300);
          results.errors.push(`email:${resp.status}`);
          await supabase.from("audit_log").insert({
            actor_type: "system", entity_type: "order", entity_id: order_id,
            action: "EMAIL_FAILED", after_data: { email: o.buyer_email, status: resp.status, error: errTxt },
          });
        }
      } catch (e) {
        results.errors.push(`email:${e instanceof Error ? e.message : "err"}`);
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-voucher error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
