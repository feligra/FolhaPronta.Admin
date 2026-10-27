import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Ban, CalendarPlus, ChevronLeft, ChevronRight, CreditCard,
  Loader2, RefreshCw, Search, X,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type {
  AdminSubscriptionListItem, AdminSubscriptionsListResponse, SubscriptionStatus, SubscriptionSortField,
} from "@/types";
import { classNames, formatDate, formatDateTime, formatPrice, parseApiDate } from "@/utils/format";
import { SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE } from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";
import { BillingProviderReference } from "@/components/BillingProviderReference";
import { canCancelSubscription, canExtendSubscription, getSubscriptionStatus, hasSubscriptionAccess, isRenewalCancellation, subscriptionPeriodEnd, subscriptionReference } from "@/utils/billing";
import { useVisiblePageRefresh } from "@/hooks/useVisiblePageRefresh";
import { useAccessClock } from "@/hooks/useAccessClock";
import { changeSubscriptionSort, readSubscriptionSort, SUBSCRIPTION_SORT_FIELDS } from "@/utils/subscriptionSorting";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: SubscriptionStatus | ""; label: string }[] = [
  { value: "", label: "Status: todos" },
  { value: "Active", label: "Ativas" },
  { value: "PendingPayment", label: "Pagamento pendente" },
  { value: "Trialing", label: "Teste grátis vigente" },
  { value: "Cancelled", label: "Canceladas" },
  { value: "Paused", label: "Pausadas" },
  { value: "PastDue", label: "Em atraso" },
  { value: "Expired", label: "Expiradas" },
];

