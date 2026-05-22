import { useQuery } from '@tanstack/react-query';
import { supabase, type Tables } from '@/lib/supabase';

export type PublicEvent = Tables<'events'>;

/** Lista todos eventos publicados, ordenados pela data de início */
export function useEvents() {
  return useQuery({
    queryKey: ['events', 'published'],
    queryFn: async (): Promise<PublicEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'publicado')
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
