import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white font-bold shadow-sm">
              A
            </span>
            <span className="text-lg font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
              Arts Ingressos
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-slate-600 hover:text-brand-600 transition-colors">
              Eventos
            </Link>
            <Link
              to="/admin"
              className="text-slate-500 hover:text-slate-900 transition-colors"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Arts Ingressos. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <Link to="/termos" className="hover:text-slate-900">Termos</Link>
            <Link to="/privacidade" className="hover:text-slate-900">Privacidade</Link>
            <a href="mailto:contato@artsingressos.com" className="hover:text-slate-900">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
