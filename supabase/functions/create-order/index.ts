// ============================================================
// create-order
// Quando MERCADOPAGO_ACCESS_TOKEN esta setado: cria Preference MP
// e retorna init_point pro front redirecionar (Checkout Pro).
// Caso contrario: mockaca o pagamento (modo dev).
// ============================================================
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

interface OrderItem {
  ticket_type_id: string;
  quantity: number;
}
interface CreateOrderBody {
  event_id: string;
  items: OrderItem[];
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_cpf: string;
  payment_method: "pix" | "credit_card";
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
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

    // RESERVA (lock pessimista, recalcula total no server)
    const { data: reserveData, error: reserveError } = await supabase.rpc(
      "reserve_tickets",
      {
        p_event_id: body.event_id,
        p_items: body.items,
        p_buyer_name: body.buyer_name,
        p_buyer_email: body.buyer_email,
        p_buyer_phone: body.buyer_phone,
        p_buyer_cpf: body.buyer_cpf,
        p_utm: body.utm ?? {},
        p_ip: ip,
        p_user_agent: userAgent,
      }
    );

    if (reserveError) {
      return jsonError(mapReserveError(reserveError.message ?? ""), 400);
    }
    if (!reserveData || !Array.isArray(reserveData) || reserveData.length === 0) {
      return jsonError("Reserve failed", 500);
    }
    const { order_id, total_cents } = reserveData[0] as {
      order_id: string;
      total_cents: number;
    };

    // Se o request veio com JWT de customer, salva o customer_id na order
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const userToken = authHeader.slice(7);
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: `Bearer ${userToken}` } } }
        );
        const { data: userInfo } = await userClient.auth.getUser();
        const uid = userInfo?.user?.id;
        if (uid) {
          await supabase.from("orders").update({ customer_id: uid }).eq("id", order_id);
        }
      } catch (e) {
        console.warn("Could not resolve customer_id from JWT:", e);
      }
    }

    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://artsingressos.vercel.app";

    if (mpToken) {
      // ============================================================
      // MODO PRODUCAO: cria Preference no Mercado Pago
      // ============================================================
      const { data: orderItemsExpanded } = await supabase
        .from("order_items")
        .select("quantity, unit_price_cents, ticket_types(name), orders(event_id, events(name))")
        .eq("order_id", order_id);

      // Monta items pro MP
      const mpItems = (orderItemsExpanded ?? []).map((oi) => {
        const itemRow = oi as unknown as {
          quantity: number;
          unit_price_cents: number;
          ticket_types: { name: string } | null;
          orders: { events: { name: string } | null } | null;
        };
        return {
          id: order_id,
          title: `${itemRow.ticket_types?.name ?? "Ingresso"} - ${
            itemRow.orders?.events?.name ?? "Evento"
          }`,
          quantity: itemRow.quantity,
          currency_id: "BRL",
          unit_price: itemRow.unit_price_cents / 100,
        };
      });

      // Restringe payment_types conforme escolha do usuario.
      // NAO usar default_payment_method_id pra evitar conflito "excluded".
      const paymentMethodsCfg: Record<string, unknown> = {
        installments: 12,
      };
      if (body.payment_method === "pix") {
        // Pix = payment_type "bank_transfer". Excluo todo o resto.
        paymentMethodsCfg.excluded_payment_types = [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "prepaid_card" },
          { id: "ticket" },
          { id: "atm" },
          { id: "digital_wallet" },
        ];
      } else {
        // Cartao: exclui bank_transfer (Pix), boleto, atm, prepago, wallet
        paymentMethodsCfg.excluded_payment_types = [
          { id: "bank_transfer" },
          { id: "ticket" },
          { id: "atm" },
          { id: "prepaid_card" },
          { id: "digital_wallet" },
        ];
      }

      const preferencePayload = {
        external_reference: order_id,
        items: mpItems,
        payer: {
          name: body.buyer_name,
          email: body.buyer_email,
          phone: { area_code: body.buyer_phone.slice(0, 2), number: body.buyer_phone.slice(2) },
          identification: { type: "CPF", number: body.buyer_cpf },
        },
        payment_methods: paymentMethodsCfg,
        back_urls: {
          success: `${siteUrl}/pedido/${order_id}`,
          pending: `${siteUrl}/pedido/${order_id}`,
          failure: `${siteUrl}/pedido/${order_id}`,
        },
        auto_return: "approved",
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
        statement_descriptor: "ARTSINGRESSOS",
        binary_mode: false,
        expires: true,
        expiration_date_to: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": order_id,
        },
        body: JSON.stringify(preferencePayload),
      });

      if (!mpRes.ok) {
        const errBody = await mpRes.text();
        console.error("MP preference creation failed:", mpRes.status, errBody);
        await supabase.from("orders").update({ status: "falhou" }).eq("id", order_id);
        return jsonError(`Falha ao criar pagamento (MP ${mpRes.status})`, 502);
      }

      const pref = (await mpRes.json()) as {
        id: string;
        init_point: string;
        sandbox_init_point: string;
      };

      // Decide qual init_point usar baseado no token (teste vs prod)
      const isTestToken = mpToken.includes("TEST-");
      const checkoutUrl = isTestToken ? pref.sandbox_init_point : pref.init_point;

      await supabase
        .from("orders")
        .update({ mp_preference_id: pref.id })
        .eq("id", order_id);

      return new Response(
        JSON.stringify({
          order_id,
          total_cents,
          mode: "mercadopago",
          preference_id: pref.id,
          init_point: checkoutUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // MODO DEV/MOCK: marca pago direto, gera tickets
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
          `${ticketId}|${body.event_id}|${order_id}|${item.ticket_type_id}`
        );
        ticketRows.push({
          order_id,
          ticket_type_id: item.ticket_type_id,
          event_id: body.event_id,
          hash,
        });
      }
    }

    if (ticketRows.length > 0) {
      await supabase.from("tickets").insert(ticketRows);
    }

    await supabase.from("audit_log").insert({
      actor_type: "system",
      entity_type: "order",
      entity_id: order_id,
      action: "MOCK_PAID",
      after_data: { total_cents, ticket_count: ticketRows.length },
      ip,
    });

    // Fire-and-forget: envia voucher por WhatsApp + email
    fireSendVoucher(order_id);

    return new Response(
      JSON.stringify({
        order_id,
        total_cents,
        mode: "mock",
        ticket_count: ticketRows.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-order error:", e);
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
