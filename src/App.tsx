import { Routes, Route, Link } from 'react-router-dom';

function Home() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-brand-600">
            Arts Ingressos
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link to="/admin" className="hover:text-brand-600">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="card text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Arts Ingressos
          </h1>
          <p className="mt-3 text-slate-600">
            Plataforma em construção. Os primeiros eventos aparecerão aqui em breve.
          </p>
        </div>
      </main>

      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Arts Ingressos
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-300">404</h1>
        <p className="mt-2 text-slate-600">Página não encontrada.</p>
        <Link to="/" className="mt-6 inline-block btn-primary">
          Voltar
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
