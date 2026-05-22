import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonError("Method not allowed", 405);

  try {
    const url = new URL(req.url);
    const hash = url.searchParams.get("hash");
    if (!hash || hash.length < 32 || !/^[0-9a-f]+$/i.test(hash)) {
      return jsonError("Invalid hash", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ticket, error } = await supabase
      .from("tickets")
      .select("hash, status, used_at, ticket_types(name), orders(buyer_name, buyer_cpf), events(name, starts_at, location_name, location_address)")
      .eq("hash", hash)
      .maybeSingle();

    if (error || !ticket) return jsonError("Voucher not found", 404);

    const t = ticket as unknown as {
      hash: string;
      status: string;
      used_at: string | null;
      ticket_types: { name: string } | null;
      orders: { buyer_name: string; buyer_cpf: string } | null;
      events: { name: string; starts_at: string; location_name: string | null; location_address: string | null } | null;
    };

    const cpf = t.orders?.buyer_cpf ?? "";
    const cpfMasked = cpf.length === 11
      ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}`
      : "***";

    return new Response(
      JSON.stringify({
        hash: t.hash,
        status: t.status,
        ticket_type_name: t.ticket_types?.name ?? "",
        buyer_name: t.orders?.buyer_name ?? "",
        buyer_cpf_masked: cpfMasked,
        event_name: t.events?.name ?? "",
        event_starts_at: t.events?.starts_at ?? "",
        event_location_name: t.events?.location_name ?? null,
        event_location_address: t.events?.location_address ?? null,
        used_at: t.used_at,
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
