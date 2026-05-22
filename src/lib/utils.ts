import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper pra combinar classes Tailwind com merge inteligente */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata valor em centavos para string em reais (R$ 100,00) */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/** Converte string "100,00" ou "100.00" pra centavos */
export function parseBRLToCents(value: string): number {
  const clean = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  return Math.round(parseFloat(clean) * 100);
}

/** Slugifica string pra URL (acentos, espaços etc) */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (acentos)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

/** Formata CPF: 12345678900 -> 123.456.789-00 */
export function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/** Valida CPF (algoritmo dos dígitos verificadores) */
export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === parseInt(digits[10]);
}
