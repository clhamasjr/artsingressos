import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, MapPin, Minus, Plus, AlertCircle } from 'lucide-react';
import { useEvent } from '@/hooks/useEvent';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL } from '@/lib/utils';
import { formatEventDate } from '@/lib/date';

export interface HolderInput {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  /** true = ingresso usa dados do comprador (criança, etc) */
  same_as_buyer: boolean;
}

export interface CheckoutItem {
  ticket_type_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
}

export interface CheckoutState {
  eventId: string;
  eventName: string;
  eventSlug: string;
  items: CheckoutItem[];
  totalCents: number;
}

const MAX_PER_LOT = 6;

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useEvent(slug);

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const items = useMemo<CheckoutItem[]>(() => {
    if (!data) return [];
    return data.ticket_types
      .filter((tt) => (quantities[tt.id] ?? 0) > 0)
      .map((tt) => ({
        ticket_type_id: tt.id,
        name: tt.name,
        unit_price_cents: tt.price_cents,
        quantity: quantities[tt.id]!,
      }));
  }, [data, quantities]);

  const totalCents = useMemo(
    () => items.reduce((sum, it) => sum + it.unit_price_cents * it.quantity, 0),
    [items]
  );

  const totalQuantity = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity, 0),
    [items]
  );

  if (isLoading) return <EventDetailSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <EmptyState
          title="Erro ao carregar evento"
          description="Tente novamente em alguns instantes."
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title="Evento não encontrado"
          description="Esse evento não existe ou foi removido."
        />
      </div>
    );
  }

  const handleQty = (lotId: string, delta: number, max: number) => {
    setQuantities((prev) => {
      const current = prev[lotId] ?? 0;
      const next = Math.max(0, Math.min(max, current + delta));
      if (next === 0) {
        const { [lotId]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [lotId]: next };
    });
  };

  const handleContinue = () => {
    if (!data || items.length === 0) return;
    const state: CheckoutState = {
      eventId: data.id,
      eventName: data.name,
      eventSlug: data.slug,
      items,
      totalCents,
    };
    navigate('/checkout', { state });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      {/* Banner */}
      <div className="aspect-[21/9] w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 mb-6">
        {data.banner_url ? (
          <img src={data.banner_url} alt={data.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white font-bold text-3xl sm:text-5xl text-center px-6">
            {data.name}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{data.name}</h1>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                {formatEventDate(data.starts_at)}
              </span>
              {data.location_name && (
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {data.location_name}
                </span>
              )}
            </div>
          </div>

          {data.description && (
            <div className="card">
              <h2 className="font-semibold text-slate-900 mb-2">Sobre o evento</h2>
              <p className="text-slate-600 whitespace-pre-line">{data.description}</p>
            </div>
          )}

          {data.location_address && (
            <div className="card">
              <h2 className="font-semibold text-slate-900 mb-2">Local</h2>
              <p className="text-slate-700 font-medium">{data.location_name}</p>
              <p className="text-slate-500 text-sm">{data.location_address}</p>
            </div>
          )}
        </div>

        {/* Coluna lotes */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-20 space-y-4">
            <div className="card">
              <h2 className="font-semibold text-slate-900 mb-4">Ingressos</h2>

              <div className="space-y-3">
                {data.ticket_types.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhum lote disponível.</p>
                )}

                {data.ticket_types.map((tt) => {
                  const available = Math.max(0, tt.qty_total - tt.qty_sold);
                  const sold_out = available === 0;
                  const currentQty = quantities[tt.id] ?? 0;
                  const maxAllowed = Math.min(available, MAX_PER_LOT);

                  return (
                    <div
                      key={tt.id}
                      className={`rounded-lg border p-3 ${
                        sold_out ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{tt.name}</p>
                          {tt.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{tt.description}</p>
                          )}
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {formatBRL(tt.price_cents)}
                          </p>
                          {sold_out ? (
                            <span className="text-xs text-red-600 font-medium">Esgotado</span>
                          ) : available <= 10 ? (
                            <span className="text-xs text-amber-600">Últimas {available} unidades</span>
                          ) : null}
                        </div>

                        {!sold_out && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQty(tt.id, -1, maxAllowed)}
                              disabled={currentQty === 0}
                              className="h-8 w-8 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="Diminuir"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-6 text-center font-medium tabular-nums">{currentQty}</span>
                            <button
                              type="button"
                              onClick={() => handleQty(tt.id, 1, maxAllowed)}
                              disabled={currentQty >= maxAllowed}
                              className="h-8 w-8 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="Aumentar"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Resumo */}
              {totalQuantity > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-sm text-slate-600">
                      {totalQuantity} {totalQuantity === 1 ? 'ingresso' : 'ingressos'}
                    </span>
                    <span className="text-xl font-bold text-slate-900">{formatBRL(totalCents)}</span>
                  </div>
                  <button onClick={handleContinue} className="w-full btn-primary">
                    Continuar
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 text-center">
              Pagamento seguro via Pix ou Cartão. Voucher enviado por WhatsApp e e-mail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <Skeleton className="aspect-[21/9] w-full rounded-xl mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="lg:col-span-1">
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    </div>
  );
}
