import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { supabase, type Tables } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { formatBRL, parseBRLToCents } from '@/lib/utils';
import { formatShort } from '@/lib/date';

type AdSpendRow = Tables<'ad_spend'>;

const formSchema = z.object({
  date: z.string().min(1, 'Data obrigatória'),
  platform: z.enum(['meta', 'tiktok', 'google']),
  campaign_id: z.string().min(1, 'ID/nome da campanha'),
  campaign_name: z.string().optional(),
  spend: z.string().min(1, 'Gasto obrigatório'),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
});
type FormData = z.infer<typeof formSchema>;

export default function AdSpendPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: entries, isLoading } = useQuery({
    queryKey: ['admin', 'ad-spend'],
    queryFn: async (): Promise<AdSpendRow[]> => {
      const { data, error } = await supabase
        .from('ad_spend')
        .select('*')
        .order('date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (d: FormData) => {
      const { error } = await supabase.from('ad_spend').insert({
        date: d.date,
        platform: d.platform,
        campaign_id: d.campaign_id.trim(),
        campaign_name: d.campaign_name?.trim() || d.campaign_id.trim(),
        spend_cents: parseBRLToCents(d.spend),
        impressions: parseInt(d.impressions || '0', 10),
        clicks: parseInt(d.clicks || '0', 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'ad-spend'] });
      setAdding(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ad_spend').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ad-spend'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gasto em anúncios</h1>
          <p className="text-sm text-slate-600">
            Cadastre o gasto de cada campanha. Cruzamos com vendas usando o UTM da URL.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {adding && (
        <AddForm
          loading={addMutation.isPending}
          error={addMutation.error instanceof Error ? addMutation.error.message : null}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => addMutation.mutate(d)}
        />
      )}

      {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}

      {!isLoading && entries && entries.length === 0 && !adding && (
        <EmptyState
          icon={<TrendingUp className="h-6 w-6" />}
          title="Nenhum gasto registrado"
          description="Cadastre seu gasto em ads pra cruzar com as vendas no dashboard ROI."
          action={<button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> Adicionar primeiro</button>}
        />
      )}

      {!isLoading && entries && entries.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 px-3">Plataforma</th>
                <th className="py-2 px-3">Campanha</th>
                <th className="py-2 px-3 text-right">Gasto</th>
                <th className="py-2 px-3 text-right">Impressões</th>
                <th className="py-2 px-3 text-right">Cliques</th>
                <th className="py-2 pl-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-3 pr-3 text-slate-700">{formatShort(e.date).split(' ')[0]}</td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded ${
                      e.platform === 'meta' ? 'bg-blue-100 text-blue-700' :
                      e.platform === 'tiktok' ? 'bg-slate-900 text-white' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {e.platform}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-900">{e.campaign_name ?? e.campaign_id}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium">{formatBRL(e.spend_cents)}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-500">{e.impressions.toLocaleString('pt-BR')}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-500">{e.clicks.toLocaleString('pt-BR')}</td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      onClick={() => { if (confirm('Excluir esse registro?')) removeMutation.mutate(e.id); }}
                      className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                    ><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card bg-slate-50 border-dashed">
        <h3 className="font-semibold text-slate-900 mb-1 text-sm">💡 Dica de atribuição</h3>
        <p className="text-sm text-slate-700">
          Pra cruzar venda × campanha, divulgue suas URLs com <code className="text-xs bg-white px-1 rounded">?utm_campaign=NOME-DA-CAMPANHA</code>.
          O <strong>NOME-DA-CAMPANHA</strong> precisa bater com o "Campanha" cadastrado aqui.
        </p>
      </div>
    </div>
  );
}

function AddForm({ loading, error, onCancel, onSubmit }: {
  loading: boolean; error: string | null;
  onCancel: () => void; onSubmit: (d: FormData) => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { date: new Date().toISOString().slice(0, 10), platform: 'meta' },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
      <h2 className="font-semibold text-slate-900">Registrar gasto</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Data</label>
          <input {...register('date')} type="date" className="input" />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Plataforma</label>
          <select {...register('platform')} className="input">
            <option value="meta">Meta (Facebook/Instagram)</option>
            <option value="tiktok">TikTok</option>
            <option value="google">Google</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Campanha (UTM)</label>
          <input {...register('campaign_id')} className="input" placeholder="show-julho" />
          {errors.campaign_id && <p className="mt-1 text-xs text-red-600">{errors.campaign_id.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome amigável (opcional)</label>
          <input {...register('campaign_name')} className="input" placeholder="Show Julho - Conv" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Gasto (R$)</label>
          <input {...register('spend')} className="input" placeholder="150,00" inputMode="decimal" />
          {errors.spend && <p className="mt-1 text-xs text-red-600">{errors.spend.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Impressões</label>
            <input {...register('impressions')} className="input" inputMode="numeric" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Cliques</label>
            <input {...register('clicks')} className="input" inputMode="numeric" placeholder="0" />
          </div>
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Spinner className="h-4 w-4 text-white" /> : 'Adicionar'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
      </div>
    </form>
  );
}
