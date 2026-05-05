import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Users,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type { AdminUserListItem, AdminUsersListResponse, SubscriptionStatus } from "@/types";
import { classNames, formatDate } from "@/utils/format";
import {
  SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE, USER_TYPE_LABEL,
} from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Filtros vivem na URL — admin pode bookmarkar/compartilhar uma busca filtrada.
  const search = params.get("search") ?? "";
  const isActive = params.get("isActive"); // "true" | "false" | null
  const role = params.get("role") ?? ""; // "" | "Admin" | "User"
  const page = Math.max(1, Number(params.get("page") ?? "1"));

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<AdminUsersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce do search box: 300ms — espera o admin parar de digitar antes de
  // bater no backend. Sem isso, cada tecla dispara uma request.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchInput.trim()) next.set("search", searchInput.trim());
      else next.delete("search");
      next.set("page", "1"); // qualquer mudança no filtro volta pra pág 1
      setParams(next, { replace: true });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.users.list({
        search: search || undefined,
        isActive: isActive === null ? undefined : isActive === "true",
        role: role || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(r);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar clientes.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, isActive, role, page]);

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

  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0, paying: 0, pending: 0 };
    return {
      total: data.totalCount,
      active: data.items.filter((u) => u.isActive).length,
      paying: data.items.filter((u) => u.subscriptionStatus === "Active").length,
      pending: data.items.filter((u) => u.subscriptionStatus === "PendingPayment").length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Clientes</h1>
          <p className="mt-1 text-sm text-cinza">
            Todos os usuários cadastrados no FolhaPronta.
          </p>
        </div>
        <button onClick={load} className="btn-ghost" title="Recarregar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recarregar
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total (filtro atual)" value={stats.total} />
        <Stat label="Ativos (página)" value={stats.active} />
        <Stat label="Pagantes (página)" value={stats.paying} tone="erva" />
        <Stat label="Pagamento pendente" value={stats.pending} tone="amarelo" />
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
            <div className="hidden overflow-hidden rounded-md border border-tintaSoft-100 lg:block">
              <table className="w-full text-sm">
                <thead className="bg-tintaSoft-50/40 text-left text-[11px] font-semibold uppercase tracking-wider text-cinza">
                  <tr>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Plano</th>
                    <th className="px-4 py-3">Assinatura</th>
                    <th className="px-4 py-3">Cadastro</th>
                    <th className="px-4 py-3">Último login</th>
                    <th className="px-4 py-3 w-8" aria-label="abrir" />
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
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-tinta/80">
        {USER_TYPE_LABEL[user.userType] ?? user.userType}
      </td>
      <td className="px-4 py-3">
        <PlanBadge slug={user.planSlug} />
      </td>
      <td className="px-4 py-3">
        <SubBadge status={user.subscriptionStatus} />
      </td>
      <td className="px-4 py-3 text-xs text-cinza">{formatDate(user.createdAt)}</td>
      <td className="px-4 py-3 text-xs text-cinza">{formatDate(user.lastLoginAt)}</td>
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
    <div className="flex items-center justify-between gap-3 text-sm text-cinza">
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
