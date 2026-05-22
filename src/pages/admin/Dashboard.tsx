import { Link } from 'react-router-dom';
import { Calendar, Receipt, Ticket, TrendingUp, ArrowRight } from 'lucide-react';
import { useAdminStats } from '@/hooks/useAdminStats';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatBRL } from '@/lib/utils';

export default function AdminDashboard() {
  const { data, isLoading } = useAdminStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Painel</h1>
        <p className="text-sm text-slate-600">Visão geral de vendas e eventos.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Receita hoje"
          value={isLoading ? null : formatBRL(data?.orders_today_revenue_cents ?? 0)}
          accent="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5" />}
          label="Pedidos hoje"
          value={isLoading ? null : String(data?.orders_today ?? 0)}
          accent="bg-blue-50 text-blue-700"
        />
        <KpiCard
          icon={<Calendar className="h-5 w-5" />}
          label="Eventos publicados"
          value={isLoading ? null : `${data?.events_published ?? 0} / ${data?.events_total ?? 0}`}
          accent="bg-amber-50 text-amber-700"
        />
        <KpiCard
          icon={<Ticket className="h-5 w-5" />}
          label="Ingressos vendidos"
          value={isLoading ? null : String(data?.tickets_sold_total ?? 0)}
          accent="bg-purple-50 text-purple-700"
        />
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ActionCard
          to="/admin/eventos"
          icon={<Calendar className="h-5 w-5" />}
          title="Gerenciar eventos"
          description="Crie e edite eventos, lotes e preços"
        />
        <ActionCard
          to="/admin/pedidos"
          icon={<Receipt className="h-5 w-5" />}
          title="Acompanhar pedidos"
          description="Consulte e reenvie vouchers"
        />
      </div>
    </div>
  );
}

function KpiCard({
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

function ActionCard({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="card flex items-center gap-4 group hover:shadow-md transition-shadow"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-brand-600 transition-colors" />
    </Link>
  );
}
