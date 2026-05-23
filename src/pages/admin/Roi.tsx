import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, DollarSign, ShoppingBag, Target } from 'lucide-react';
import { supabase, type Tables } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL } from '@/lib/utils';

interface RoiStats {
  date_from: string;
  date_to: string;
  totals: {
    revenue_cents: number;
    spend_cents: number;
    conversions: number;
    impressions: number;
    clicks: number;
  };
  by_campaign: Array<{
    campaign: string;
    platform: string;
    spend_cents: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue_cents: number;
  }>;
  by_platform: Array<{ platform: string; spend_cents: number; impressions: number; clicks: number }>;
  daily: Array<{ day: string; revenue_cents: number; spend_cents: number }>;
}

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

export default function AdminRoi() {
  const [eventId, setEventId] = useState<string>('');
  const [from, setFrom] = useState<string>(monthAgo);
  const [to, setTo] = useState<string>(today);

  const { data: events } = useQuery({
    queryKey: ['admin', 'roi', 'events'],
    queryFn: async (): Promise<Tables<'events'>[]> => {
      const { data, error } = await supabase
        .from('events').select('*').order('starts_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'roi', eventId, from, to],
    queryFn: async (): Promise<RoiStats> => {
      const { data, error } = await (
        supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: RoiStats | null; error: { message: string } | null }>
      )('get_roi_stats', { p_event_id: eventId || null, p_date_from: from, p_date_to: to });
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  const t = stats?.totals;
  const roas = t && t.spend_cents > 0 ? (t.revenue_cents / t.spend_cents).toFixed(2) : '—';
  const cac = t && t.conversions > 0 ? formatBRL(Math.round(t.spend_cents / t.conversions)) : '—';
  const ticketMedio = t && t.conversions > 0 ? formatBRL(Math.round(t.revenue_cents / t.conversions)) : '—';
  const cpc = t && t.clicks > 0 ? formatBRL(Math.round(t.spend_cents / t.clicks)) : '—';
  const ctr = t && t.impressions > 0 ? `${((t.clicks / t.impressions) * 100).toFixed(2)}%` : '—';
  const convRate = t && t.clicks > 0 ? `${((t.conversions / t.clicks) * 100).toFixed(2)}%` : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard ROI</h1>
        <p className="text-sm text-slate-600">
          Cruza receita (vendas pagas) com gasto em ads, usando UTM como atribuição.
        </p>
      </div>

      {/* Filtros */}
      <div className="card grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Evento</label>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="input">
            <option value="">Todos eventos</option>
            {events?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </div>
        <div className="flex items-end">
          <p className="text-xs text-slate-500">
            {stats?.daily.length ?? 0} dias no período
          </p>
        </div>
      </div>

      {isLoading && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>}

      {!isLoading && stats && t && (t.revenue_cents > 0 || t.spend_cents > 0) ? (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi icon={<DollarSign className="h-5 w-5" />} label="Receita" value={formatBRL(t.revenue_cents)} accent="bg-emerald-50 text-emerald-700" />
            <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Gasto em ads" value={formatBRL(t.spend_cents)} accent="bg-blue-50 text-blue-700" />
            <Kpi icon={<Target className="h-5 w-5" />} label="ROAS" value={`${roas}x`}
              accent={t.spend_cents > 0 && (t.revenue_cents / t.spend_cents) >= 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} />
            <Kpi icon={<ShoppingBag className="h-5 w-5" />} label="Vendas" value={String(t.conversions)} accent="bg-purple-50 text-purple-700" />
          </div>

          {/* KPIs secundários */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Kpi label="CAC" value={cac} small />
            <Kpi label="Ticket médio" value={ticketMedio} small />
            <Kpi label="CPC" value={cpc} small />
            <Kpi label="CTR" value={ctr} small />
            <Kpi label="Conv. clique→venda" value={convRate} small />
          </div>

          {/* Por campanha */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-3">Por campanha</h2>
            {stats.by_campaign.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">Nenhuma campanha com gasto no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3">Campanha</th>
                      <th className="py-2 px-3">Plataforma</th>
                      <th className="py-2 px-3 text-right">Gasto</th>
                      <th className="py-2 px-3 text-right">Vendas</th>
                      <th className="py-2 px-3 text-right">Receita</th>
                      <th className="py-2 pl-3 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.by_campaign.map((c) => {
                      const r = c.spend_cents > 0 ? c.revenue_cents / c.spend_cents : 0;
                      return (
                        <tr key={`${c.platform}-${c.campaign}`}>
                          <td className="py-2 pr-3 font-medium text-slate-900">{c.campaign}</td>
                          <td className="py-2 px-3 text-slate-600 capitalize">{c.platform}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{formatBRL(c.spend_cents)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{c.conversions}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium">{formatBRL(c.revenue_cents)}</td>
                          <td className={`py-2 pl-3 text-right tabular-nums font-bold ${r >= 2 ? 'text-emerald-700' : r >= 1 ? 'text-amber-700' : 'text-red-700'}`}>
                            {r > 0 ? `${r.toFixed(2)}x` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Diário simples */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-3">Diário (Receita × Gasto)</h2>
            <DailyChart daily={stats.daily} />
          </div>
        </>
      ) : !isLoading ? (
        <EmptyState
          icon={<TrendingUp className="h-6 w-6" />}
          title="Sem dados no período"
          description="Cadastre seu gasto em /admin/ad-spend e faça vendas com UTM pra ver atribuição."
        />
      ) : null}
    </div>
  );
}

function Kpi({ icon, label, value, accent, small }: {
  icon?: React.ReactNode; label: string; value: string;
  accent?: string; small?: boolean;
}) {
  if (small) {
    return (
      <div className="card">
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

function DailyChart({ daily }: { daily: RoiStats['daily'] }) {
  if (!daily.length) return <p className="text-sm text-slate-500">Sem dados.</p>;
  const max = Math.max(...daily.flatMap((d) => [d.revenue_cents, d.spend_cents]), 1);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4 text-xs text-slate-600 mb-2">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-emerald-500 rounded" /> Receita</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-blue-500 rounded" /> Gasto</span>
      </div>
      {daily.map((d) => (
        <div key={d.day} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-slate-500 tabular-nums">{d.day.slice(5)}</span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="h-3 bg-slate-100 rounded overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${(d.revenue_cents / max) * 100}%` }} />
            </div>
            <div className="h-3 bg-slate-100 rounded overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${(d.spend_cents / max) * 100}%` }} />
            </div>
          </div>
          <span className="w-32 text-right tabular-nums text-slate-700">
            {formatBRL(d.revenue_cents)} / <span className="text-blue-700">{formatBRL(d.spend_cents)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