export default function SubscriptionsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = (params.get("status") as SubscriptionStatus | null) ?? "";
  const requestedPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { field: sortBy, direction: sortDirection } = readSubscriptionSort(params);
  const sort = (field: SubscriptionSortField) => setParams(changeSubscriptionSort(params, field), { replace: true });

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<AdminSubscriptionsListResponse | null>(null);
  const renderTime = Date.now();
  const nextExpiry = data?.items.reduce<{ value: string | null; time: number }>((next, sub) => {
    const value = subscriptionPeriodEnd(sub);
    const time = value ? parseApiDate(value).getTime() : NaN;
    return time > renderTime && time < next.time ? { value, time } : next;
  }, { value: null, time: Infinity }).value;
  // One timer drives every visible status, action and page counter. The server
  // retains control of filtering, ordering and pagination, even if refresh fails.
  const now = useAccessClock(nextExpiry);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state — só uma ação aberta por vez.
  const [modal, setModal] = useState<{ kind: "cancel" | "extend"; sub: AdminSubscriptionListItem } | null>(null);

  // Debounce do search (igual CustomersPage).
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
      next.set("page", "1");
      return next;
      }, { replace: true });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search, setParams]);

  const load = async (background = false) => {
    if (background && (activeLoads.current > 0 || modal || searchInput.trim() !== search)) return;
    activeLoads.current++;
    const version = ++loadVersion.current;
    if (!background) { setLoading(true); setError(null); }
    try {
      const r = await adminApi.subscriptions.list({
        search: search || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        sortDirection,
      });
      if (version !== loadVersion.current) return;
      const lastPage = Math.max(1, r.totalPages);
      if (page > lastPage) {
        setParams((current) => {
          const next = new URLSearchParams(current);
          next.set("page", String(lastPage));
          return next;
        }, { replace: true });
        return;
      }
      setData(r);
      setError(null);
    } catch (err: unknown) {
      if (version !== loadVersion.current) return;
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar assinaturas.";
      if (!background) setError(msg);
    } finally {
      activeLoads.current--;
      if (version === loadVersion.current) setLoading(false);
    }
  };

  const latestLoad = useRef(load);
  latestLoad.current = load;
  const finishModal = (owner: NonNullable<typeof modal>) => {
    // A request may finish after its modal was closed and another client opened.
    setModal(current => current === owner ? null : current);
    void latestLoad.current();
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, status, page, sortBy, sortDirection]);
  useVisiblePageRefresh(() => { void load(true); },
    data?.items.some(s => s.checkoutProgress || s.status === "PendingPayment") ? 3_000 : 15_000);

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
    if (!data) return { total: 0, active: 0, pending: 0, cancelled: 0, expired: 0 };
    return {
      total: data.totalCount,
      active: data.items.filter((s) => getSubscriptionStatus(s, now) === "Active").length,
      pending: data.items.filter((s) => getSubscriptionStatus(s, now) === "PendingPayment").length,
      cancelled: data.items.filter((s) => getSubscriptionStatus(s, now) === "Cancelled").length,
      expired: data.items.filter((s) => getSubscriptionStatus(s, now) === "Expired").length,
    };
  }, [data, now]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Assinaturas</h1>
          <p className="mt-1 text-sm text-cinza">
            Uma assinatura atual por cliente. Confira a vigência e gerencie as ações disponíveis.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-ghost" title="Recarregar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recarregar
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="Clientes (filtro atual)" value={stats.total} wide />
        <Stat label="Ativas (página)" value={stats.active} tone="erva" />
        <Stat label="Pendentes (página)" value={stats.pending} tone="amarelo" />
        <Stat label="Canceladas (página)" value={stats.cancelled} tone="coral" />
        <Stat label="Expiradas (página)" value={stats.expired} />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
            <input
              type="search"
              aria-label="Buscar cliente por nome ou e-mail"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou e-mail do cliente…"
              className="input pl-9"
            />
          </div>
          <select
            aria-label="Status da assinatura atual"
            value={status}
            onChange={(e) => updateFilter("status", e.target.value || null)}
            className="input sm:w-[220px]"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="subscription-sort" className="text-xs font-semibold text-cinza">Ordenar por</label>
          <select id="subscription-sort" value={sortBy} onChange={e => sort(e.target.value as SubscriptionSortField)} className="input w-full sm:w-auto">
            {SUBSCRIPTION_SORT_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
          </select>
          <button type="button" onClick={() => sort(sortBy)} className="btn-ghost text-xs"
            aria-label={`Ordenar em ordem ${sortDirection === "asc" ? "decrescente" : "crescente"}`}>
            {sortDirection === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
            {sortDirection === "asc" ? "Crescente" : "Decrescente"}
          </button>
          <span className="text-xs text-cinza">Ordenação aplicada a todos os resultados.</span>
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
                    <SortHeader label="Cliente" field="userName" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Plano" field="planName" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Provedor" field="provider" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Valor" field="monthlyAmount" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Status" field="status" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Vigência" field="currentPeriodEnd" current={sortBy} direction={sortDirection} onSort={sort} />
                    <SortHeader label="Criada" field="createdAt" current={sortBy} direction={sortDirection} onSort={sort} />
                    <th className="px-4 py-3 w-[140px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <Row
                      key={s.id}
                      sub={s}
                      now={now}
                      onCancel={() => setModal({ kind: "cancel", sub: s })}
                      onExtend={() => setModal({ kind: "extend", sub: s })}
                    />
                  ))}
                </tbody>
              </table>
              {data.items.length === 0 && <EmptyState />}
            </div>

            {/* Cards mobile */}
            <div className="space-y-3 lg:hidden">
              {data.items.map((s) => (
                <MobileCard
                  key={s.id}
                  sub={s}
                  now={now}
                  onCancel={() => setModal({ kind: "cancel", sub: s })}
                  onExtend={() => setModal({ kind: "extend", sub: s })}
                />
              ))}
              {data.items.length === 0 && <EmptyState />}
            </div>

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

      {modal?.kind === "cancel" && (
        <CancelModal
          key={modal.sub.id}
          sub={modal.sub}
          onClose={() => setModal(null)}
          onDone={() => finishModal(modal)}
        />
      )}
      {modal?.kind === "extend" && (
        <ExtendModal
          key={modal.sub.id}
          sub={modal.sub}
          onClose={() => setModal(null)}
          onDone={() => finishModal(modal)}
        />
      )}
    </div>
  );
}

