import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

export default function AdminLogin() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limpa erros quando digita
  useEffect(() => {
    if (error) setError(null);
  }, [email, error]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (session) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o link');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao site
        </Link>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white font-bold">
              A
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Arts Ingressos</h1>
              <p className="text-xs text-slate-500">Painel administrativo</p>
            </div>
          </div>

          {sent ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="font-semibold text-slate-900">Confira seu e-mail</h2>
              <p className="mt-2 text-sm text-slate-600">
                Enviamos um link mágico para{' '}
                <span className="font-medium text-slate-900">{email}</span>. Clique para
                entrar.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail('');
                }}
                className="mt-4 text-sm text-brand-600 hover:underline"
              >
                Tentar com outro e-mail
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Seu e-mail
                </label>
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

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={sending || !email} className="w-full btn-primary">
                {sending ? (
                  <>
                    <Spinner className="h-4 w-4 text-white" /> Enviando...
                  </>
                ) : (
                  'Enviar link mágico'
                )}
              </button>

              <p className="text-xs text-slate-500 text-center">
                Você receberá um link no seu e-mail. Sem senha, sem complicação.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
