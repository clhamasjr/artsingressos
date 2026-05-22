import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const ck = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", ck, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface OrderItem { ticket_type_id: string; quantity: number; }
interface CreateOrderBody {
  event_id: string;
  items: OrderItem[];
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_cpf: string;
  payment_method: "pix" | "credit_card";
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const body = (await req.json()) as CreateOrderBody;
    if (!body.event_id || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonError("Invalid payload", 400);
    }
    if (!body.buyer_name || !body.buyer_email || !body.buyer_phone || !body.buyer_cpf) {
      return jsonError("Missing buyer info", 400);
    }
    const totalQty = body.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    if (totalQty < 1 || totalQty > 20) return jsonError("Quantity out of bounds", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const { data: reserveData, error: reserveError } = await supabase.rpc("reserve_tickets", {
      p_event_id: body.event_id,
      p_items: body.items,
      p_buyer_name: body.buyer_name,
      p_buyer_email: body.buyer_email,
      p_buyer_phone: body.buyer_phone,
      p_buyer_cpf: body.buyer_cpf,
      p_utm: body.utm ?? {},
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (reserveError) {
      const msg = reserveError.message ?? "";
      return jsonError(mapReserveError(msg), 400);
    }
    if (!reserveData || !Array.isArray(reserveData) || reserveData.length === 0) {
      return jsonError("Reserve failed", 500);
    }
    const { order_id, total_cents } = reserveData[0] as { order_id: string; total_cents: number };

    // ============================================================
    // MOCK PAYMENT - substituir por integracao Mercado Pago
    // ============================================================
    await supabase
      .from("orders")
      .update({
        status: "pago",
        payment_method: body.payment_method,
        paid_at: new Date().toISOString(),
        mp_payment_id: `MOCK-${crypto.randomUUID()}`,
      })
      .eq("id", order_id);

    const { data: orderItems } = await supabase
      .from("order_items")
      .select("ticket_type_id, quantity")
      .eq("order_id", order_id);

    const hmacSecret = Deno.env.get("VOUCHER_HMAC_SECRET") ?? "DEV_INSECURE_KEY_CHANGE_ME";
    const ticketRows: Array<{ order_id: string; ticket_type_id: string; event_id: string; hash: string }> = [];

    for (const item of orderItems ?? []) {
      for (let i = 0; i < item.quantity; i++) {
        const ticketId = crypto.randomUUID();
        const hash = await hmacSha256Hex(
          hmacSecret,
          `${ticketId}|${body.event_id}|${order_id}|${item.ticket_type_id}`
        );
        ticketRows.push({ order_id, ticket_type_id: item.ticket_type_id, event_id: body.event_id, hash });
      }
    }

    if (ticketRows.length > 0) {
      const { error: insertError } = await supabase.from("tickets").insert(ticketRows);
      if (insertError) {
        console.error("Failed to create tickets:", insertError);
        return jsonError("Failed to create tickets", 500);
      }
    }

    await supabase.from("audit_log").insert({
      actor_type: "system",
      entity_type: "order",
      entity_id: order_id,
      action: "MOCK_PAID",
      after_data: { total_cents, ticket_count: ticketRows.length },
      ip,
    });

    return new Response(
      JSON.stringify({ order_id, total_cents, ticket_count: ticketRows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});

function mapReserveError(msg: string): string {
  if (msg.includes("EVENT_NOT_AVAILABLE")) return "Evento nao disponivel.";
  if (msg.includes("TICKET_TYPE_NOT_FOUND")) return "Lote nao encontrado.";
  if (msg.includes("TICKET_TYPE_INACTIVE")) return "Lote inativo.";
  if (msg.includes("SALE_NOT_STARTED")) return "Vendas ainda nao iniciaram.";
  if (msg.includes("SALE_ENDED")) return "Vendas encerradas.";
  if (msg.includes("NOT_ENOUGH_TICKETS")) return "Ingressos esgotados.";
  if (msg.includes("INVALID_QUANTITY")) return "Quantidade invalida.";
  return "Erro ao reservar ingressos.";
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
