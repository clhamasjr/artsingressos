import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AdminStats {
  events_total: number;
  events_published: number;
  orders_today: number;
  orders_today_revenue_cents: number;
  orders_total_paid: number;
  tickets_sold_total: number;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async (): Promise<AdminStats> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const iso = todayStart.toISOString();

      const [eventsTotal, eventsPub, ordersToday, ordersPaid, ticketsSold] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'publicado'),
        supabase
          .from('orders')
          .select('total_cents', { count: 'exact' })
          .eq('status', 'pago')
          .gte('paid_at', iso),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pago'),
        supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'cancelado'),
      ]);

      const revenue = (ordersToday.data ?? []).reduce(
        (s, o) => s + (o as { total_cents: number }).total_cents,
        0
      );

      return {
        events_total: eventsTotal.count ?? 0,
        events_published: eventsPub.count ?? 0,
        orders_today: ordersToday.count ?? 0,
        orders_today_revenue_cents: revenue,
        orders_total_paid: ordersPaid.count ?? 0,
        tickets_sold_total: ticketsSold.count ?? 0,
      };
    },
  });
}
