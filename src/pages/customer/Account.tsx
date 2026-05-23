import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User, LogOut, Ticket, Calendar, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL, formatCPF } from '@/lib/utils';
import { formatShort } from '@/lib/date';

interface OrderRow {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  payment_method: string | null;
  events: { name: string; slug: string; starts_at: string } | null;
}

export default function CustomerAccount() {
  const { customer, isCustomer, loading, signOut, user } = useAuth();
  const navigate = useNavigate();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['customer', 'orders', customer?.id],
    enabled: Boolean(customer?.id),
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total_cents, created_at, paid_at, payment_method, events(name, slug, starts_at)')
        .eq('customer_id', customer!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!isCustomer) {
    return <Navigate to="/conta/login" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Minha conta</h1>
          <p className="text-sm text-slate-600">Olá, {customer?.name?.split(' ')[0] ?? user?.email}!</p>
        </div>
        <button onClick={handleSignOut} className="btn-secondary">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>

      {/* Perfil */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <User className="h-4 w-4" /> Seus dados
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Nome</dt>
            <dd className="text-slate-900 font-medium">{customer?.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">E-mail</dt>
            <dd className="text-slate-900">{customer?.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">WhatsApp</dt>
            <dd className="text-slate-900">{customer?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">CPF</dt>
            <dd className="text-slate-900 font-mono">
              {customer?.cpf ? formatCPF(customer.cpf) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Meus pedidos */}
      <div>
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Ticket className="h-4 w-4" /> Meus pedidos
        </h2>

        {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}

        {!isLoading && orders && orders.length === 0 && (
          <EmptyState
            icon={<Ticket className="h-6 w-6" />}
            title="Nenhum pedido ainda"
            description="Compre seu primeiro ingresso pra começar."
            action={<Link to="/" className="btn-primary">Ver eventos</Link>}
          />
        )}

        {!isLoading && orders && orders.length > 0 && (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/pedido/${o.id}`}
                  className="card flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="font-semibold text-slate-900 truncate">{o.events?.name ?? '—'}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {o.events?.starts_at ? formatShort(o.events.starts_at) : '—'}
                      </span>
                      <span>· Pedido em {formatShort(o.created_at)}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">{formatBRL(o.total_cents)}</p>
                    <p className="text-xs text-slate-500 capitalize">
                      {o.payment_method?.replace('_', ' ') ?? ''}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pago: { label: 'Pago', cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="h-3 w-3" /> },
    pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700', icon: <Clock className="h-3 w-3" /> },
    falhou: { label: 'Falhou', cls: 'bg-red-100 text-red-700', icon: <XCircle className="h-3 w-3" /> },
    expirado: { label: 'Expirado', cls: 'bg-slate-100 text-slate-500', icon: <XCircle className="h-3 w-3" /> },
    cancelado: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500', icon: <XCircle className="h-3 w-3" /> },
    estornado: { label: 'Estornado', cls: 'bg-purple-100 text-purple-700', icon: <XCircle className="h-3 w-3" /> },
  };
  const c = cfg[status] ?? { label: status, cls: 'bg-slate-100', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}
