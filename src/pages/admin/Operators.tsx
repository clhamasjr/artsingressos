import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Trash2, Mail, Shield, ScanLine, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { formatShort } from '@/lib/date';

interface OperatorRow {
  email: string;
  role: 'admin' | 'operator';
  status: 'invited' | 'active';
  user_id: string | null;
  last_sign_in_at: string | null;
  added_at: string;
}

const addSchema = z.object({
  email: z.string().email('E-mail inválido'),
  role: z.enum(['admin', 'operator']),
});
type AddForm = z.infer<typeof addSchema>;

export default function AdminOperators() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: operators, isLoading } = useQuery({
    queryKey: ['admin', 'operators'],
    queryFn: async (): Promise<OperatorRow[]> => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args?: Record<string, unknown>
        ) => Promise<{ data: OperatorRow[] | null; error: { message: string } | null }>
      )('list_operators');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: AddForm) => {
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ error: { message: string } | null }>
      )('add_operator', { p_email: data.email.toLowerCase().trim(), p_role: data.role });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'operators'] });
      setAdding(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ error: { message: string } | null }>
      )('remove_operator', { p_email: email });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'operators'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operadores</h1>
          <p className="text-sm text-slate-600">
            Convide pessoas pra acessar o admin como Operador (só check-in/contagem) ou Admin (acesso total).
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary">
          <UserPlus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {adding && (
        <AddOperatorForm
          loading={addMutation.isPending}
          error={addMutation.error instanceof Error ? addMutation.error.message : null}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => addMutation.mutate(d)}
        />
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && operators && operators.length === 0 && !adding && (
        <EmptyState
          icon={<Mail className="h-6 w-6" />}
          title="Nenhum operador cadastrado"
          description="Adicione o primeiro convidando pelo e-mail."
          action={
            <button onClick={() => setAdding(true)} className="btn-primary">
              <UserPlus className="h-4 w-4" /> Adicionar primeiro
            </button>
          }
        />
      )}

      {!isLoading && operators && operators.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">E-mail</th>
                <th className="py-2 px-3">Permissão</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Último acesso</th>
                <th className="py-2 pl-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operators.map((op) => {
                const isSelf = op.email.toLowerCase() === user?.email?.toLowerCase();
                return (
                  <tr key={op.email}>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-900">{op.email}</p>
                      {isSelf && <span className="text-xs text-brand-600">(você)</span>}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                          op.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {op.role === 'admin' ? <Shield className="h-3 w-3" /> : <ScanLine className="h-3 w-3" />}
                        {op.role === 'admin' ? 'Admin' : 'Operador'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                          op.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {op.status === 'active' ? '✓ Ativo' : <><Clock className="h-3 w-3" /> Convidado</>}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-500">
                      {op.last_sign_in_at ? formatShort(op.last_sign_in_at) : '—'}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => {
                            if (confirm(`Remover acesso de ${op.email}?`)) removeMutation.mutate(op.email);
                          }}
                          disabled={removeMutation.isPending}
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card bg-slate-50 border-dashed">
        <h3 className="font-semibold text-slate-900 mb-2 text-sm">Como funciona</h3>
        <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
          <li>Você adiciona o e-mail aqui (Operador ou Admin)</li>
          <li>A pessoa acessa <code className="text-xs bg-white px-1 rounded">/admin/login</code> e digita esse mesmo e-mail</li>
          <li>Recebe um link mágico no e-mail e entra</li>
          <li>Operador só vê <strong>Check-in</strong> e <strong>Contagem</strong>; Admin vê tudo</li>
        </ol>
      </div>
    </div>
  );
}

function AddOperatorForm({
  loading,
  error,
  onCancel,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (data: AddForm) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { role: 'operator' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
      <h2 className="font-semibold text-slate-900">Convidar pessoa</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
          <input {...register('email')} type="email" className="input" placeholder="portaria@empresa.com" />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Permissão</label>
          <select {...register('role')} className="input">
            <option value="operator">Operador (só check-in/contagem)</option>
            <option value="admin">Admin (acesso total)</option>
          </select>
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Spinner className="h-4 w-4 text-white" /> : 'Adicionar'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}
