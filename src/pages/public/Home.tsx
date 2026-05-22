import { Link } from 'react-router-dom';
import { Calendar, MapPin, Ticket } from 'lucide-react';
import { useEvents } from '@/hooks/useEvents';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatEventDate } from '@/lib/date';

export default function Home() {
  const { data: events, isLoading, error } = useEvents();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {/* Hero */}
      <section className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          Eventos imperdíveis
        </h1>
        <p className="mt-2 text-slate-600">
          Compre com Pix ou cartão. Receba seu voucher no WhatsApp e e-mail.
        </p>
      </section>

      {/* Conteúdo */}
      {isLoading && <EventGridSkeleton />}

      {error && (
        <EmptyState
          title="Não foi possível carregar"
          description="Tente recarregar a página em alguns instantes."
        />
      )}

      {!isLoading && !error && events && events.length === 0 && (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title="Nenhum evento no momento"
          description="Em breve você verá nossas próximas atrações aqui."
        />
      )}

      {!isLoading && !error && events && events.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <Link
              key={event.id}
              to={`/evento/${event.slug}`}
              className="group block rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200 hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              {/* Banner */}
              <div className="aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 relative">
                {event.banner_url ? (
                  <img
                    src={event.banner_url}
                    alt={event.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-white/90 font-bold text-2xl text-center px-6">
                    {event.name}
                  </div>
                )}
              </div>

              {/* Corpo */}
              <div className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-2">
                  {event.name}
                </h2>

                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>{formatEventDate(event.starts_at)}</span>
                  </div>
                  {event.location_name && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="truncate">{event.location_name}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 inline-flex text-sm font-medium text-brand-600 group-hover:text-brand-700">
                  Ver ingressos →
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EventGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200">
          <Skeleton className="aspect-[16/9] w-full rounded-none" />
          <div className="p-5 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
