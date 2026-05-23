import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { formatCPF, isValidCPF } from '@/lib/utils';
import { useEffect } from 'react';

const schema = z.object({
  name: z.string().min(3, 'Informe seu nome completo'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(11, 'WhatsApp com DDD (11 dígitos)').max(15, 'Número muito longo'),
  cpf: z.string().refine((v) => isValidCPF(v), 'CPF inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});
type SignupForm = z.infer<typeof schema>;

export default function CustomerSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isCustomer, loading: authLoading } = useAuth();
  const next = params.get('next') ?? '/';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(schema),
  });

  const cpfValue = watch('cpf');
  useEffect(() => {
    if (cpfValue) {
      const formatted = formatCPF(cpfValue);
      if (formatted !== cpfValue) setValue('cpf', formatted);
    }
  }, [cpfValue, setValue]);

  useEffect(() => {
    if (!authLoading && isCustomer) navigate(next, { replace: true });
  }, [authLoading, isCustomer, navigate, next]);

  const onSubmit = async (data: SignupForm) => {
    setError(null);
    setSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: data.email.toLowerCase().trim(),
        password: data.password,
        options: {
          data: {
            signup_type: 'customer',
            name: data.name.trim(),
            phone: data.phone.replace(/\D/g, ''),
            cpf: data.cpf.replace(/\D/g, ''),
          },
          emailRedirectTo: `${window.location.origin}${next}`,
        },
      });
      if (signUpError) throw signUpError;
      // Auth state vai atualizar via listener; redirect já está no useEffect
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      if (msg.includes('already registered')) {
        setError('Este e-mail já tem cadastro. Use a tela de Entrar.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-50 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 mb-6">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="h-6 w-6 text-brand-600" />
            <h1 className="text-lg font-bold text-slate-900">Criar conta</h1>
          </div>
          <p className="text-sm text-slate-600 mb-5">
            Crie sua conta pra comprar ingressos e ver seu histórico.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Nome completo" error={errors.name?.message}>
              <input {...register('name')} className="input" placeholder="Como está no documento" autoComplete="name" />
            </Field>
            <Field label="E-mail" error={errors.email?.message}>
              <input {...register('email')} type="email" className="input" placeholder="voce@email.com" autoComplete="email" />
            </Field>
            <Field label="WhatsApp (com DDD)" error={errors.phone?.message}>
              <input {...register('phone')} className="input" placeholder="(11) 91234-5678" autoComplete="tel" inputMode="tel" />
            </Field>
            <Field label="CPF" error={errors.cpf?.message}>
              <input {...register('cpf')} className="input" placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
            </Field>
            <Field label="Senha (mín. 8 caracteres)" error={errors.password?.message}>
              <input {...register('password')} type="password" className="input" placeholder="••••••••" autoComplete="new-password" />
            </Field>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
            )}

            <button type="submit" disabled={submitting} className="w-full btn-primary">
              {submitting ? <><Spinner className="h-4 w-4 text-white" /> Criando...</> : 'Criar conta'}
            </button>
          </form>

          <p className="mt-4 text-sm text-slate-600 text-center">
            Já tem conta?{' '}
            <Link to={`/conta/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-brand-600 font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
