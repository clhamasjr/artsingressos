import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, AlertCircle, Ticket, ArrowRight } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL } from '@/lib/utils';
import { trackPurchase } from '@/lib/pixels';

interface OrderResponse {
  id: string;
  status: 'pendente' | 'pago' | 'falhou' | 'expirado' | 'cancelado' | 'estornado';
  total_cents: number;
  event_name: string;
  event_slug: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  payment_method: 'pix' | 'credit_card' | 'debit_card' | null;
  paid_at: string | null;
  tickets: Array<{
    id: string;
    hash: string;
    ticket_type_name: string;
    status: string;
  }>;
}

export default function OrderStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let canceled = false;
    const fetchOrder = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-order?id=${orderId}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        });
        const json = (await res.json()) as OrderResponse | { error: string };
        if (canceled) return;
        if (!res.ok || 'error' in json) {
          setError('error' in json ? json.error : 'Pedido não encontrado');
        } else {
          setOrder(json);
        }
      } catch (e) {
        if (!canceled) setError(e instanceof Error ? e.message : 'Erro ao carregar pedido');
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    fetchOrder();
    return () => {
      canceled = true;
    };
  }, [orderId]);

  // Dispara Purchase no Meta/TikTok quando pedido carrega como pago (1x)
  const [purchaseTracked, setPurchaseTracked] = useState(false);
  useEffect(() => {
    if (order && order.status === 'pago' && !purchaseTracked) {
      trackPurchase({
        value: order.total_cents / 100,
        currency: 'BRL',
        content_ids: [order.id],
        content_name: order.event_name,
        num_items: order.tickets.length,
        order_id: order.id,
      });
      setPurchaseTracked(true);
    }
  }, [order, purchaseTracked]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16 text-center">
        <Spinner className="h-8 w-8 mx-auto" />
        <p className="mt-3 text-slate-500">Carregando seu pedido...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title="Pedido não encontrado"
          description={error ?? 'Não foi possível localizar esse pedido.'}
          action={<Link to="/" className="btn-primary">Voltar ao início</Link>}
        />
      </div>
    );
  }

  const isPaid = order.status === 'pago';
  const isPending = order.status === 'pendente';
  const isFailed = ['falhou', 'expirado', 'cancelado'].includes(order.status);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      {/* Status header */}
      <div className="card text-center">
        {isPaid && (
          <>
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Pagamento confirmado!</h1>
            <p className="mt-2 text-slate-600">
              Seus ingressos foram enviados para o seu WhatsApp e e-mail.
            </p>
          </>
        )}

        {isPending && (
          <>
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Aguardando pagamento</h1>
            <p className="mt-2 text-slate-600">
              Conclua o pagamento para liberar seu voucher.
            </p>
          </>
        )}

        {isFailed && (
          <>
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Pedido {order.status}</h1>
            <p className="mt-2 text-slate-600">Tente realizar uma nova compra.</p>
            <Link to={`/evento/${order.event_slug}`} className="btn-primary mt-4">
              Tentar novamente
            </Link>
          </>
        )}
      </div>

      {/* Resumo */}
      <div className="card mt-4">
        <h2 className="font-semibold text-slate-900 mb-3">Resumo</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Evento" value={order.event_name} />
          <Row label="Comprador" value={order.buyer_name} />
          <Row label="E-mail" value={order.buyer_email} />
          <Row label="Pedido" value={order.id.slice(0, 8).toUpperCase()} mono />
          <Row label="Total" value={formatBRL(order.total_cents)} bold />
        </dl>
      </div>

      {/* Tickets */}
      {isPaid && order.tickets.length > 0 && (
        <div className="card mt-4">
          <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Seus ingressos ({order.tickets.length})
          </h2>
          <ul className="divide-y divide-slate-200">
            {order.tickets.map((t, i) => (
              <li key={t.id}>
                <Link
                  to={`/voucher/${t.hash}`}
                  className="flex items-center justify-between py-3 group"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      Ingresso {i + 1} - {t.ticket_type_name}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">{t.hash.slice(0, 16)}...</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-right ${mono ? 'font-mono' : ''} ${
          bold ? 'font-bold text-slate-900 text-base' : 'text-slate-900'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
