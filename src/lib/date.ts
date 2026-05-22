import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Formata data ISO em "15 de jul, 2026 às 20:00" */
export function formatEventDate(iso: string): string {
  return format(parseISO(iso), "d 'de' MMM, yyyy 'às' HH:mm", { locale: ptBR });
}

/** Formata data ISO em "15/07/2026 20:00" (curto) */
export function formatShort(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

/** Formata só a data: "15/07/2026" */
export function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
}
