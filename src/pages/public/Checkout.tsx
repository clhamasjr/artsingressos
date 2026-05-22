import { useEffect, useState, forwardRef } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ShieldCheck, Smartphone, CreditCard } from 'lucide-react';
import type { CheckoutState } from './EventDetail';
import { formatBRL, isValidCPF, formatCPF } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';

const checkoutSchema = z.object({
  buyer_name: z.string().min(3, 'Informe seu nome completo'),
  buyer_email: z.string().email('E-mail inválido'),
  buyer_phone: z
    .string()
    .min(11, 'WhatsApp deve ter DDD + número')
    .max(15, 'Número muito longo'),
  buyer_cpf: z.string().refine((v) => isValidCPF(v), 'CPF inválido'),
  payment_method: z.enum(['pix', 'credit_card']),
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os termos' }),
  }),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? null) as CheckoutState | null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      payment_method: 'pix',
    },
  });

  // Quando validação falha, faz scroll pro primeiro erro e mostra banner
  const onInvalid = (errs: typeof errors) => {
    console.warn('[Checkout] Validacao falhou:', errs);
    const order: (keyof CheckoutForm)[] = [
      'buyer_name',
      'buyer_email',
      'buyer_phone',
      'buyer_cpf',
      'payment_method',
      'accept_terms',
    ];
    const firstErrorKey = order.find((k) => errs[k]);
    const missingFields = order
      .filter((k) => errs[k])
      .map((k) => {
        switch (k) {
          case 'buyer_name': return 'Nome';
          case 'buyer_email': return 'E-mail';
          case 'buyer_phone': return 'WhatsApp';
          case 'buyer_cpf': return 'CPF';
          case 'payment_method': return 'Forma de pagamento';
          case 'accept_terms': return 'Aceite dos Termos';
        }
      })
      .join(', ');
    if (firstErrorKey) {
      const el = document.querySelector(
        `[name="${firstErrorKey}"]`
      ) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus?.();
    }
    setError(`Confira: ${missingFields}`);
  };

  // Se não veio estado de checkout, redireciona pra home
  useEffect(() => {
    if (!state || !state.items || state.items.length === 0) {
      const t = setTimeout(() => navigate('/', { replace: true }), 100);
      return () => clearTimeout(t);
    }
  }, [state, navigate]);

  if (!state || state.items.length === 0) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (data: CheckoutForm) => {
    setError(null);
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-order`;
      const body = {
        event_id: state.eventId,
        items: state.items.map((i) => ({
          ticket_type_id: i.ticket_type_id,
          quantity: i.quantity,
        })),
        buyer_name: data.buyer_name,
        buyer_email: data.buyer_email,
        buyer_phone: data.buyer_phone.replace(/\D/g, ''),
        buyer_cpf: data.buyer_cpf.replace(/\D/g, ''),
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

  const cpfValue = watch('buyer_cpf');
  useEffect(() => {
    if (cpfValue) {
      const formatted = formatCPF(cpfValue);
      if (formatted !== cpfValue) setValue('buyer_cpf', formatted);
    }
  }, [cpfValue, setValue]);

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
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Seus dados</h2>
            <div className="space-y-4">
              <Field label="Nome completo" error={errors.buyer_name?.message}>
                <input
                  {...register('buyer_name')}
                  className="input"
                  placeholder="Como está no documento"
                  autoComplete="name"
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="E-mail" error={errors.buyer_email?.message}>
                  <input
                    {...register('buyer_email')}
                    type="email"
                    className="input"
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </Field>

                <Field label="WhatsApp (com DDD)" error={errors.buyer_phone?.message}>
                  <input
                    {...register('buyer_phone')}
                    className="input"
                    placeholder="(11) 91234-5678"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </Field>
              </div>

              <Field label="CPF" error={errors.buyer_cpf?.message}>
                <input
                  {...register('buyer_cpf')}
                  className="input"
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                />
              </Field>
            </div>
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

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
