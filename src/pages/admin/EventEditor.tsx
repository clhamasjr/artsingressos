import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Plus, Trash2, Eye, Globe, CalendarOff } from 'lucide-react';
import { supabase, type Tables } from '@/lib/supabase';
import { formatBRL, parseBRLToCents, slugify } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { ImageUpload } from '@/components/ui/ImageUpload';

type AdminEvent = Tables<'events'>;
type LotRow = Tables<'ticket_types'>;

export default function EventEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'event', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [{ data: ev }, { data: lots }] = await Promise.all([
        supabase.from('events').select('*').eq('id', id!).single(),
        supabase
          .from('ticket_types')
          .select('*')
          .eq('event_id', id!)
          .order('position', { ascending: true }),
      ]);
      return { event: ev as AdminEvent | null, lots: (lots ?? []) as LotRow[] };
    },
  });

  const event = data?.event ?? null;

  // Form state local pra evento (controlado)
  const [form, setForm] = useState<Partial<AdminEvent>>({});
  const current = { ...event, ...form } as AdminEvent;

  const saveEvent = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error('Evento não carregado');
      const updates = {
        name: current.name,
        slug: current.slug,
        description: current.description,
        location_name: current.location_name,
        location_address: current.location_address,
        starts_at: current.starts_at,
        ends_at: current.ends_at,
        banner_url: current.banner_url,
        status: current.status,
      };
      const { error } = await supabase.from('events').update(updates).eq('id', event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'event', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'events', 'list'] });
      setForm({});
    },
  });

  const publishToggle = useMutation({
    mutationFn: async () => {
      if (!event) return;
      const newStatus = event.status === 'publicado' ? 'rascunho' : 'publicado';
      const { error } = await supabase
        .from('events')
        .update({ status: newStatus })
        .eq('id', event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'event', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'events', 'list'] });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (!event) {
    return (
      <div className="card text-center">
        <p>Evento não encontrado.</p>
        <Link to="/admin/eventos" className="mt-3 inline-block btn-secondary">
          Voltar
        </Link>
      </div>
    );
  }

  const set = <K extends keyof AdminEvent>(k: K, v: AdminEvent[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // datetime-local precisa "YYYY-MM-DDTHH:mm" (sem tz)
  const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const dirty = Object.keys(form).length > 0;

  return (
    <div className="space-y-6">
      <Link
        to="/admin/eventos"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para eventos
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 truncate">{current.name}</h1>
        <div className="flex items-center gap-2">
          {event.status === 'publicado' ? (
            <Link to={`/evento/${event.slug}`} target="_blank" className="btn-secondary">
              <Eye className="h-4 w-4" /> Ver página
            </Link>
          ) : null}
          <button
            onClick={() => publishToggle.mutate()}
            disabled={publishToggle.isPending}
            className={event.status === 'publicado' ? 'btn-secondary' : 'btn-primary'}
          >
            {event.status === 'publicado' ? (
              <>
                <CalendarOff className="h-4 w-4" /> Despublicar
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" /> Publicar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Form do evento */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-900">Informações do evento</h2>

        <Field label="Nome">
          <input
            value={current.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            className="input"
          />
        </Field>

        <Field label="URL (slug)" hint="https://artsingressos.vercel.app/evento/SLUG">
          <input
            value={current.slug ?? ''}
            onChange={(e) => set('slug', slugify(e.target.value))}
            className="input font-mono text-sm"
          />
        </Field>

        <Field label="Descrição">
          <textarea
            value={current.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
            className="input"
            placeholder="Conte ao público sobre seu evento..."
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Início">
            <input
              type="datetime-local"
              value={toLocalInput(current.starts_at)}
              onChange={(e) => set('starts_at', new Date(e.target.value).toISOString())}
              className="input"
            />
          </Field>
          <Field label="Término (opcional)">
            <input
              type="datetime-local"
              value={toLocalInput(current.ends_at)}
              onChange={(e) =>
                set('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)
              }
              className="input"
            />
          </Field>
        </div>

        <Field label="Local">
          <input
            value={current.location_name ?? ''}
            onChange={(e) => set('location_name', e.target.value || null)}
            className="input"
            placeholder="Ex: Teatro Municipal"
          />
        </Field>

        <Field label="Endereço">
          <input
            value={current.location_address ?? ''}
            onChange={(e) => set('location_address', e.target.value || null)}
            className="input"
            placeholder="Rua, número, bairro, cidade"
          />
        </Field>

        <Field label="Banner do evento" hint="Imagem que aparece na vitrine e na página do evento. Recomendado 1200×675.">
          <ImageUpload
            value={current.banner_url ?? null}
            onChange={(url) => set('banner_url', url)}
            folder={`events/${event.id}/banner`}
            placeholder="Clique pra enviar o banner"
            size="lg"
          />
        </Field>

        {/* Mensagem de boas-vindas — usada no WhatsApp pós check-in */}
        <div className="pt-4 border-t border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-1">Boas-vindas pós check-in</h3>
          <p className="text-xs text-slate-500 mb-4">
            Enviado automaticamente por WhatsApp quando o participante passar pela portaria.
          </p>

          <Field label="Mensagem de boas-vindas (texto)" hint="Tom acolhedor, frase curta. Deixe vazio pra não enviar.">
            <textarea
              value={current.welcome_message ?? ''}
              onChange={(e) => set('welcome_message', e.target.value || null)}
              rows={3}
              className="input"
              placeholder="Ex: Estamos muito felizes em receber você! Aproveite a noite com a gente."
            />
          </Field>

          <Field
            label="Programação (imagem)"
            hint="Envie um cartaz/flyer com a programação. Se enviar imagem, o texto abaixo é ignorado."
          >
            <ImageUpload
              value={current.programming_image_url ?? null}
              onChange={(url) => set('programming_image_url', url)}
              folder={`events/${event.id}/programming`}
              placeholder="Clique pra enviar a imagem da programação"
              size="md"
            />
          </Field>

          <Field
            label="Programação (texto — alternativa à imagem)"
            hint="Cada linha vira uma linha na mensagem. Use horários e atrações."
          >
            <textarea
              value={current.programming ?? ''}
              onChange={(e) => set('programming', e.target.value || null)}
              rows={5}
              className="input"
              placeholder={'20:00 - Abertura\n21:00 - Banda XYZ\n22:30 - DJ ABC\n00:00 - Encerramento'}
            />
          </Field>

          <Field
            label="Croqui / planta do local (imagem)"
            hint="Mapa interno do local com palco, bar, banheiros, saídas. Enviado junto com as boas-vindas."
          >
            <ImageUpload
              value={current.map_url ?? null}
              onChange={(url) => set('map_url', url)}
              folder={`events/${event.id}/map`}
              placeholder="Clique pra enviar o croqui do local"
              size="md"
            />
          </Field>
        </div>

        {dirty && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
            <button
              onClick={() => saveEvent.mutate()}
              disabled={saveEvent.isPending}
              className="btn-primary"
            >
              {saveEvent.isPending ? (
                <Spinner className="h-4 w-4 text-white" />
              ) : (
                <>
                  <Save className="h-4 w-4" /> Salvar alterações
                </>
              )}
            </button>
            <button onClick={() => setForm({})} className="btn-secondary">
              Descartar
            </button>
            {saveEvent.error instanceof Error && (
              <span className="text-sm text-red-600">{saveEvent.error.message}</span>
            )}
          </div>
        )}
      </div>

      {/* Lotes */}
      <LotsManager eventId={event.id} lots={data?.lots ?? []} />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function LotsManager({ eventId, lots }: { eventId: string; lots: LotRow[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newLot, setNewLot] = useState({ name: '', price: '', qty: '' });

  const create = useMutation({
    mutationFn: async () => {
      if (!newLot.name || !newLot.price || !newLot.qty) throw new Error('Preencha todos os campos');
      const price_cents = parseBRLToCents(newLot.price);
      const qty = parseInt(newLot.qty, 10);
      if (Number.isNaN(price_cents) || price_cents < 0) throw new Error('Preço inválido');
      if (Number.isNaN(qty) || qty < 1) throw new Error('Quantidade inválida');
      const { error } = await supabase.from('ticket_types').insert({
        event_id: eventId,
        name: newLot.name,
        price_cents,
        qty_total: qty,
        position: lots.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'event', eventId] });
      setAdding(false);
      setNewLot({ name: '', price: '', qty: '' });
    },
  });

  const remove = useMutation({
    mutationFn: async (lotId: string) => {
      const { error } = await supabase.from('ticket_types').delete().eq('id', lotId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'event', eventId] }),
  });

  const toggleActive = useMutation({
    mutationFn: async (lot: LotRow) => {
      const { error } = await supabase
        .from('ticket_types')
        .update({ active: !lot.active })
        .eq('id', lot.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'event', eventId] }),
  });

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Lotes / Tipos de ingresso</h2>
        <button onClick={() => setAdding(true)} className="btn-secondary">
          <Plus className="h-4 w-4" /> Adicionar lote
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-slate-200 p-3 space-y-3 bg-slate-50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={newLot.name}
              onChange={(e) => setNewLot({ ...newLot, name: e.target.value })}
              placeholder="Ex: Inteira"
              className="input"
            />
            <input
              value={newLot.price}
              onChange={(e) => setNewLot({ ...newLot, price: e.target.value })}
              placeholder="Preço (ex: 50,00)"
              className="input"
              inputMode="decimal"
            />
            <input
              value={newLot.qty}
              onChange={(e) => setNewLot({ ...newLot, qty: e.target.value })}
              placeholder="Quantidade"
              className="input"
              inputMode="numeric"
            />
          </div>
          {create.error instanceof Error && (
            <p className="text-sm text-red-600">{create.error.message}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="btn-primary"
            >
              {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Adicionar'}
            </button>
            <button onClick={() => setAdding(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {lots.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">
          Nenhum lote ainda. Adicione pelo menos um pra publicar o evento.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2">Nome</th>
              <th className="py-2 text-right">Preço</th>
              <th className="py-2 text-right">Vendido</th>
              <th className="py-2 text-right">Total</th>
              <th className="py-2 text-right">Status</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lots.map((lot) => (
              <tr key={lot.id}>
                <td className="py-3">{lot.name}</td>
                <td className="py-3 text-right tabular-nums">{formatBRL(lot.price_cents)}</td>
                <td className="py-3 text-right tabular-nums">{lot.qty_sold}</td>
                <td className="py-3 text-right tabular-nums">{lot.qty_total}</td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => toggleActive.mutate(lot)}
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      lot.active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {lot.active ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => {
                      if (lot.qty_sold > 0) {
                        alert('Este lote já tem ingressos vendidos. Desative em vez de excluir.');
                        return;
                      }
                      if (confirm(`Excluir o lote "${lot.name}"?`)) remove.mutate(lot.id);
                    }}
                    className="text-red-600 hover:bg-red-50 p-1 rounded"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
