// Formatadores compartilhados pelas páginas admin.

const ADMIN_TIME_ZONE = "America/Sao_Paulo";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseApiDate(value: string): Date {
  // O banco legado retorna instantes UTC sem o sufixo Z. Interpretá-los
  // como hora local adianta o login em três horas no horário de Brasília.
  const hasTime = /^\d{4}-\d{2}-\d{2}T/.test(value);
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTime && !hasOffset ? `${value}Z` : value);
}

export function formatDate(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const value = iso.trim();
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  // Uma data de calendário, sem hora, não representa um instante em UTC.
  return date.toLocaleDateString("pt-BR", {
    timeZone: DATE_ONLY.test(value) ? "UTC" : ADMIN_TIME_ZONE,
  });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const value = iso.trim();
  if (DATE_ONLY.test(value)) return formatDate(value);
  const date = parseApiDate(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { timeZone: ADMIN_TIME_ZONE });
}

export const formatPrice = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
