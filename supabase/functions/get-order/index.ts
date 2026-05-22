import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonError("Method not allowed", 405);

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id || !UUID_RE.test(id)) return jsonError("Invalid id", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, status, total_cents, buyer_name, buyer_email, buyer_phone, payment_method, paid_at, event_id, events(name, slug)")
      .eq("id", id)
      .maybeSingle();

    if (error || !order) return jsonError("Order not found", 404);

    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, hash, status, ticket_types(name)")
      .eq("order_id", id)
      .order("created_at", { ascending: true });

    const o = order as unknown as {
      id: string;
      status: string;
      total_cents: number;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      payment_method: string | null;
      paid_at: string | null;
      events: { name: string; slug: string } | null;
    };

    type TicketRow = { id: string; hash: string; status: string; ticket_types: { name: string } | null };

    return new Response(
      JSON.stringify({
        id: o.id,
        status: o.status,
        total_cents: o.total_cents,
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        buyer_phone: o.buyer_phone,
        payment_method: o.payment_method,
        paid_at: o.paid_at,
        event_name: o.events?.name ?? "",
        event_slug: o.events?.slug ?? "",
        tickets: ((tickets ?? []) as TicketRow[]).map((t) => ({
          id: t.id,
          hash: t.hash,
          status: t.status,
          ticket_type_name: t.ticket_types?.name ?? "",
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Error", 500);
  }
});

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
