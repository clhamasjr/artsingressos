import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

export default function CustomerLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isCustomer, loading: authLoading } = useAuth();
  const next = params.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentReset, setSentReset] = useState(false);

  useEffect(() => {
    if (!authLoading && isCustomer) navigate(next, { replace: true });
  }, [authLoading, isCustomer, navigate, next]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (err) throw err;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      if (msg.toLowerCase().includes('invalid login')) {
        setError('E-mail ou senha incorretos.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onForgot = async () => {
    if (!email) {
      setError('Digite seu e-mail acima primeiro.');
      return;
    }
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/conta/recuperar`,
      });
      if (err) throw err;
      setSentReset(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar e-mail de recuperação');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 mb-6">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <LogIn className="h-6 w-6 text-brand-600" />
            <h1 className="text-lg font-bold text-slate-900">Entrar</h1>
          </div>

          {sentReset ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-700">
                Enviamos um link para <strong>{email}</strong>. Confira sua caixa e clique pra redefinir a senha.
              </p>
              <button onClick={() => setSentReset(false)} className="mt-4 text-sm text-brand-600 hover:underline">
                Voltar
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="voce@email.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
              )}

              <button type="submit" disabled={submitting || !email || !password} className="w-full btn-primary">
                {submitting ? <><Spinner className="h-4 w-4 text-white" /> Entrando...</> : 'Entrar'}
              </button>

              <button type="button" onClick={onForgot} className="w-full text-sm text-slate-600 hover:text-brand-600">
                Esqueci minha senha
              </button>
            </form>
          )}
        </div>

        {!sentReset && (
          <p className="mt-4 text-sm text-slate-600 text-center">
            Ainda não tem conta?{' '}
            <Link to={`/conta/cadastro${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-brand-600 font-medium hover:underline">
              Criar conta
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
