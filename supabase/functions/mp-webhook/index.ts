// ============================================================
// Mercado Pago Webhook
// Recebe notificacoes de pagamento, valida assinatura HMAC,
// faz idempotencia via webhook_events, gera tickets quando approved.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const ck = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", ck, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMpSignature(
  req: Request,
  dataId: string,
  secret: string
): Promise<boolean> {
  const sigHeader = req.headers.get("x-signature") ?? "";
  const reqId = req.headers.get("x-request-id") ?? "";
  // formato: "ts=1234567890,v1=abcdef..."
  const parts: Record<string, string> = {};
  for (const p of sigHeader.split(",")) {
    const [k, v] = p.trim().split("=");
    if (k && v) parts[k] = v;
  }
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId};request-id:${reqId};ts:${parts.ts};`;
  const calc = await hmacSha256Hex(secret, manifest);
  return calc === parts.v1;
}

function fireSendVoucher(order_id: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-voucher`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const p = fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ order_id }),
  }).catch((e) => console.error("send-voucher dispatch:", e));
  // @ts-ignore Supabase Edge Runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // MP às vezes envia GET de "ping" pra validar URL
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const url = new URL(req.url);
    const queryDataId = url.searchParams.get("data.id") || url.searchParams.get("id");
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      action?: string;
      data?: { id?: string };
    };
    const dataId = String(body?.data?.id ?? queryDataId ?? "");
    const eventType = body?.type ?? body?.action ?? "unknown";
    if (!dataId) return jsonError("Missing data.id", 400);

    const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    const sigValid = webhookSecret
      ? await verifyMpSignature(req, dataId, webhookSecret)
      : false;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Captura headers pra audit
    const headersObj: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headersObj[k] = v;
    });

    // Idempotência: tenta inserir; se já existir, retorna sucesso silencioso
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id, processed")
      .eq("source", "mercadopago")
      .eq("external_id", dataId)
      .maybeSingle();

    if (existing?.processed) {
      return new Response(
        JSON.stringify({ ok: true, idempotent: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existing) {
      await supabase.from("webhook_events").insert({
        source: "mercadopago",
        external_id: dataId,
        signature_valid: sigValid,
        raw_headers: headersObj,
        raw_payload: body,
      });
    }

    // Se assinatura nao bate e o secret tava configurado, recusa
    if (webhookSecret && !sigValid) {
      await supabase
        .from("webhook_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error: "INVALID_SIGNATURE",
        })
        .eq("source", "mercadopago")
        .eq("external_id", dataId);
      return jsonError("Invalid signature", 401);
    }

    // Só processa eventos de pagamento
    const isPayment =
      eventType === "payment" ||
      eventType.startsWith("payment") ||
      body?.type === "payment";
    if (!isPayment) {
      await supabase
        .from("webhook_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error: "IGNORED_EVENT_TYPE",
        })
        .eq("source", "mercadopago")
        .eq("external_id", dataId);
      return new Response(
        JSON.stringify({ ok: true, ignored: true, type: eventType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpToken) return jsonError("MP token not configured", 500);

    // Busca o pagamento na API do MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) {
      await supabase
        .from("webhook_events")
        .update({
          error: `MP API ${mpRes.status}`,
          processed_at: new Date().toISOString(),
        })
        .eq("source", "mercadopago")
        .eq("external_id", dataId);
      return jsonError(`Failed to fetch payment: ${mpRes.status}`, 502);
    }
    const payment = (await mpRes.json()) as {
      id: number;
      status: string;
      status_detail?: string;
      payment_method_id?: string;
      payment_type_id?: string;
      external_reference?: string;
      transaction_amount?: number;
    };

    const orderId = payment.external_reference;
    if (!orderId) {
      await supabase
        .from("webhook_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error: "NO_EXTERNAL_REFERENCE",
        })
        .eq("source", "mercadopago")
        .eq("external_id", dataId);
      return new Response(
        JSON.stringify({ ok: true, ignored: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mapeia status MP -> order_status
    let newOrderStatus: string | null;
    switch (payment.status) {
      case "approved":
        newOrderStatus = "pago";
        break;
      case "rejected":
      case "cancelled":
        newOrderStatus = "falhou";
        break;
      case "refunded":
      case "charged_back":
        newOrderStatus = "estornado";
        break;
      case "pending":
      case "in_process":
      case "authorized":
        newOrderStatus = null; // mantém pendente
        break;
      default:
        newOrderStatus = null;
    }

    const paymentMethod: "pix" | "credit_card" | "debit_card" =
      payment.payment_type_id === "credit_card"
        ? "credit_card"
        : payment.payment_type_id === "debit_card"
        ? "debit_card"
        : "pix";

    const updateData: Record<string, unknown> = {
      mp_payment_id: String(payment.id),
      payment_method: paymentMethod,
    };

    if (newOrderStatus === "pago") {
      updateData.status = "pago";
      updateData.paid_at = new Date().toISOString();
    } else if (newOrderStatus) {
      updateData.status = newOrderStatus;
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (updateErr) {
      await supabase
        .from("webhook_events")
        .update({
          error: `UPDATE_ORDER_FAILED: ${updateErr.message}`,
          processed_at: new Date().toISOString(),
        })
        .eq("source", "mercadopago")
        .eq("external_id", dataId);
      return jsonError("Failed to update order", 500);
    }

    // Se foi APROVADO: gera tickets (idempotente)
    if (newOrderStatus === "pago") {
      const { count } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId);

      if (!count || count === 0) {
        const [{ data: orderItems }, { data: order }] = await Promise.all([
          supabase
            .from("order_items")
            .select("ticket_type_id, quantity")
            .eq("order_id", orderId),
          supabase.from("orders").select("event_id").eq("id", orderId).single(),
        ]);

        if (order) {
          const hmacSecret =
            Deno.env.get("VOUCHER_HMAC_SECRET") ?? "DEV_INSECURE_KEY_CHANGE_ME";
          const ticketRows: Array<{
            order_id: string;
            ticket_type_id: string;
            event_id: string;
            hash: string;
          }> = [];

          for (const item of orderItems ?? []) {
            for (let i = 0; i < item.quantity; i++) {
              const ticketId = crypto.randomUUID();
              const hash = await hmacSha256Hex(
                hmacSecret,
                `${ticketId}|${order.event_id}|${orderId}|${item.ticket_type_id}`
              );
              ticketRows.push({
                order_id: orderId,
                ticket_type_id: item.ticket_type_id,
                event_id: order.event_id as string,
                hash,
              });
            }
          }

          if (ticketRows.length > 0) {
            await supabase.from("tickets").insert(ticketRows);
          }
        }
      }

      await supabase.from("audit_log").insert({
        actor_type: "system",
        entity_type: "order",
        entity_id: orderId,
        action: "MP_WEBHOOK_APPROVED",
        after_data: {
          mp_payment_id: payment.id,
          status: payment.status,
          sig_valid: sigValid,
        },
      });

      // Fire-and-forget: envia voucher por WhatsApp + email
      fireSendVoucher(orderId);
    }

    await supabase
      .from("webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("source", "mercadopago")
      .eq("external_id", dataId);

    return new Response(
      JSON.stringify({
        ok: true,
        order_id: orderId,
        order_status: newOrderStatus ?? "pendente",
        payment_status: payment.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("mp-webhook error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
