// ============================================================
// send-conversions
// Envia evento Purchase pra Meta Conversions API + TikTok Events API.
// Disparado pelo mp-webhook após pagamento approved.
// Tudo opcional: se faltar credencial, pula sem erro.
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

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.toLowerCase().trim()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface OrderRow {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  total_cents: number;
  paid_at: string | null;
  events: { name: string } | null;
  tickets: Array<{ id: string }>;
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
    const { data, error } = await supabase
      .from("orders")
      .select("buyer_name, buyer_email, buyer_phone, total_cents, paid_at, events(name), tickets(id)")
      .eq("id", order_id)
      .maybeSingle();
    if (error || !data) return jsonError("Order not found", 404);
    const order = data as unknown as OrderRow;

    const value = order.total_cents / 100;
    const numItems = order.tickets.length;
    const eventTimeUnix = Math.floor(new Date(order.paid_at ?? Date.now()).getTime() / 1000);

    // Hash PII (Meta e TikTok exigem hashing pra match avançado)
    const emailHash = await sha256Hex(order.buyer_email);
    const phoneHash = await sha256Hex(order.buyer_phone.replace(/\D/g, ""));
    const firstName = order.buyer_name.split(" ")[0] ?? "";
    const lastName = order.buyer_name.split(" ").slice(1).join(" ");
    const fnHash = firstName ? await sha256Hex(firstName) : "";
    const lnHash = lastName ? await sha256Hex(lastName) : "";

    const results: Record<string, unknown> = {};

    // ===== Meta CAPI =====
    const metaPixelId = Deno.env.get("META_PIXEL_ID");
    const metaToken = Deno.env.get("META_CONVERSIONS_API_TOKEN");
    const metaTestCode = Deno.env.get("META_TEST_EVENT_CODE");
    if (metaPixelId && metaToken) {
      try {
        const metaPayload = {
          data: [{
            event_name: "Purchase",
            event_time: eventTimeUnix,
            event_id: order_id, // dedupli com event do pixel
            action_source: "website",
            event_source_url: `${Deno.env.get("SITE_URL") ?? "https://artsingressos.vercel.app"}/pedido/${order_id}`,
            user_data: {
              em: [emailHash],
              ph: [phoneHash],
              fn: [fnHash],
              ln: [lnHash],
            },
            custom_data: {
              currency: "BRL",
              value,
              content_ids: [order_id],
              content_name: order.events?.name,
              content_type: "product",
              num_items: numItems,
              order_id,
            },
          }],
          ...(metaTestCode ? { test_event_code: metaTestCode } : {}),
        };
        const metaResp = await fetch(
          `https://graph.facebook.com/v19.0/${metaPixelId}/events?access_token=${metaToken}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metaPayload) }
        );
        results.meta = { ok: metaResp.ok, status: metaResp.status, body: metaResp.ok ? undefined : (await metaResp.text()).slice(0, 300) };
      } catch (e) {
        results.meta = { ok: false, error: e instanceof Error ? e.message : "err" };
      }
    } else {
      results.meta = { skipped: true, reason: "META_PIXEL_ID or META_CONVERSIONS_API_TOKEN not set" };
    }

    // ===== TikTok Events API =====
    const ttPixelId = Deno.env.get("TIKTOK_PIXEL_ID");
    const ttToken = Deno.env.get("TIKTOK_ACCESS_TOKEN");
    if (ttPixelId && ttToken) {
      try {
        const ttPayload = {
          event_source: "web",
          event_source_id: ttPixelId,
          data: [{
            event: "CompletePayment",
            event_time: eventTimeUnix,
            event_id: order_id,
            user: {
              email: emailHash,
              phone: phoneHash,
            },
            properties: {
              currency: "BRL",
              value,
              content_id: order_id,
              content_name: order.events?.name,
              content_type: "product",
              quantity: numItems,
              contents: [{ content_id: order_id, content_name: order.events?.name, quantity: numItems, price: value / Math.max(1, numItems) }],
            },
            page: {
              url: `${Deno.env.get("SITE_URL") ?? "https://artsingressos.vercel.app"}/pedido/${order_id}`,
            },
          }],
        };
        const ttResp = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Access-Token": ttToken },
          body: JSON.stringify(ttPayload),
        });
        results.tiktok = { ok: ttResp.ok, status: ttResp.status, body: ttResp.ok ? undefined : (await ttResp.text()).slice(0, 300) };
      } catch (e) {
        results.tiktok = { ok: false, error: e instanceof Error ? e.message : "err" };
      }
    } else {
      results.tiktok = { skipped: true, reason: "TIKTOK_PIXEL_ID or TIKTOK_ACCESS_TOKEN not set" };
    }

    await supabase.from("audit_log").insert({
      actor_type: "system", entity_type: "order", entity_id: order_id,
      action: "CONVERSIONS_SENT", after_data: { value, results },
    });

    return new Response(JSON.stringify({ ok: true, value, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-conversions error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
