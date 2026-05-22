import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/utils';
import { formatShort } from '@/lib/date';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface OrderRow {
  id: string;
  status: string;
  total_cents: number;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  events: { name: string } | null;
}

export default function AdminOrders() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orders', search],
    queryFn: async (): Promise<OrderRow[]> => {
      let q = supabase
        .from('orders')
        .select('id, status, total_cents, buyer_name, buyer_email, buyer_phone, payment_method, created_at, paid_at, events(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (search.trim()) {
        const term = search.trim();
        q = q.or(
          `buyer_name.ilike.%${term}%,buyer_email.ilike.%${term}%,buyer_cpf.ilike.%${term.replace(/\D/g, '')}%`
        );
      }
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []) as unknown as OrderRow[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
        <p className="text-sm text-slate-600">Últimos 100 pedidos.</p>
      </div>

      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou CPF..."
            className="input pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="Nenhum pedido"
          description={search ? 'Nenhum resultado para essa busca.' : 'Ainda não há pedidos no sistema.'}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Comprador</th>
                <th className="py-2 px-3">Evento</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3">Pagamento</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 pl-3 text-right">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-3">
                    <p className="font-medium text-slate-900">{o.buyer_name}</p>
                    <p className="text-xs text-slate-500">{o.buyer_email}</p>
                  </td>
                  <td className="py-3 px-3 text-slate-700">{o.events?.name ?? '-'}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium">
                    {formatBRL(o.total_cents)}
                  </td>
                  <td className="py-3 px-3 capitalize text-slate-700">
                    {o.payment_method?.replace('_', ' ') ?? '-'}
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-3 pl-3 text-right text-xs text-slate-500">
                    {formatShort(o.paid_at ?? o.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pago: 'bg-emerald-100 text-emerald-700',
    pendente: 'bg-amber-100 text-amber-700',
    falhou: 'bg-red-100 text-red-700',
    expirado: 'bg-slate-100 text-slate-500',
    cancelado: 'bg-slate-100 text-slate-500',
    estornado: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors[status] ?? 'bg-slate-100'}`}>
      {status}
    </span>
  );
}
