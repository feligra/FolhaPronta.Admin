import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle, Ban, CalendarPlus, ChevronLeft, ChevronRight, CreditCard,
  Loader2, RefreshCw, Search, X,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type {
  AdminSubscriptionListItem, AdminSubscriptionsListResponse, SubscriptionStatus,
} from "@/types";
import { classNames, formatDate, formatPrice } from "@/utils/format";
import { SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE } from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: SubscriptionStatus | ""; label: string }[] = [
  { value: "", label: "Status: todos" },
  { value: "Active", label: "Ativas" },
  { value: "PendingPayment", label: "Pagamento pendente" },
  { value: "Trialing", label: "Trial" },
  { value: "Cancelled", label: "Canceladas" },
  { value: "Paused", label: "Pausadas" },
  { value: "PastDue", label: "Em atraso" },
  { value: "Expired", label: "Expiradas" },
];

export default function SubscriptionsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = (params.get("status") as SubscriptionStatus | null) ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1"));

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<AdminSubscriptionsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state — só uma ação aberta por vez.
  const [modal, setModal] = useState<{ kind: "cancel" | "extend"; sub: AdminSubscriptionListItem } | null>(null);

  // Debounce do search (igual CustomersPage).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchInput.trim()) next.set("search", searchInput.trim());
      else next.delete("search");
      next.set("page", "1");
      setParams(next, { replace: true });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.subscriptions.list({
        search: search || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(r);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar assinaturas.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, status, page]);

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
    if (!data) return { total: 0, active: 0, pending: 0, cancelled: 0 };
    return {
      total: data.totalCount,
      active: data.items.filter((s) => s.status === "Active").length,
      pending: data.items.filter((s) => s.status === "PendingPayment").length,
      cancelled: data.items.filter((s) => s.status === "Cancelled").length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Assinaturas</h1>
          <p className="mt-1 text-sm text-cinza">
            Todas as assinaturas do sistema. Cancele, estenda ou pesquise por cliente.
          </p>
        </div>
        <button onClick={load} className="btn-ghost" title="Recarregar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recarregar
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total (filtro atual)" value={stats.total} />
        <Stat label="Ativas (página)" value={stats.active} tone="erva" />
        <Stat label="Pendentes (página)" value={stats.pending} tone="amarelo" />
        <Stat label="Canceladas (página)" value={stats.cancelled} tone="coral" />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou e-mail do cliente…"
              className="input pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => updateFilter("status", e.target.value || null)}
            className="input sm:w-[220px]"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Plano</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Vigência</th>
                    <th className="px-4 py-3">Criada</th>
                    <th className="px-4 py-3 w-[140px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <Row
                      key={s.id}
                      sub={s}
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
          sub={modal.sub}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
      {modal?.kind === "extend" && (
        <ExtendModal
          sub={modal.sub}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "erva" | "amarelo" | "coral" }) {
  const toneCls =
    tone === "erva" ? "text-erva" :
    tone === "amarelo" ? "text-amarelo-800" :
    tone === "coral" ? "text-coral-800" :
    "text-tinta";
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</span>
      <span className={classNames("font-display text-2xl font-bold", toneCls)}>{value}</span>
    </div>
  );
}

function Row({
  sub, onCancel, onExtend,
}: { sub: AdminSubscriptionListItem; onCancel: () => void; onExtend: () => void }) {
  // Cancelar só faz sentido em quem tem MP ativo ou ainda dá acesso —
  // botão fica disabled em Expired/já-Cancelled-sem-vigência.
  const canCancel = sub.status !== "Expired" && (sub.status !== "Cancelled" || sub.hasAccess);
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
      <td className="px-4 py-3 text-sm text-tinta">R$ {formatPrice(sub.monthlyAmount)}</td>
      <td className="px-4 py-3">
        <StatusPill tone={SUBSCRIPTION_STATUS_TONE[sub.status]}>
          {SUBSCRIPTION_STATUS_LABEL[sub.status]}
        </StatusPill>
      </td>
      <td className="px-4 py-3 text-xs text-cinza">
        <div>{formatDate(sub.currentPeriodEnd)}</div>
        {sub.canceledAt && <div className="text-coral-800">canc.: {formatDate(sub.canceledAt)}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-cinza">{formatDate(sub.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onExtend}
            className="rounded-md border border-tintaSoft-100 p-1.5 text-cinza hover:border-erva hover:text-erva"
            title="Estender vigência (cortesia)"
          >
            <CalendarPlus size={14} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={!canCancel}
            className="rounded-md border border-tintaSoft-100 p-1.5 text-cinza hover:border-coral hover:text-coral-800 disabled:cursor-not-allowed disabled:opacity-40"
            title={canCancel ? "Cancelar assinatura" : "Sem ação aplicável"}
          >
            <Ban size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MobileCard({
  sub, onCancel, onExtend,
}: { sub: AdminSubscriptionListItem; onCancel: () => void; onExtend: () => void }) {
  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/clientes/${sub.userId}`} className="min-w-0 flex-1 hover:underline">
          <div className="truncate font-medium text-tinta">{sub.userName}</div>
          <div className="truncate text-xs text-cinza">{sub.userEmail}</div>
        </Link>
        <StatusPill tone={SUBSCRIPTION_STATUS_TONE[sub.status]}>
          {SUBSCRIPTION_STATUS_LABEL[sub.status]}
        </StatusPill>
      </div>
      <div className="flex items-center justify-between text-xs text-cinza">
        <span>{sub.planName} · R$ {formatPrice(sub.monthlyAmount)}/mês</span>
        <span>até {formatDate(sub.currentPeriodEnd)}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onExtend} className="btn-ghost flex-1 h-8 text-xs">
          <CalendarPlus size={12} /> Estender
        </button>
        <button onClick={onCancel} className="btn-ghost flex-1 h-8 text-xs">
          <Ban size={12} /> Cancelar
        </button>
      </div>
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
    <div className="flex items-center justify-between gap-3 text-sm text-cinza">
      <span>{totalCount === 0 ? "Nenhum resultado" : `${from}–${to} de ${totalCount}`}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onChange(page - 1)}
          className="btn-ghost h-8 px-2"
        ><ChevronLeft size={14} /></button>
        <span className="text-xs">
          Pág <strong className="text-tinta">{page}</strong> de {totalPages || 1}
        </span>
        <button
          type="button"
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
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.subscriptions.cancel(sub.id, reason || undefined, immediate);
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao cancelar.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Cancelar assinatura" onClose={onClose}>
      <p className="text-sm text-tinta/80">
        Vai cancelar a assinatura de <strong>{sub.userName}</strong> ({sub.planName}).
        Cancelamento "civilizado" mantém acesso até <strong>{formatDate(sub.currentPeriodEnd)}</strong>.
      </p>

      <label className="label mt-4">Motivo (opcional)</label>
      <textarea
        className="input min-h-[70px]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: solicitação por suporte, fraude, conflito de cobrança…"
      />

      <label className="mt-3 flex items-start gap-2 text-sm text-tinta">
        <input
          type="checkbox"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block font-semibold">Cortar acesso imediatamente</span>
          <span className="block text-[11px] text-cinza">
            Marca <code>CurrentPeriodEnd</code> no passado — cliente perde acesso já.
            Use só em casos extremos (fraude, abuso).
          </span>
        </span>
      </label>

      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-coral">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
          Confirmar cancelamento
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
        Se a sub estiver Cancelled/Expired, será reativada como Active.
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

      <div className="mt-5 flex justify-end gap-2">
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
        className="w-full max-w-md rounded-xl bg-creme p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-tinta">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-cinza hover:text-tinta">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
