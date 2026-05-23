-- Campos pra mensagem de boas-vindas no check-in
alter table public.events
  add column if not exists welcome_message text,
  add column if not exists programming text,
  add column if not exists map_url text;

comment on column public.events.welcome_message is 'Saudacao personalizada enviada por WhatsApp apos check-in';
comment on column public.events.programming is 'Programacao/agenda do evento (texto longo, suporta quebras de linha)';
comment on column public.events.map_url is 'URL pra mapa do evento (Google Maps, etc.)';
