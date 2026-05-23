import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, Users, Ticket, Activity } from 'lucide-react';
import { supabase, type Tables } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatShort } from '@/lib/date';

interface StatsResponse {
  totals: { sold: number; checked_in: number; cancelled: number; valid: number };
  by_ticket_type: Array<{
    id: string;
    name: string;
    qty_total: number;
    sold: number;
    checked_in: number;
  }>;
  recent_checkins: Array<{
    id: string;
    ts: string;
    result: 'ok' | 'ja_usado' | 'cancelado' | 'invalido';
    buyer_name: string | null;
    ticket_type_name: string | null;
    operator_email: string | null;
  }>;
  hourly_last_24h: Array<{ hour: string; count: number }>;
  last_hour_count: number;
}

const REFRESH_INTERVAL_MS = 5000;

export default function AdminContagem() {
  const [eventId, setEventId] = useState<string>('');

  // Lista eventos pro selector
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['admin', 'contagem', 'events'],
    queryFn: async (): Promise<Tables<'events'>[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .in('status', ['publicado', 'encerrado'])
        .order('starts_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Default: pega o evento mais próximo (primeiro publicado/encerrado)
  useEffect(() => {
    if (!eventId && events && events.length > 0) {
      setEventId(events[0].id);
    }
  }, [events, eventId]);

  // Stats com polling
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'contagem', 'stats', eventId],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<StatsResponse> => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: StatsResponse | null; error: { message: string } | null }>
      )('get_event_checkin_stats', { p_event_id: eventId });
      if (error) throw new Error(error.message);
      return data!;
    },
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const selectedEvent = events?.find((e) => e.id === eventId);

  if (eventsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-6 w-6" />}
        title="Nenhum evento publicado"
        description="Publique um evento em /admin/eventos pra ver estatísticas aqui."
      />
    );
  }

  const sold = stats?.totals.sold ?? 0;
  const checked = stats?.totals.checked_in ?? 0;
  const pct = sold > 0 ? Math.round((checked / sold) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contagem ao vivo</h1>
          <p className="text-sm text-slate-600">
            Atualiza a cada {REFRESH_INTERVAL_MS / 1000}s. Eventos publicados e encerrados.
          </p>
        </div>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="input max-w-xs"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} {e.status === 'encerrado' ? '(encerrado)' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedEvent && (
        <p className="text-xs text-slate-500">
          📍 {selectedEvent.location_name ?? 'Local não definido'} ·{' '}
          {formatShort(selectedEvent.starts_at)}
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<Ticket className="h-5 w-5" />}
          label="Ingressos vendidos"
          value={statsLoading ? null : String(sold)}
          accent="bg-blue-50 text-blue-700"
        />
        <Kpi
          icon={<Users className="h-5 w-5" />}
          label="Já entraram"
          value={statsLoading ? null : String(checked)}
          accent="bg-emerald-50 text-emerald-700"
        />
        <Kpi
          icon={<Activity className="h-5 w-5" />}
          label="Ocupação"
          value={statsLoading ? null : `${pct}%`}
          accent="bg-purple-50 text-purple-700"
        />
        <Kpi
          icon={<TrendingUp className="h-5 w-5" />}
          label="Última hora"
          value={statsLoading ? null : String(stats?.last_hour_count ?? 0)}
          accent="bg-amber-50 text-amber-700"
        />
      </div>

      {/* Progresso geral */}
      {stats && sold > 0 && (
        <div className="card">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-semibold text-slate-900">Progresso geral</span>
            <span className="text-sm text-slate-500">
              {checked} / {sold}
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Por lote */}
      {stats && stats.by_ticket_type.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4">Por tipo de ingresso</h2>
          <div className="space-y-3">
            {stats.by_ticket_type.map((lot) => {
              const lotPct = lot.sold > 0 ? Math.round((lot.checked_in / lot.sold) * 100) : 0;
              return (
                <div key={lot.id}>
                  <div className="flex items-baseline justify-between mb-1 text-sm">
                    <span className="font-medium text-slate-900">{lot.name}</span>
                    <span className="text-slate-500">
                      <span className="font-semibold text-emerald-700">{lot.checked_in}</span>{' '}
                      / {lot.sold} entraram ({lot.qty_total} vendíveis)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${lotPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Últimas leituras */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Últimas leituras
          {stats && (
            <span className="text-xs text-slate-500 font-normal">
              · atualizando ao vivo
            </span>
          )}
        </h2>
        {stats && stats.recent_checkins.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            Nenhuma leitura ainda. Aguardando o primeiro check-in.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats?.recent_checkins.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center gap-3">
                {c.result === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                {c.result === 'ja_usado' && (
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                {(c.result === 'cancelado' || c.result === 'invalido') && (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {c.buyer_name ?? '(inválido)'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {c.ticket_type_name ?? '—'} · {c.operator_email ?? 'sem operador'}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatShort(c.ts).slice(11)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  accent: string;
}) {
  return (
    <div className="card">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>
      <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">{label}</p>
      {value === null ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      )}
    </div>
  );
}
