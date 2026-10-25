import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Users,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type { AdminUserListItem, AdminUsersListResponse, CustomerSortField, SubscriptionStatus } from "@/types";
import { classNames, formatDate, formatDateTime } from "@/utils/format";
import { changeCustomerSort, CUSTOMER_SORT_FIELDS, readCustomerSort } from "@/utils/customerSorting";
import {
  SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE, USER_TYPE_LABEL,
} from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";
import { EmailConfirmationPill } from "@/components/EmailConfirmationPill";
import { TrialStatus } from "@/components/TrialStatus";
import { useVisiblePageRefresh } from "@/hooks/useVisiblePageRefresh";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Filtros vivem na URL — admin pode bookmarkar/compartilhar uma busca filtrada.
  const search = params.get("search") ?? "";
  const isActive = params.get("isActive"); // "true" | "false" | null
  const role = params.get("role") ?? ""; // "" | "Admin" | "User"
  const requestedPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { field: sortBy, direction: sortDirection } = readCustomerSort(params);

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<AdminUsersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce do search box: 300ms — espera o admin parar de digitar antes de
  // bater no backend. Sem isso, cada tecla dispara uma request.
  const loadVersion = useRef(0);
  const activeLoads = useRef(0);
  useEffect(() => () => { loadVersion.current++; }, []);
  useEffect(() => { setSearchInput(search); }, [search]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchInput.trim() === search) return;
    debounceRef.current = setTimeout(() => {
      setParams((current) => {
      const next = new URLSearchParams(current);
      if (searchInput.trim()) next.set("search", searchInput.trim());
      else next.delete("search");
      next.set("page", "1"); // qualquer mudança no filtro volta pra pág 1
      return next;
      }, { replace: true });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search, setParams]);

  const load = async (background = false) => {
    if (background && activeLoads.current > 0) return;
    activeLoads.current++;
    const version = ++loadVersion.current;
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const r = await adminApi.users.list({
        search: search || undefined,
        isActive: isActive === null ? undefined : isActive === "true",
        role: role || undefined,
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        sortDirection,
      });
      if (version === loadVersion.current) { setData(r); setError(null); }
    } catch (err: unknown) {
      if (version !== loadVersion.current) return;
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar clientes.";
      if (!background) setError(msg);
    } finally {
      activeLoads.current--;
      if (version === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, isActive, role, page, sortBy, sortDirection]);
  useVisiblePageRefresh(() => { void load(true); });

  const updateFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    next.set("page", "1");
    setParams(next, { replace: true });
  };

  const goToPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next);
  };

  const sort = (field: CustomerSortField, direction?: "asc" | "desc") => {
    setParams(current => changeCustomerSort(current, field, direction));
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0, paying: 0, pending: 0 };
    return {
      total: data.totalCount,
      active: data.items.filter((u) => u.isActive).length,
      paying: data.items.filter((u) => u.isPaidPlan).length,
      pending: data.items.filter((u) => u.subscriptionStatus === "PendingPayment").length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Clientes</h1>
          <p className="mt-1 text-sm text-cinza">
            Todos os usuários cadastrados no FolhaPronta.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-ghost" title="Recarregar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recarregar
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total (filtro atual)" value={stats.total} />
        <Stat label="Ativos (página)" value={stats.active} />
        <Stat label="Plano pago vigente (página)" value={stats.paying} tone="erva" />
        <Stat label="Pagamento pendente (página)" value={stats.pending} tone="amarelo" />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="input pl-9"
            />
          </div>
          <select
            value={isActive ?? ""}
            onChange={(e) => updateFilter("isActive", e.target.value || null)}
            className="input sm:w-[180px]"
          >
            <option value="">Status: todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
          <select
            value={role}
            onChange={(e) => updateFilter("role", e.target.value || null)}
            className="input sm:w-[160px]"
          >
            <option value="">Role: todos</option>
            <option value="User">User</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="customer-sort" className="text-xs font-semibold text-cinza">Ordenar por</label>
          <select id="customer-sort" value={sortBy} onChange={e => sort(e.target.value as CustomerSortField)} className="input w-full sm:w-auto">
            {CUSTOMER_SORT_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
          </select>
          <button type="button" onClick={() => sort(sortBy)} className="btn-ghost text-xs"
            aria-label={`Ordenar em ordem ${sortDirection === "asc" ? "decrescente" : "crescente"}`}>
            {sortDirection === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
            {sortDirection === "asc" ? "Crescente" : "Decrescente"}
          </button>
          <span className="text-xs text-cinza">Datas e horários de Brasília.</span>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-coral-50 p-3 text-sm text-coral-800">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center gap-2 py-12 text-cinza">
            <Loader2 size={18} className="animate-spin" /> Carregando…
          </div>
        )}

        {data && (
          <>
            {/* Tabela desktop */}
            <div className="hidden overflow-x-auto rounded-md border border-tintaSoft-100 lg:block">
              <table className="w-full text-sm" aria-busy={loading}>
                <thead className="bg-tintaSoft-50/40 text-left text-[11px] font-semibold uppercase tracking-wider text-cinza">
                  <tr>
                    <SortHeader label="Usuário" field="name" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Tipo" field="userType" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Plano / teste grátis" field="planSlug" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Assinatura" field="subscriptionStatus" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Atividades" field="totalActivitiesGenerated" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Cadastro" field="createdAt" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Último login" field="lastLoginAt" current={sortBy} direction={sortDirection} onSort={sort} />
                    <th scope="col" className="px-4 py-3 w-8" aria-label="Abrir cliente" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <Row key={u.id} user={u} onClick={() => navigate(`/clientes/${u.id}`)} />
                  ))}
                </tbody>
              </table>
              {data.items.length === 0 && <EmptyState />}
            </div>

            {/* Cards mobile */}
            <div className="space-y-3 lg:hidden">
              {data.items.map((u) => (
                <MobileCard key={u.id} user={u} onClick={() => navigate(`/clientes/${u.id}`)} />
              ))}
              {data.items.length === 0 && <EmptyState />}
            </div>

            {/* Paginação */}
            <Paginator
              page={data.page}
              totalPages={data.totalPages}
              totalCount={data.totalCount}
              pageSize={data.pageSize}
              onChange={goToPage}
              loading={loading}
            />
          </>
        )}
      </section>
    </div>
  );
}

