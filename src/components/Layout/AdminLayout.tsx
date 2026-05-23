import { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Receipt, LogOut, ScanLine, Activity, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

interface AdminLayoutProps {
  children: ReactNode;
  /** Quando true, exige role 'admin'. Operator vê 'Acesso negado'. Default: false (admin OU operator). */
  requireAdmin?: boolean;
}

export function AdminLayout({ children, requireAdmin = false }: AdminLayoutProps) {
  const { loading, session, isAdmin, isOperator, user, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  }

  if (!isOperator) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900">Acesso negado</h1>
          <p className="mt-2 text-slate-600">
            Sua conta não tem permissão para acessar o admin.
          </p>
          <button onClick={signOut} className="mt-4 btn-secondary">
            Sair
          </button>
        </div>
      </div>
    );
  }

  // Rota exige admin mas user é só operator
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900">Acesso restrito</h1>
          <p className="mt-2 text-slate-600">
            Esta área é apenas para administradores. Como operador, você pode usar o Check-in e a Contagem.
          </p>
          <a href="/admin/checkin" className="mt-4 inline-block btn-primary">
            Ir para Check-in
          </a>
        </div>
      </div>
    );
  }

  const navItems: Array<{ to: string; icon: typeof LayoutDashboard; label: string; exact?: boolean; adminOnly?: boolean }> = [
    { to: '/admin', icon: LayoutDashboard, label: 'Painel', exact: true, adminOnly: true },
    { to: '/admin/eventos', icon: Calendar, label: 'Eventos', adminOnly: true },
    { to: '/admin/pedidos', icon: Receipt, label: 'Pedidos', adminOnly: true },
    { to: '/admin/checkin', icon: ScanLine, label: 'Check-in' },
    { to: '/admin/contagem', icon: Activity, label: 'Contagem' },
    { to: '/admin/operadores', icon: Users, label: 'Operadores', adminOnly: true },
  ];

  const isActive = (to: string, exact = false) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0">
        <div className="p-4 flex items-center gap-2 border-b border-slate-200">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-sm">A</span>
          <div>
            <p className="text-sm font-bold text-slate-900">Arts Ingressos</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Admin</p>
          </div>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:block p-3 mt-auto border-t border-slate-200">
          <div className="px-3 py-2 text-xs text-slate-500">
            <p className="truncate font-medium text-slate-700">{user?.email}</p>
            <p className="capitalize">{isAdmin ? 'Admin' : 'Operador'}</p>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
