import { useEffect, useState, forwardRef } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ShieldCheck, Smartphone, CreditCard, User } from 'lucide-react';
import type { CheckoutState } from './EventDetail';
import { formatBRL, formatCPF } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const checkoutSchema = z.object({
  payment_method: z.enum(['pix', 'credit_card']),
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os termos' }),
  }),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

// Persiste estado da intenção de compra durante login/cadastro
const CHECKOUT_INTENT_KEY = 'checkout_intent_v1';

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customer, isCustomer, loading: authLoading } = useAuth();

  // Resolve estado: prioriza location.state, depois sessionStorage (vindo de login)
  const [state] = useState<CheckoutState | null>(() => {
    const fromLocation = (location.state ?? null) as CheckoutState | null;
    if (fromLocation?.items?.length) {
      try {
        sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(fromLocation));
      } catch { /* ignore */ }
      return fromLocation;
    }
    try {
      const raw = sessionStorage.getItem(CHECKOUT_INTENT_KEY);
      if (raw) return JSON.parse(raw) as CheckoutState;
    } catch { /* ignore */ }
    return null;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      payment_method: 'pix',
    },
  });

  const onInvalid = (errs: typeof errors) => {
    const missing: string[] = [];
    if (errs.payment_method) missing.push('Forma de pagamento');
    if (errs.accept_terms) missing.push('Aceite dos Termos');
    setError(`Confira: ${missing.join(', ')}`);
  };

  // Se não veio estado de checkout, redireciona pra home
  useEffect(() => {
    if (!state || !state.items || state.items.length === 0) {
      const t = setTimeout(() => navigate('/', { replace: true }), 100);
      return () => clearTimeout(t);
    }
  }, [state, navigate]);

  // Se não está logado como customer, força login
  useEffect(() => {
    if (!authLoading && state && !isCustomer) {
      navigate(`/conta/login?next=${encodeURIComponent('/checkout')}`, { replace: true });
    }
  }, [authLoading, isCustomer, state, navigate]);

  if (!state || state.items.length === 0) {
    return <Navigate to="/" replace />;
  }

  if (authLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isCustomer || !customer) {
    return null; // useEffect já está redirecionando
  }

  const onSubmit = async (data: CheckoutForm) => {
    setError(null);
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-order`;
      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;

      const body = {
        event_id: state.eventId,
        items: state.items.map((i) => ({
          ticket_type_id: i.ticket_type_id,
          quantity: i.quantity,
        })),
        // Dados do comprador vêm do customer (sem precisar form)
        buyer_name: customer.name,
        buyer_email: customer.email,
        buyer_phone: (customer.phone ?? '').replace(/\D/g, ''),
        buyer_cpf: (customer.cpf ?? '').replace(/\D/g, ''),
        payment_method: data.payment_method,
        utm: {
          source: new URLSearchParams(location.search).get('utm_source') ?? undefined,
          medium: new URLSearchParams(location.search).get('utm_medium') ?? undefined,
          campaign: new URLSearchParams(location.search).get('utm_campaign') ?? undefined,
          term: new URLSearchParams(location.search).get('utm_term') ?? undefined,
          content: new URLSearchParams(location.search).get('utm_content') ?? undefined,
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        order_id?: string;
        init_point?: string;
        mode?: 'mercadopago' | 'mock';
        error?: string;
      };
      if (!res.ok || !json.order_id) {
        throw new Error(json.error ?? 'Não foi possível criar o pedido');
      }

      // Limpa intent persistida após sucesso
      try { sessionStorage.removeItem(CHECKOUT_INTENT_KEY); } catch { /* ignore */ }

      // Modo Mercado Pago: redireciona pra o Checkout Pro
      if (json.init_point) {
        window.location.href = json.init_point;
        return;
      }

      // Modo mock (sem MP configurado): vai direto pra tela de pedido
      navigate(`/pedido/${json.order_id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <Link
        to={`/evento/${state.eventSlug}`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o evento
      </Link>

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Finalizar compra</h1>
      <p className="mt-1 text-slate-600">{state.eventName}</p>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Dados do comprador (vindos da conta) */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <User className="h-4 w-4" /> Comprador
              </h2>
              <Link to="/conta" className="text-xs text-brand-600 hover:underline">Editar dados</Link>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Nome</dt><dd className="text-slate-900 font-medium">{customer.name}</dd></div>
              <div><dt className="text-xs text-slate-500">E-mail</dt><dd className="text-slate-900">{customer.email}</dd></div>
              <div><dt className="text-xs text-slate-500">WhatsApp</dt><dd className="text-slate-900">{customer.phone ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">CPF</dt><dd className="text-slate-900 font-mono">{customer.cpf ? formatCPF(customer.cpf) : '—'}</dd></div>
            </dl>
            {(!customer.phone || !customer.cpf) && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Complete WhatsApp e CPF na sua <Link to="/conta" className="underline">conta</Link> antes de continuar.
              </p>
            )}
          </div>

          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Forma de pagamento</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PaymentOption
                value="pix"
                label="Pix"
                description="Aprovação instantânea"
                icon={<Smartphone className="h-5 w-5" />}
                {...register('payment_method')}
              />
              <PaymentOption
                value="credit_card"
                label="Cartão de Crédito"
                description="Visa, Master, Elo"
                icon={<CreditCard className="h-5 w-5" />}
                {...register('payment_method')}
              />
            </div>
          </div>

          <div className={`card ${errors.accept_terms ? 'ring-2 ring-red-400 bg-red-50' : ''}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                {...register('accept_terms')}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">
                Li e aceito os{' '}
                <Link to="/termos" className="text-brand-600 hover:underline">
                  Termos de Compra
                </Link>{' '}
                e a{' '}
                <Link to="/privacidade" className="text-brand-600 hover:underline">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
            {errors.accept_terms && (
              <p className="mt-2 text-xs text-red-700 font-medium">⚠ {errors.accept_terms.message}</p>
            )}
          </div>
        </div>

        {/* Resumo */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-20 space-y-4">
            <div className="card">
              <h2 className="font-semibold text-slate-900 mb-3">Resumo</h2>
              <ul className="space-y-2 mb-3">
                {state.items.map((item) => (
                  <li key={item.ticket_type_id} className="flex justify-between text-sm">
                    <span className="text-slate-700">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatBRL(item.unit_price_cents * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Total</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatBRL(state.totalCents)}
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="w-full btn-primary">
              {submitting ? (
                <>
                  <Spinner className="h-4 w-4 text-white" />
                  Processando...
                </>
              ) : (
                'Pagar agora'
              )}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Compra segura - dados criptografados
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

/* Field component removido — não usado após exigir login pro checkout */

interface PaymentOptionProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description: string;
  icon: React.ReactNode;
}

// forwardRef é essencial pra react-hook-form conseguir registrar o input
const PaymentOption = forwardRef<HTMLInputElement, PaymentOptionProps>(
  ({ label, description, icon, ...inputProps }, ref) => {
    return (
      <label className="flex items-start gap-3 rounded-lg border-2 border-slate-200 p-3 cursor-pointer hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 transition-colors">
        <input ref={ref} {...inputProps} type="radio" className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-700">{icon}</span>
            <span className="font-medium text-slate-900">{label}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </label>
    );
  }
);
PaymentOption.displayName = 'PaymentOption';
