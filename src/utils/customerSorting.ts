import type { CustomerSortField } from "@/types";

export const CUSTOMER_SORT_FIELDS: ReadonlyArray<{ value: CustomerSortField; label: string }> = [
  { value: "name", label: "Nome" },
  { value: "email", label: "E-mail" },
  { value: "emailConfirmed", label: "Confirmação do e-mail" },
  { value: "userType", label: "Tipo de conta" },
  { value: "planSlug", label: "Plano" },
  { value: "trialStatus", label: "Situação do teste grátis" },
  { value: "subscriptionStatus", label: "Assinatura" },
  { value: "totalActivitiesGenerated", label: "Atividades geradas" },
  { value: "lastActivityGeneratedAt", label: "Última geração" },
  { value: "createdAt", label: "Cadastro" },
  { value: "lastLoginAt", label: "Último login" },
];

export function readCustomerSort(params: URLSearchParams): { field: CustomerSortField; direction: "asc" | "desc" } {
  const requested = params.get("sortBy");
  const field = CUSTOMER_SORT_FIELDS.find(item => item.value === requested)?.value ?? "createdAt";
  return { field, direction: params.get("sortDirection") === "asc" ? "asc" : "desc" };
}

export function changeCustomerSort(params: URLSearchParams, field: CustomerSortField, direction?: "asc" | "desc") {
  const current = readCustomerSort(params);
  const next = new URLSearchParams(params);
  next.set("sortBy", field);
  next.set("sortDirection", direction ?? (current.field === field && current.direction === "asc" ? "desc" : "asc"));
  next.set("page", "1");
  return next;
}