function SortHeader({ label, field, current, direction, onSort }: {
  label: string; field: SubscriptionSortField; current: SubscriptionSortField;
  direction: "asc" | "desc"; onSort: (field: SubscriptionSortField) => void;
}) {
  const selected = current === field;
  const Icon = selected ? direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return (
    <th scope="col" className="px-4 py-3" aria-sort={selected ? direction === "asc" ? "ascending" : "descending" : "none"}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-tinta"
        aria-label={`Ordenar por ${label}`}>
        {label}<Icon size={13} aria-hidden />
      </button>
    </th>
  );
}

function Stat({ label, value, tone, wide }: { label: string; value: number; tone?: "erva" | "amarelo" | "coral"; wide?: boolean }) {
  const toneCls =
    tone === "erva" ? "text-erva" :
    tone === "amarelo" ? "text-amarelo-800" :
    tone === "coral" ? "text-coral-800" :
    "text-tinta";
  return (
    <div className={classNames("card flex flex-col gap-1", wide && "col-span-2 xl:col-span-1")}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</span>
      <span className={classNames("font-display text-2xl font-bold", toneCls)}>{value}</span>
    </div>
  );
}

function Row({
  sub, now, onCancel, onExtend,
}: { sub: AdminSubscriptionListItem; now: number; onCancel: () => void; onExtend: () => void }) {
  const periodEnd = subscriptionPeriodEnd(sub);
  const status = getSubscriptionStatus(sub, now);
  const hasAccess = hasSubscriptionAccess(sub, now);
  return (
    <tr className="border-t border-tintaSoft-100">
      <td className="px-4 py-3">
        <Link to={`/clientes/${sub.userId}`} className="block hover:underline">
          <div className="font-medium text-tinta">{sub.userName}</div>
          <div className="text-xs text-cinza">{sub.userEmail}</div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-tinta">{sub.planName}</div>
        <div className="text-[10px] uppercase tracking-wider text-cinza">{sub.planSlug}</div>
      </td>
      <td className="max-w-[220px] px-4 py-3">
        <BillingProviderReference provider={sub.provider} reference={subscriptionReference(sub)} />
      </td>
      <td className="px-4 py-3 text-sm text-tinta">
        <span className="whitespace-nowrap">R$ {formatPrice(sub.monthlyAmount)}/{sub.billingFrequencyMonths === 12 ? "ano" : "mês"}</span>
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={SUBSCRIPTION_STATUS_TONE[status]}>
          {sub.checkoutProgress?.subscriptionId === sub.id
            ? sub.checkoutProgress.status === "PaymentFailed" ? "Pagamento não confirmado" : "Em processamento"
            : SUBSCRIPTION_STATUS_LABEL[status]}
        </StatusPill>
        {sub.checkoutProgress && sub.checkoutProgress.subscriptionId !== sub.id && (
          <p className="mt-1 text-xs text-cinza">Nova contratação {sub.checkoutProgress.status === "PaymentFailed" ? "com pagamento não confirmado" : "em processamento"}: {sub.checkoutProgress.planName}</p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-cinza" title={formatDateTime(periodEnd)}>
        <div>{formatDate(periodEnd)}</div>
        {!hasAccess && status !== "PendingPayment" && <div className="mt-1">Sem acesso vigente</div>}
        {sub.canceledAt && <div className="text-coral-800">canc.: {formatDate(sub.canceledAt)}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-cinza">{formatDate(sub.createdAt)}</td>
      <td className="px-4 py-3">
        <SubscriptionActions sub={sub} now={now} onCancel={onCancel} onExtend={onExtend} />
      </td>
    </tr>
  );
}

function MobileCard({
  sub, now, onCancel, onExtend,
}: { sub: AdminSubscriptionListItem; now: number; onCancel: () => void; onExtend: () => void }) {
  const periodEnd = subscriptionPeriodEnd(sub);
  const status = getSubscriptionStatus(sub, now);
  const hasAccess = hasSubscriptionAccess(sub, now);
  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/clientes/${sub.userId}`} className="min-w-0 flex-1 hover:underline">
          <div className="truncate font-medium text-tinta">{sub.userName}</div>
          <div className="truncate text-xs text-cinza">{sub.userEmail}</div>
        </Link>
        <StatusPill tone={SUBSCRIPTION_STATUS_TONE[status]}>
          {sub.checkoutProgress?.subscriptionId === sub.id
            ? sub.checkoutProgress.status === "PaymentFailed" ? "Pagamento não confirmado" : "Em processamento"
            : SUBSCRIPTION_STATUS_LABEL[status]}
        </StatusPill>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cinza">
        <span>{sub.planName} · R$ {formatPrice(sub.monthlyAmount)}/{sub.billingFrequencyMonths === 12 ? "ano" : "mês"}</span>
        <span title={formatDateTime(periodEnd)}>{hasAccess ? "Até" : "Fim da vigência:"} {formatDate(periodEnd)}</span>
      </div>
      <BillingProviderReference provider={sub.provider} reference={subscriptionReference(sub)} />
      {sub.checkoutProgress && sub.checkoutProgress.subscriptionId !== sub.id && (
        <p className="text-xs text-cinza">Nova contratação {sub.checkoutProgress.status === "PaymentFailed" ? "com pagamento não confirmado" : "em processamento"}: {sub.checkoutProgress.planName}</p>
      )}
      <SubscriptionActions sub={sub} now={now} onCancel={onCancel} onExtend={onExtend} />
    </div>
  );
}

function SubscriptionActions({ sub, now, onCancel, onExtend }: {
  sub: AdminSubscriptionListItem; now: number; onCancel: () => void; onExtend: () => void;
}) {
  const canExtend = canExtendSubscription(sub, now);
  const canCancel = canCancelSubscription(sub, now);
  if (!canExtend && !canCancel) return <span className="text-xs text-cinza">Sem ações disponíveis</span>;
  const renewalOnly = isRenewalCancellation(sub, now);
  return (
    <div className="flex flex-wrap gap-2">
      {canExtend && <button type="button" onClick={onExtend} title="Estender vigência (cortesia)"
        className="btn-ghost h-auto min-h-9 px-2 text-xs">
        <CalendarPlus size={14} className="shrink-0" /> Estender
      </button>}
      {canCancel && <button type="button" onClick={onCancel} title={renewalOnly ? "Encerrar recorrência no provedor" : "Cancelar assinatura"}
        className="btn-ghost h-auto min-h-9 px-2 text-xs">
        <Ban size={14} className="shrink-0" /> {renewalOnly ? "Encerrar recorrência" : "Cancelar"}
      </button>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-cinza">
      <CreditCard size={28} className="opacity-40" />
      <p className="text-sm">Nenhuma assinatura encontrada.</p>
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
      <span>{totalCount === 0 ? "Nenhum resultado" : `${from}–${to} de ${totalCount}`}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={page <= 1 || loading}
          onClick={() => onChange(page - 1)}
          className="btn-ghost h-8 px-2"
        ><ChevronLeft size={14} /></button>
        <span className="text-xs">
          Pág <strong className="text-tinta">{page}</strong> de {totalPages || 1}
        </span>
        <button
          type="button"
          aria-label="Próxima página"
          disabled={page >= totalPages || loading}
          onClick={() => onChange(page + 1)}
          className="btn-ghost h-8 px-2"
        ><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

// ── Modal: cancelar ─────────────────────────────────────────────────────
function CancelModal({
  sub, onClose, onDone,
}: { sub: AdminSubscriptionListItem; onClose: () => void; onDone: () => void }) {
  const now = useAccessClock(subscriptionPeriodEnd(sub));
  const hasAccess = hasSubscriptionAccess(sub, now);
  const immediateOnly = sub.status === "Cancelled" || !hasAccess;
  const renewalOnly = isRenewalCancellation(sub, now);
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(immediateOnly);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!canCancelSubscription(sub)) {
      setErr("Esta assinatura não tem cancelamento disponível. Atualize a lista.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.subscriptions.cancel(sub.id, reason || undefined, immediate || immediateOnly || !hasSubscriptionAccess(sub));
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao cancelar.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title={renewalOnly ? "Encerrar recorrência" : "Cancelar assinatura"} onClose={onClose}>
      <p className="text-sm text-tinta/80">
        {renewalOnly ? <>
          A vigência de <strong>{sub.userName}</strong> ({sub.planName}) já terminou.
          Esta ação solicita o encerramento da recorrência no provedor para impedir novas renovações.
        </> : <>
        Vai cancelar a assinatura de <strong>{sub.userName}</strong> ({sub.planName}).
        {immediateOnly
          ? hasAccess
            ? " A assinatura e o acesso Premium serão encerrados imediatamente."
            : " A assinatura será encerrada imediatamente, incluindo qualquer renovação ainda pendente no provedor."
          : <> O cancelamento mantém acesso até <strong>{formatDate(sub.currentPeriodEnd)}</strong>.</>}
        </>}
      </p>

      <label className="label mt-4">Motivo (opcional)</label>
      <textarea
        className="input min-h-[70px]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: solicitação por suporte, fraude, conflito de cobrança…"
      />

      {!immediateOnly && <label className="mt-3 flex items-start gap-2 text-sm text-tinta">
        <input
          type="checkbox"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block font-semibold">Cortar acesso imediatamente</span>
          <span className="block text-[11px] text-cinza">
            Encerra a recorrência e o acesso Premium agora.
          </span>
        </span>
      </label>}

      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-coral">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
          {renewalOnly ? "Confirmar encerramento" : "Confirmar cancelamento"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: estender ─────────────────────────────────────────────────────
function ExtendModal({
  sub, onClose, onDone,
}: { sub: AdminSubscriptionListItem; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!canExtendSubscription(sub)) {
      setErr("A vigência desta assinatura terminou ou não permite extensão. Atualize a lista.");
      return;
    }
    if (days <= 0 || days > 365) {
      setErr("Dias deve estar entre 1 e 365.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.subscriptions.extend(sub.id, days, reason || undefined);
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao estender.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Estender vigência (cortesia)" onClose={onClose}>
      <p className="text-sm text-tinta/80">
        Estender a vigência de <strong>{sub.userName}</strong> ({sub.planName}).
        Vigência atual: <strong>{formatDate(sub.currentPeriodEnd)}</strong>.
        A cortesia será acrescentada ao período ainda vigente.
      </p>

      <label className="label mt-4">Dias de cortesia</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input w-24"
        />
        <span className="text-xs text-cinza">dias (1 a 365)</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {[7, 15, 30, 60, 90].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDays(n)}
            className={classNames(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              days === n ? "bg-tinta text-creme" : "bg-tintaSoft-50 text-tinta hover:bg-tintaSoft-100"
            )}
          >
            {n}d
          </button>
        ))}
      </div>

      <label className="label mt-4">Motivo (opcional)</label>
      <textarea
        className="input min-h-[70px]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: cortesia de boas-vindas, compensação por incidente…"
      />

      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
          Estender por {days} dias
        </button>
      </div>
    </Modal>
  );
}

// ── Modal genérico (fechável por overlay/Escape) ────────────────────────
function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="admin-dialog w-full max-w-md rounded-xl bg-creme p-4 shadow-xl sm:p-6" role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-tinta">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-cinza hover:text-tinta">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
