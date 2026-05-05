import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle, ChevronLeft, ChevronRight, Loader2, Mail, RefreshCw, Search,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type {
  AdminEmailLogItem, AdminEmailLogsResponse, EmailLogStatus,
} from "@/types";
import { classNames, formatDateTime } from "@/utils/format";
import { StatusPill, type Tone } from "@/components/StatusPill";

const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: EmailLogStatus | ""; label: string }[] = [
  { value: "", label: "Status: todos" },
  { value: "Sent", label: "Enviados" },
  { value: "Failed", label: "Falharam" },
  { value: "Pending", label: "Pendentes" },
  { value: "SkippedDev", label: "Pulados (dev)" },
];

const STATUS_LABEL: Record<EmailLogStatus, string> = {
  Sent: "Enviado",
  Failed: "Falhou",
  Pending: "Pendente",
  SkippedDev: "Pulado (dev)",
};

const STATUS_TONE: Record<EmailLogStatus, Tone> = {
  Sent: "erva",
  Failed: "coral",
  Pending: "amarelo",
  SkippedDev: "neutral",
};

const TEMPLATE_OPTIONS = [
  { value: "", label: "Template: todos" },
  { value: "Confirmation", label: "Confirmação de email" },
  { value: "Welcome", label: "Boas-vindas" },
  { value: "PasswordReset", label: "Redefinição de senha" },
  { value: "OrganizationInvite", label: "Convite de organização" },
];

export default function EmailLogsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = (params.get("status") as EmailLogStatus | null) ?? "";
  const template = params.get("template") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1"));

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<AdminEmailLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const r = await adminApi.emailLogs.list({
        search: search || undefined,
        status: status || undefined,
        template: template || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(r);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar logs."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, status, template, page]);

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

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Logs de email</h1>
          <p className="mt-1 text-sm text-cinza">
            Auditoria de emails transacionais. Status, falhas e templates.
          </p>
        </div>
        <button onClick={load} className="btn-ghost" title="Recarregar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recarregar
        </button>
      </header>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por destinatário ou assunto…"
              className="input pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => updateFilter("status", e.target.value || null)}
            className="input sm:w-[180px]"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={template}
            onChange={(e) => updateFilter("template", e.target.value || null)}
            className="input sm:w-[220px]"
          >
            {TEMPLATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Destinatário</th>
                    <th className="px-4 py-3">Assunto</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Criado</th>
                    <th className="px-4 py-3">Enviado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((log) => (
                    <Row
                      key={log.id}
                      log={log}
                      expanded={expandedId === log.id}
                      onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    />
                  ))}
                </tbody>
              </table>
              {data.items.length === 0 && <EmptyState />}
            </div>

            {/* Cards mobile */}
            <div className="space-y-3 lg:hidden">
              {data.items.map((log) => <MobileCard key={log.id} log={log} />)}
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
    </div>
  );
}

function Row({
  log, expanded, onToggle,
}: { log: AdminEmailLogItem; expanded: boolean; onToggle: () => void }) {
  const isFailed = log.status === "Failed";
  return (
    <>
      <tr
        onClick={isFailed ? onToggle : undefined}
        className={classNames(
          "border-t border-tintaSoft-100",
          isFailed && "cursor-pointer hover:bg-coral-50/40"
        )}
      >
        <td className="px-4 py-3">
          <StatusPill tone={STATUS_TONE[log.status]}>{STATUS_LABEL[log.status]}</StatusPill>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-tinta">{log.toEmail}</td>
        <td className="px-4 py-3 text-tinta">{log.subject}</td>
        <td className="px-4 py-3 text-xs text-cinza">{log.templateName}</td>
        <td className="px-4 py-3 text-xs text-cinza">{formatDateTime(log.createdAt)}</td>
        <td className="px-4 py-3 text-xs text-cinza">{formatDateTime(log.sentAt)}</td>
      </tr>
      {expanded && log.errorMessage && (
        <tr>
          <td colSpan={6} className="border-t border-coral/30 bg-coral-50 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-coral-800">
              Erro do SMTP
            </p>
            <pre className="whitespace-pre-wrap break-all text-xs text-coral-900">
              {log.errorMessage}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileCard({ log }: { log: AdminEmailLogItem }) {
  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-tinta">{log.subject}</p>
          <p className="truncate font-mono text-xs text-cinza">{log.toEmail}</p>
        </div>
        <StatusPill tone={STATUS_TONE[log.status]}>{STATUS_LABEL[log.status]}</StatusPill>
      </div>
      <div className="flex items-center justify-between text-xs text-cinza">
        <span>{log.templateName}</span>
        <span>{formatDateTime(log.sentAt ?? log.createdAt)}</span>
      </div>
      {log.errorMessage && (
        <pre className="whitespace-pre-wrap break-all rounded-md bg-coral-50 p-2 text-xs text-coral-900">
          {log.errorMessage}
        </pre>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-cinza">
      <Mail size={28} className="opacity-40" />
      <p className="text-sm">Nenhum email registrado neste filtro.</p>
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
