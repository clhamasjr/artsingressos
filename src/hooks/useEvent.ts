import { useQuery } from '@tanstack/react-query';
import { supabase, type Tables } from '@/lib/supabase';

export type EventWithLots = Tables<'events'> & {
  ticket_types: Tables<'ticket_types'>[];
};

/** Busca evento publicado pelo slug, com lotes ativos */
export function useEvent(slug: string | undefined) {
  return useQuery({
    queryKey: ['event', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<EventWithLots | null> => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from('events')
        .select('*, ticket_types(*)')
        .eq('slug', slug)
        .eq('status', 'publicado')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // Ordena lotes por position
      const lots = [...(data.ticket_types ?? [])].sort((a, b) => a.position - b.position);
      return { ...data, ticket_types: lots };
    },
  });
}
