import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Minus, Plus, ShoppingCart, CheckCircle2, RotateCcw, Banknote, Smartphone, CreditCard } from 'lucide-react';
import { supabase, type Tables } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { formatBRL } from '@/lib/utils';

type Lot = Tables<'ticket_types'>;
type Method = 'dinheiro' | 'pix_manual' | 'cartao_maquininha';

interface SoldTicket {
  hash: string;
  ticket_type_name: string;
  qr_data_url?: string;
}

export default function AdminPdv() {
  const [eventId, setEventId] = useState<string>('');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [method, setMethod] = useState<Method>('dinheiro');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ order_id: string; total_cents: number; tickets: SoldTicket[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['admin', 'pdv', 'events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'publicado')
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!eventId && events && events.length > 0) setEventId(events[0].id);
  }, [events, eventId]);

  const { data: lots, isLoading: lotsLoading } = useQuery({
    queryKey: ['admin', 'pdv', 'lots', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('event_id', eventId)
        .eq('active', true)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalCents = useMemo(() => {
    if (!lots) return 0;
    return lots.reduce((s, lot) => s + (qtys[lot.id] ?? 0) * lot.price_cents, 0);
  }, [lots, qtys]);
  const totalQty = useMemo(
    () => Object.values(qtys).reduce((s, q) => s + (q ?? 0), 0),
    [qtys]
  );

  const updateQty = (lotId: string, delta: number, max: number) => {
    setQtys((prev) => {
      const cur = prev[lotId] ?? 0;
      const next = Math.max(0, Math.min(max, cur + delta));
      if (next === 0) {
        const { [lotId]: _x, ...rest } = prev;
        return rest;
      }
      return { ...prev, [lotId]: next };
    });
  };

  const handleSale = async () => {
    setError(null);
    if (totalQty === 0) {
      setError('Adicione pelo menos 1 ingresso');
      return;
    }
    setSubmitting(true);
    try {
      const items = Object.entries(qtys).map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));
      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-pos-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          event_id: eventId,
          items,
          buyer_name: buyerName.trim() || undefined,
          buyer_phone: buyerPhone.replace(/\D/g, '') || undefined,
          payment_method: method,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao registrar venda');

      // Gera QR Code de cada ticket pra exibir na tela
      const ticketsWithQR: SoldTicket[] = await Promise.all(
        (json.tickets as SoldTicket[]).map(async (t) => ({
          ...t,
          qr_data_url: await QRCode.toDataURL(t.hash, { width: 280, margin: 1, errorCorrectionLevel: 'H' }),
        }))
      );
      setResult({ order_id: json.order_id, total_cents: json.total_cents, tickets: ticketsWithQR });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setResult(null);
    setQtys({});
    setBuyerName('');
    setBuyerPhone('');
    setMethod('dinheiro');
    setError(null);
  };

  if (eventsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="h-6 w-6" />}
        title="Nenhum evento publicado"
        description="Publique um evento em /admin/eventos pra usar o PDV."
      />
    );
  }

  // Resultado da venda — mostra QR Codes
  if (result) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="card bg-emerald-50 border-emerald-200 border-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xl font-bold text-emerald-900">Venda confirmada!</p>
              <p className="text-sm text-emerald-800">
                {result.tickets.length} ingresso(s) · {formatBRL(result.total_cents)} · #{result.order_id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600 text-center">
          Peça pro cliente fotografar cada QR Code abaixo (ou anote os hashes).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {result.tickets.map((t, i) => (
            <div key={t.hash} className="card text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Ingresso {i + 1}</p>
              <p className="font-semibold text-slate-900 mb-3">{t.ticket_type_name}</p>
              {t.qr_data_url && (
                <img src={t.qr_data_url} alt="QR" className="mx-auto" width={240} height={240} />
              )}
              <p className="mt-2 text-[10px] text-slate-400 font-mono break-all">{t.hash}</p>
            </div>
          ))}
        </div>

        <button onClick={reset} className="w-full btn-primary">
          <RotateCcw className="h-4 w-4" /> Nova venda
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">PDV — Venda no balcão</h1>
          <p className="text-sm text-slate-600">Cobre o cliente, confirme o método e gere os ingressos.</p>
        </div>
        {events.length > 1 && (
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="input max-w-xs">
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      {/* Lotes */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3">Ingressos</h2>
        {lotsLoading && <Skeleton className="h-24 w-full" />}
        {lots && lots.length === 0 && (
          <p className="text-sm text-slate-500 py-4">Nenhum lote ativo neste evento.</p>
        )}
        {lots && lots.length > 0 && (
          <div className="space-y-3">
            {lots.map((lot: Lot) => {
              const available = Math.max(0, lot.qty_total - lot.qty_sold);
              const cur = qtys[lot.id] ?? 0;
              const max = Math.min(available, 50);
              const soldOut = available === 0;
              return (
                <div key={lot.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${soldOut ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{lot.name}</p>
                    <p className="text-sm text-slate-500">
                      {formatBRL(lot.price_cents)}
                      {' · '}
                      {soldOut ? <span className="text-red-600 font-medium">Esgotado</span> : <span>{available} disponíveis</span>}
                    </p>
                  </div>
                  {!soldOut && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => updateQty(lot.id, -1, max)} disabled={cur === 0}
                        className="h-10 w-10 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className="w-8 text-center text-lg font-semibold tabular-nums">{cur}</span>
                      <button onClick={() => updateQty(lot.id, 1, max)} disabled={cur >= max}
                        className="h-10 w-10 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cliente (opcional) */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-1">Cliente (opcional)</h2>
        <p className="text-xs text-slate-500 mb-3">Se informar WhatsApp, o cliente recebe o voucher por mensagem.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nome (opcional)" className="input" />
          <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="WhatsApp (opcional)" className="input" inputMode="tel" />
        </div>
      </div>

      {/* Método */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3">Forma de pagamento recebida</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MethodBtn active={method === 'dinheiro'} onClick={() => setMethod('dinheiro')} icon={<Banknote className="h-5 w-5" />} label="Dinheiro" />
          <MethodBtn active={method === 'pix_manual'} onClick={() => setMethod('pix_manual')} icon={<Smartphone className="h-5 w-5" />} label="Pix (manual)" />
          <MethodBtn active={method === 'cartao_maquininha'} onClick={() => setMethod('cartao_maquininha')} icon={<CreditCard className="h-5 w-5" />} label="Cartão (maquininha)" />
        </div>
      </div>

      {/* Total + ação */}
      <div className="card sticky bottom-4">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-slate-600">Total ({totalQty} {totalQty === 1 ? 'ingresso' : 'ingressos'})</span>
          <span className="text-3xl font-bold text-slate-900 tabular-nums">{formatBRL(totalCents)}</span>
        </div>
        {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        <button onClick={handleSale} disabled={submitting || totalQty === 0} className="w-full btn-primary text-lg !py-3">
          {submitting ? <><Spinner className="h-5 w-5 text-white" /> Processando...</> : <><CheckCircle2 className="h-5 w-5" /> Recebi o pagamento — gerar ingressos</>}
        </button>
      </div>
    </div>
  );
}

function MethodBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 font-medium transition-colors ${
        active ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-700 hover:border-brand-300'
      }`}
    >
      {icon} {label}
    </button>
  );
}
