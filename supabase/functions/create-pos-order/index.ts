// ============================================================
// create-pos-order
// Venda PRESENCIAL no portão: operador autenticado vende e
// confirma pagamento manual. Gera tickets na hora.
// Sem necessidade de conta de cliente.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const ck = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", ck, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fireSendVoucher(order_id: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-voucher`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const p = fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ order_id }),
  }).catch((e) => console.error("send-voucher dispatch:", e));
  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
}

interface PosBody {
  event_id: string;
  items: Array<{ ticket_type_id: string; quantity: number }>;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  payment_method: "dinheiro" | "pix_manual" | "cartao_maquininha";
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

  try {
    // Auth do operador via Bearer JWT
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonError("Unauthorized", 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userInfo } = await userClient.auth.getUser();
    const userId = userInfo?.user?.id;
    if (!userId) return jsonError("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verifica que é admin ou operator
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();
    if (!adminUser || !["admin", "operator"].includes(adminUser.role)) {
      return jsonError("Forbidden: not an operator", 403);
    }

    const body = (await req.json()) as PosBody;
    if (!body.event_id || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonError("Invalid payload", 400);
    }
    const totalQty = body.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    if (totalQty < 1 || totalQty > 50) return jsonError("Quantity out of bounds", 400);

    // Reserve_tickets exige buyer_*. Pra PDV, se não informado, usa do operador.
    const buyerName = body.buyer_name?.trim() || `Cliente PDV - ${adminUser.email}`;
    const buyerEmail = body.buyer_email?.trim().toLowerCase() || `pdv-${Date.now()}@artsingressos.local`;
    const buyerPhone = (body.buyer_phone || "").replace(/\D/g, "") || "00000000000";
    const buyerCpf = "00000000000"; // PDV não exige CPF

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const { data: reserveData, error: reserveError } = await supabase.rpc("reserve_tickets", {
      p_event_id: body.event_id,
      p_items: body.items, // Sem holders no PDV — usa buyer
      p_buyer_name: buyerName,
      p_buyer_email: buyerEmail,
      p_buyer_phone: buyerPhone,
      p_buyer_cpf: buyerCpf,
      p_utm: { source: "pdv" },
      p_ip: ip,
      p_user_agent: userAgent,
    });
    if (reserveError) return jsonError(reserveError.message || "Reserve failed", 400);
    const { order_id, total_cents } = reserveData[0] as { order_id: string; total_cents: number };

    // Marca como pago + sale_channel presencial
    await supabase
      .from("orders")
      .update({
        status: "pago",
        payment_method: body.payment_method,
        paid_at: new Date().toISOString(),
        mp_payment_id: `PDV-${crypto.randomUUID()}`,
        sale_channel: "presencial",
        sold_by_id: userId,
      })
      .eq("id", order_id);

    // Gera tickets (1 por unidade de cada item)
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
    if (ticketRows.length > 0) await supabase.from("tickets").insert(ticketRows);

    await supabase.from("audit_log").insert({
      actor_id: userId,
      actor_type: "operator",
      entity_type: "order",
      entity_id: order_id,
      action: "POS_SALE",
      after_data: { total_cents, ticket_count: ticketRows.length, payment_method: body.payment_method, buyer_name: buyerName },
      ip,
    });

    // Dispara voucher por WhatsApp/email só se cliente informou contato
    if (body.buyer_phone || body.buyer_email) {
      fireSendVoucher(order_id);
    }

    // Busca tickets pra retornar com hashes
    const { data: ticketsInserted } = await supabase
      .from("tickets")
      .select("id, hash, ticket_types(name)")
      .eq("order_id", order_id)
      .order("created_at", { ascending: true });

    return new Response(
      JSON.stringify({
        order_id,
        total_cents,
        tickets: (ticketsInserted ?? []).map((t) => {
          const tt = (t as unknown as { hash: string; ticket_types: { name: string } | null });
          return { hash: tt.hash, ticket_type_name: tt.ticket_types?.name ?? "Ingresso" };
        }),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-pos-order error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
