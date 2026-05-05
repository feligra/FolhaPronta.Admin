// Formatadores compartilhados pelas páginas admin.

export const formatDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export const formatDateTime = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

export const formatPrice = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
