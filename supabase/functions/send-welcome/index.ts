// ============================================================
// send-welcome (v2 — suporta imagens)
// Disparada após check-in OK. Envia WhatsApp com:
//   - Texto de boas-vindas (programming text + welcome + local)
//   - Imagem da programação (se houver) via /message/sendMedia
//   - Imagem do croqui interno (se houver) via /message/sendMedia
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface TicketRow {
  hash: string;
  orders: { buyer_name: string; buyer_phone: string } | null;
  ticket_types: { name: string } | null;
  events: {
    name: string;
    starts_at: string;
    location_name: string | null;
    location_address: string | null;
    welcome_message: string | null;
    programming: string | null;
    programming_image_url: string | null;
    map_url: string | null;
  } | null;
}

async function sendText(
  evoUrl: string,
  evoKey: string,
  evoInstance: string,
  number: string,
  text: string
) {
  return fetch(`${evoUrl.replace(/\/$/, "")}/message/sendText/${evoInstance}`, {
    method: "POST",
    headers: { apikey: evoKey, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text }),
  });
}

async function sendMedia(
  evoUrl: string,
  evoKey: string,
  evoInstance: string,
  number: string,
  mediaUrl: string,
  caption: string
) {
  // Evolution v2 endpoint
  return fetch(`${evoUrl.replace(/\/$/, "")}/message/sendMedia/${evoInstance}`, {
    method: "POST",
    headers: { apikey: evoKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      number,
      mediatype: "image",
      mimetype: "image/jpeg",
      caption,
      media: mediaUrl,
      fileName: "imagem.jpg",
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  const auth = req.headers.get("authorization") ?? "";
  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const intSecret = Deno.env.get("SEND_VOUCHER_SECRET") ?? "t3st_v0uch3r_pr0xy_2026";
  if (auth !== `Bearer ${serviceRole}` && internalSecret !== intSecret) {
    return jsonError("Forbidden", 403);
  }

  try {
    const { ticket_id } = (await req.json()) as { ticket_id: string };
    if (!ticket_id) return jsonError("Missing ticket_id", 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

    const { data, error } = await supabase
      .from("tickets")
      .select(
        "hash, orders(buyer_name, buyer_phone), ticket_types(name), events(name, starts_at, location_name, location_address, welcome_message, programming, programming_image_url, map_url)"
      )
      .eq("id", ticket_id)
      .maybeSingle();

    if (error || !data) return jsonError("Ticket not found", 404);
    const t = data as unknown as TicketRow;

    const buyerName = t.orders?.buyer_name ?? "";
    const buyerPhone = t.orders?.buyer_phone ?? "";
    const event = t.events;
    if (!event) return jsonError("Event not found", 404);
    if (!buyerPhone) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_phone" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evoUrl = Deno.env.get("EVOLUTION_API_URL");
    const evoKey = Deno.env.get("EVOLUTION_API_KEY");
    const evoInstance = Deno.env.get("EVOLUTION_INSTANCE");
    if (!evoUrl || !evoKey || !evoInstance) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "evolution_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ph = buyerPhone.replace(/\D/g, "");
    const phone = ph.startsWith("55") ? ph : `55${ph}`;

    // ===== Mensagem 1: TEXTO de boas-vindas =====
    const lines: string[] = [];
    const firstName = buyerName.split(" ")[0] ?? buyerName;
    lines.push(`Olá, ${firstName}!`);
    lines.push("");
    lines.push(`Seja muito bem-vindo(a) ao *${event.name}*!`);
    if (event.welcome_message) {
      lines.push("");
      lines.push(event.welcome_message);
    }
    // Se NÃO tem imagem da programação, manda como texto
    if (!event.programming_image_url && event.programming) {
      lines.push("");
      lines.push("*Programação:*");
      lines.push(event.programming);
    }
    if (event.location_name || event.location_address) {
      lines.push("");
      lines.push("*Local:*");
      if (event.location_name) lines.push(event.location_name);
      if (event.location_address) lines.push(event.location_address);
    }
    lines.push("");
    lines.push("Aproveite o evento!");

    const text = lines.join("\n");
    const results: Record<string, unknown> = {};

    const textResp = await sendText(evoUrl, evoKey, evoInstance, phone, text);
    results.text = { ok: textResp.ok, status: textResp.status };

    // ===== Mensagem 2: imagem PROGRAMAÇÃO (se houver) =====
    if (event.programming_image_url) {
      const captionLines: string[] = ["Confira a programação completa!"];
      const progResp = await sendMedia(
        evoUrl,
        evoKey,
        evoInstance,
        phone,
        event.programming_image_url,
        captionLines.join("\n")
      );
      results.programming_image = {
        ok: progResp.ok,
        status: progResp.status,
        error: progResp.ok ? undefined : (await progResp.text()).slice(0, 200),
      };
    }

    // ===== Mensagem 3: imagem CROQUI INTERNO (se houver) =====
    if (event.map_url) {
      const mapResp = await sendMedia(
        evoUrl,
        evoKey,
        evoInstance,
        phone,
        event.map_url,
        "Mapa interno do local — pra você se orientar."
      );
      results.map_image = {
        ok: mapResp.ok,
        status: mapResp.status,
        error: mapResp.ok ? undefined : (await mapResp.text()).slice(0, 200),
      };
    }

    const allOk =
      (results.text as { ok?: boolean })?.ok &&
      (event.programming_image_url ? (results.programming_image as { ok?: boolean })?.ok : true) &&
      (event.map_url ? (results.map_image as { ok?: boolean })?.ok : true);

    await supabase.from("audit_log").insert({
      actor_type: "system",
      entity_type: "ticket",
      entity_id: ticket_id,
      action: allOk ? "WELCOME_SENT" : "WELCOME_FAILED",
      after_data: { phone, results },
    });

    return new Response(
      JSON.stringify({ welcome_sent: allOk, phone, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-welcome error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