function SortHeader({ label, field, current, direction, onSort }: {
  label: string; field: CustomerSortField; current: CustomerSortField; direction: "asc" | "desc";
  onSort: (field: CustomerSortField) => void;
}) {
  const active = current === field;
  const nextDirection = active && direction === "asc" ? "decrescente" : "crescente";
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return <th scope="col" className="px-4 py-3" aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" onClick={() => onSort(field)} aria-label={`Ordenar por ${label} em ordem ${nextDirection}`}
      className="inline-flex items-center gap-1.5 rounded text-left font-semibold uppercase tracking-wider hover:text-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral">
      {label}<Icon size={13} className="shrink-0" aria-hidden />
    </button>
  </th>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "erva" | "amarelo" }) {
  const toneCls =
    tone === "erva" ? "text-erva" :
    tone === "amarelo" ? "text-amarelo-800" :
    "text-tinta";
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</span>
      <span className={classNames("font-display text-2xl font-bold", toneCls)}>{value}</span>
    </div>
  );
}

function Row({ user, onClick }: { user: AdminUserListItem; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-t border-tintaSoft-100 transition hover:bg-coral-50/40"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} role={user.role} />
          <div className="min-w-0">
            <div className="truncate font-medium text-tinta">{user.name}</div>
            <div className="truncate text-xs text-cinza">{user.email}</div>
            <div className="mt-1"><EmailConfirmationPill confirmed={user.emailConfirmed} /></div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-tinta/80">
        {USER_TYPE_LABEL[user.userType] ?? user.userType}
      </td>
      <td className="px-4 py-3">
        <PlanBadge slug={user.planSlug} />
        <div className="mt-2 min-w-[170px]"><TrialStatus user={user} details /></div>
      </td>
      <td className="px-4 py-3">
        <SubBadge status={user.subscriptionStatus} />
      </td>
      <td className="px-4 py-3"><strong>{user.totalActivitiesGenerated ?? 0}</strong><span className="mt-0.5 block whitespace-nowrap text-[11px] text-cinza">{user.lastActivityGeneratedAt ? `Última: ${formatDate(user.lastActivityGeneratedAt)}` : "Sem geração registrada"}</span></td>
      <td className="px-4 py-3 text-xs text-cinza">{formatDate(user.createdAt)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-cinza">{formatDateTime(user.lastLoginAt)}</td>
      <td className="px-4 py-3 text-cinza"><ChevronRight size={16} /></td>
    </tr>
  );
}

function MobileCard({ user, onClick }: { user: AdminUserListItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="card flex cursor-pointer items-start gap-3 active:bg-coral-50/40"
    >
      <Avatar name={user.name} role={user.role} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium text-tinta">{user.name}</div>
            <div className="truncate text-xs text-cinza">{user.email}</div>
          </div>
          <ChevronRight size={16} className="text-cinza" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PlanBadge slug={user.planSlug} />
          <SubBadge status={user.subscriptionStatus} />
          <span className="text-[10px] text-cinza">{USER_TYPE_LABEL[user.userType] ?? ""}</span>
        </div>
        <div className="mt-2"><TrialStatus user={user} details /></div>
        <p className="mt-2 text-xs text-cinza"><strong className="text-tinta">{user.totalActivitiesGenerated ?? 0} atividade(s)</strong> · {user.lastActivityGeneratedAt ? `Última: ${formatDate(user.lastActivityGeneratedAt)}` : "Sem geração registrada"}</p>
        <div className="mt-2"><EmailConfirmationPill confirmed={user.emailConfirmed} /></div>
        <p className="mt-2 text-xs text-cinza">Último login: {formatDateTime(user.lastLoginAt)}</p>
      </div>
    </div>
  );
}

function Avatar({ name, role, size = 36 }: { name: string; role: string; size?: number }) {
  const initial = name?.charAt(0).toUpperCase() || "?";
  const isAdmin = role === "Admin";
  return (
    <div
      className={classNames(
        "flex flex-shrink-0 items-center justify-center rounded-md font-bold",
        isAdmin ? "bg-coral text-creme" : "bg-tintaSoft-50 text-tinta"
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

function PlanBadge({ slug }: { slug: string | null }) {
  if (!slug) return <span className="text-xs text-cinza">Sem plano</span>;
  return (
    <span className="rounded-md bg-amarelo-100 px-2 py-0.5 text-xs font-semibold uppercase text-amarelo-900">
      {slug}
    </span>
  );
}

function SubBadge({ status }: { status: SubscriptionStatus | null }) {
  if (!status) return <span className="text-xs text-cinza">—</span>;
  return (
    <StatusPill tone={SUBSCRIPTION_STATUS_TONE[status]}>
      {SUBSCRIPTION_STATUS_LABEL[status]}
    </StatusPill>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-cinza">
      <Users size={28} className="opacity-40" />
      <p className="text-sm">Nenhum cliente encontrado.</p>
    </div>
  );
}

function Paginator({
  page, totalPages, totalCount, pageSize, onChange, loading,
}: {
  page: number; totalPages: number; totalCount: number; pageSize: number;
  onChange: (p: number) => void; loading: boolean;
}) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 text-sm text-cinza sm:flex-row sm:items-center sm:justify-between">
      <span>
        {totalCount === 0 ? "Nenhum resultado" : `${from}–${to} de ${totalCount}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onChange(page - 1)}
          className="btn-ghost h-8 px-2"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs">
          Pág <strong className="text-tinta">{page}</strong> de {totalPages || 1}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onChange(page + 1)}
          className="btn-ghost h-8 px-2"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
