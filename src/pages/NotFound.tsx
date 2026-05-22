import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-7xl font-bold text-slate-300">404</h1>
        <p className="mt-2 text-slate-600">Página não encontrada.</p>
        <Link to="/" className="mt-6 inline-block btn-primary">
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
