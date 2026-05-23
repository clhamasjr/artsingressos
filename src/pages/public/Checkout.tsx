import { useEffect, useMemo, useState, forwardRef } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ShieldCheck, Smartphone, CreditCard, User, Users, UserCheck } from 'lucide-react';
import type { CheckoutState } from './EventDetail';
import { formatBRL, formatCPF, isValidCPF } from '@/lib/utils';
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

const CHECKOUT_INTENT_KEY = 'checkout_intent_v1';

interface HolderForm {
  ticket_type_id: string;
  ticket_type_name: string;
  index_in_type: number;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  same_as_buyer: boolean;
}

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customer, isCustomer, loading: authLoading } = useAuth();

  const [state] = useState<CheckoutState | null>(() => {
    const fromLocation = (location.state ?? null) as CheckoutState | null;
    if (fromLocation?.items?.length) {
      try { sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(fromLocation)); } catch { /* ignore */ }
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

  // Inicializa holders: 1 entry por ingresso, primeiro = comprador
  const [holders, setHolders] = useState<HolderForm[]>([]);
  useEffect(() => {
    if (!state || !customer) return;
    const initial: HolderForm[] = [];
    let globalIdx = 0;
    for (const item of state.items) {
      for (let i = 0; i < item.quantity; i++) {
        const isFirst = globalIdx === 0;
        initial.push({
          ticket_type_id: item.ticket_type_id,
          ticket_type_name: item.name,
          index_in_type: i,
          name: isFirst ? customer.name : '',
          email: isFirst ? customer.email : '',
          cpf: isFirst ? (customer.cpf ?? '') : '',
          phone: isFirst ? (customer.phone ?? '') : '',
          same_as_buyer: isFirst,
        });
        globalIdx++;
      }
    }
    setHolders(initial);
  }, [state, customer]);

  const totalQuantity = useMemo(
    () => (state ? state.items.reduce((s, i) => s + i.quantity, 0) : 0),
    [state]
  );

  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { payment_method: 'pix' },
  });

  const onInvalid = (errs: typeof errors) => {
    const missing: string[] = [];
    if (errs.payment_method) missing.push('Forma de pagamento');
    if (errs.accept_terms) missing.push('Aceite dos Termos');
    setError(`Confira: ${missing.join(', ')}`);
  };

  useEffect(() => {
    if (!state || !state.items || state.items.length === 0) {
      const t = setTimeout(() => navigate('/', { replace: true }), 100);
      return () => clearTimeout(t);
    }
  }, [state, navigate]);

  useEffect(() => {
    if (!authLoading && state && !isCustomer) {
      navigate(`/conta/login?next=${encodeURIComponent('/checkout')}`, { replace: true });
    }
  }, [authLoading, isCustomer, state, navigate]);

  if (!state || state.items.length === 0) return <Navigate to="/" replace />;
  if (authLoading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }
  if (!isCustomer || !customer) return null;

  const updateHolder = (idx: number, patch: Partial<HolderForm>) => {
    setHolders((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  const toggleSameAsBuyer = (idx: number) => {
    setHolders((prev) =>
      prev.map((h, i) => {
        if (i !== idx) return h;
        const next = !h.same_as_buyer;
        return next
          ? { ...h, same_as_buyer: true, name: customer.name, email: customer.email, cpf: customer.cpf ?? '', phone: customer.phone ?? '' }
          : { ...h, same_as_buyer: false, name: '', email: '', cpf: '', phone: '' };
      })
    );
  };

  const validateHolders = (): string | null => {
    for (let i = 0; i < holders.length; i++) {
      const h = holders[i];
      if (!h.name || h.name.length < 3) return `Ingresso ${i + 1}: informe o nome completo`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email)) return `Ingresso ${i + 1}: e-mail inválido`;
      if (!isValidCPF(h.cpf)) return `Ingresso ${i + 1}: CPF inválido`;
      const phoneDigits = h.phone.replace(/\D/g, '');
      if (phoneDigits.length < 11) return `Ingresso ${i + 1}: WhatsApp com DDD (11 dígitos)`;
    }
    return null;
  };

  const onSubmit = async (data: CheckoutForm) => {
    setError(null);
    const holderError = validateHolders();
    if (holderError) {
      setError(holderError);
      return;
    }
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-order`;
      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;

      // Agrupa holders por ticket_type_id na ordem original dos items
      const itemsWithHolders = state.items.map((item) => {
        const itemHolders = holders
          .filter((h) => h.ticket_type_id === item.ticket_type_id)
          .map((h) => ({
            name: h.name.trim(),
            email: h.email.trim().toLowerCase(),
            cpf: h.cpf.replace(/\D/g, ''),
            phone: h.phone.replace(/\D/g, ''),
            same_as_buyer: h.same_as_buyer,
          }));
        return {
          ticket_type_id: item.ticket_type_id,
          quantity: item.quantity,
          holders: itemHolders,
        };
      });

      const body = {
        event_id: state.eventId,
        items: itemsWithHolders,
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
      try { sessionStorage.removeItem(CHECKOUT_INTENT_KEY); } catch { /* ignore */ }

      if (json.init_point) {
        window.location.href = json.init_point;
        return;
      }
      navigate(`/pedido/${json.order_id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <Link to={`/evento/${state.eventSlug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar para o evento
      </Link>

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Finalizar compra</h1>
      <p className="mt-1 text-slate-600">{state.eventName}</p>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Comprador (titular do ingresso 1) */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2"><User className="h-4 w-4" /> Comprador</h2>
              <Link to="/conta" className="text-xs text-brand-600 hover:underline">Editar dados</Link>
            </div>
            <p className="text-sm text-slate-600">
              <strong>{customer.name}</strong> · {customer.email} · {customer.phone ?? '—'} · {customer.cpf ? formatCPF(customer.cpf) : 'CPF não cadastrado'}
            </p>
            {(!customer.phone || !customer.cpf) && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Complete WhatsApp e CPF na sua <Link to="/conta" className="underline">conta</Link> antes de continuar.
              </p>
            )}
          </div>

          {/* Identificação dos ingressos */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Users className="h-4 w-4" /> Identifique cada ingresso ({totalQuantity})
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Cada ingresso precisa de dados de quem vai usar. Pra criança que não tem documento, marque "Usar meus dados".
            </p>
            <div className="space-y-3">
              {holders.map((h, idx) => (
                <HolderCard
                  key={idx}
                  index={idx}
                  holder={h}
                  isBuyer={idx === 0}
                  onChange={(patch) => updateHolder(idx, patch)}
                  onToggleSameAsBuyer={() => toggleSameAsBuyer(idx)}
                />
              ))}
            </div>
          </div>

          {/* Pagamento */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Forma de pagamento</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PaymentOption value="pix" label="Pix" description="Aprovação instantânea"
                icon={<Smartphone className="h-5 w-5" />} {...register('payment_method')} />
              <PaymentOption value="credit_card" label="Cartão de Crédito" description="Visa, Master, Elo"
                icon={<CreditCard className="h-5 w-5" />} {...register('payment_method')} />
            </div>
          </div>

          {/* Termos */}
          <div className={`card ${errors.accept_terms ? 'ring-2 ring-red-400 bg-red-50' : ''}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" {...register('accept_terms')} className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-slate-700">
                Li e aceito os <Link to="/termos" className="text-brand-600 hover:underline">Termos de Compra</Link> e a <Link to="/privacidade" className="text-brand-600 hover:underline">Política de Privacidade</Link>.
              </span>
            </label>
            {errors.accept_terms && <p className="mt-2 text-xs text-red-700 font-medium">⚠ {errors.accept_terms.message}</p>}
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
                    <span className="text-slate-700">{item.quantity}× {item.name}</span>
                    <span className="font-medium tabular-nums">{formatBRL(item.unit_price_cents * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Total</span>
                <span className="text-xl font-bold text-slate-900">{formatBRL(state.totalCents)}</span>
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

            <button type="submit" disabled={submitting} className="w-full btn-primary">
              {submitting ? <><Spinner className="h-4 w-4 text-white" /> Processando...</> : 'Pagar agora'}
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

function HolderCard({
  index, holder, isBuyer, onChange, onToggleSameAsBuyer,
}: {
  index: number;
  holder: HolderForm;
  isBuyer: boolean;
  onChange: (patch: Partial<HolderForm>) => void;
  onToggleSameAsBuyer: () => void;
}) {
  return (
    <div className={`rounded-lg border p-3 ${holder.same_as_buyer ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-slate-900 text-sm">
          Ingresso {index + 1} · <span className="text-slate-500 font-normal">{holder.ticket_type_name}</span>
        </p>
        {!isBuyer && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={holder.same_as_buyer} onChange={onToggleSameAsBuyer}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            <UserCheck className="h-3 w-3" /> Usar meus dados (criança)
          </label>
        )}
      </div>
      {!holder.same_as_buyer && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <input
            value={holder.name} onChange={(e) => onChange({ name: e.target.value })}
            className="input !py-1.5 text-sm" placeholder="Nome completo"
          />
          <input
            value={holder.email} type="email" onChange={(e) => onChange({ email: e.target.value })}
            className="input !py-1.5 text-sm" placeholder="E-mail"
          />
          <input
            value={holder.phone} onChange={(e) => onChange({ phone: e.target.value })}
            className="input !py-1.5 text-sm" placeholder="WhatsApp (com DDD)" inputMode="tel"
          />
          <input
            value={holder.cpf}
            onChange={(e) => {
              const cpfFmt = formatCPF(e.target.value);
              onChange({ cpf: cpfFmt });
            }}
            className="input !py-1.5 text-sm" placeholder="CPF" inputMode="numeric" maxLength={14}
          />
        </div>
      )}
      {holder.same_as_buyer && (
        <p className="text-xs text-emerald-700 mt-1">✓ Este ingresso usa seus dados (do comprador)</p>
      )}
    </div>
  );
}

interface PaymentOptionProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description: string;
  icon: React.ReactNode;
}

const PaymentOption = forwardRef<HTMLInputElement, PaymentOptionProps>(
  ({ label, description, icon, ...inputProps }, ref) => (
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
  )
);
PaymentOption.displayName = 'PaymentOption';
