import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Calendar, MapPin, Eye, Pencil } from 'lucide-react';
import { supabase, type Tables } from '@/lib/supabase';
import { slugify } from '@/lib/utils';
import { formatShort } from '@/lib/date';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

const newEventSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  starts_at: z.string().min(1, 'Informe data e hora'),
  location_name: z.string().optional(),
});

type NewEventForm = z.infer<typeof newEventSchema>;
type AdminEvent = Tables<'events'>;

export default function AdminEvents() {
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ['admin', 'events', 'list'],
    queryFn: async (): Promise<AdminEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('starts_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: NewEventForm) => {
      const slug = `${slugify(input.name)}-${Date.now().toString(36)}`;
      const { data, error } = await supabase
        .from('events')
        .insert({
          name: input.name,
          slug,
          starts_at: new Date(input.starts_at).toISOString(),
          location_name: input.location_name || null,
          status: 'rascunho',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'events', 'list'] });
      setCreating(false);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Eventos</h1>
          <p className="text-sm text-slate-600">Gerencie todos os eventos da plataforma.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Novo evento
        </button>
      </div>

      {creating && (
        <CreateEventForm
          onCancel={() => setCreating(false)}
          onSubmit={(d) => createMutation.mutate(d)}
          loading={createMutation.isPending}
          error={createMutation.error instanceof Error ? createMutation.error.message : null}
        />
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && events && events.length === 0 && !creating && (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="Nenhum evento ainda"
          description="Crie seu primeiro evento para começar a vender ingressos."
          action={
            <button onClick={() => setCreating(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Criar primeiro evento
            </button>
          }
        />
      )}

      {!isLoading && events && events.length > 0 && (
        <div className="space-y-3">
          {events.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateEventForm({
  onCancel,
  onSubmit,
  loading,
  error,
}: {
  onCancel: () => void;
  onSubmit: (data: NewEventForm) => void;
  loading: boolean;
  error: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewEventForm>({ resolver: zodResolver(newEventSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
      <h2 className="font-semibold text-slate-900">Novo evento (rascunho)</h2>
      <p className="text-xs text-slate-500 -mt-2">
        Você poderá editar todos os campos depois e publicar quando estiver pronto.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do evento</label>
        <input {...register('name')} className="input" placeholder="Ex: Show da banda XYZ" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Data e hora</label>
          <input {...register('starts_at')} type="datetime-local" className="input" />
          {errors.starts_at && (
            <p className="mt-1 text-xs text-red-600">{errors.starts_at.message}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Local (opcional)</label>
          <input {...register('location_name')} className="input" placeholder="Ex: Teatro Municipal" />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Spinner className="h-4 w-4 text-white" /> : 'Criar'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EventRow({ event }: { event: AdminEvent }) {
  const statusColors: Record<string, string> = {
    rascunho: 'bg-slate-100 text-slate-700',
    publicado: 'bg-emerald-100 text-emerald-700',
    encerrado: 'bg-blue-100 text-blue-700',
    cancelado: 'bg-red-100 text-red-700',
  };
  return (
    <div className="card flex flex-col sm:flex-row gap-4 sm:items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
              statusColors[event.status]
            }`}
          >
            {event.status}
          </span>
        </div>
        <h3 className="font-semibold text-slate-900 truncate">{event.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {formatShort(event.starts_at)}
          </span>
          {event.location_name && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {event.location_name}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {event.status === 'publicado' && (
          <Link
            to={`/evento/${event.slug}`}
            target="_blank"
            className="btn-secondary"
            title="Ver página pública"
          >
            <Eye className="h-4 w-4" />
          </Link>
        )}
        <Link to={`/admin/eventos/${event.id}`} className="btn-primary">
          <Pencil className="h-4 w-4" /> Editar
        </Link>
      </div>
    </div>
  );
}
