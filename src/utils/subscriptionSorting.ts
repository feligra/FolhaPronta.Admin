import type { SubscriptionSortField } from "@/types";

export const SUBSCRIPTION_SORT_FIELDS: ReadonlyArray<{ value: SubscriptionSortField; label: string }> = [
  { value: "userName", label: "Cliente" },
  { value: "userEmail", label: "E-mail" },
  { value: "planName", label: "Plano" },
  { value: "provider", label: "Provedor" },
  { value: "monthlyAmount", label: "Valor do plano" },
  { value: "status", label: "Status" },
  { value: "currentPeriodEnd", label: "Fim da vigência" },
  { value: "createdAt", label: "Data de criação" },
];

export function readSubscriptionSort(params: URLSearchParams): { field: SubscriptionSortField; direction: "asc" | "desc" } {
  const field = SUBSCRIPTION_SORT_FIELDS.find(item => item.value === params.get("sortBy"))?.value ?? "createdAt";
  return { field, direction: params.get("sortDirection") === "asc" ? "asc" : "desc" };
}

export function changeSubscriptionSort(params: URLSearchParams, field: SubscriptionSortField, direction?: "asc" | "desc") {
  const current = readSubscriptionSort(params);
  const next = new URLSearchParams(params);
  next.set("sortBy", field);
  next.set("sortDirection", direction ?? (current.field === field && current.direction === "asc" ? "desc" : "asc"));
  next.set("page", "1");
  return next;
}
