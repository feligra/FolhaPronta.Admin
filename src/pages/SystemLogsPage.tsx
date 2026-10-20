import { useState } from "react";
import { AlertCircle, Check, Copy, ListTree, Loader2, Pause, Play, RefreshCw, Search } from "lucide-react";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { SYSTEM_LOG_LIMIT, useSystemLogs } from "@/hooks/useSystemLogs";
import { formatDateTime } from "@/utils/format";
import { ERROR_FIELDS, getLogDiagnostic, logDiagnosticText, logFieldLabel, logFieldValue, REQUEST_FIELDS, visibleLogValue } from "@/utils/systemLogDiagnostics";
import type { SystemLogEntry, SystemLogLevel } from "@/types";

const LEVELS: { value: SystemLogLevel; label: string; tone: Tone }[] = [
  { value: "Verbose", label: "Detalhado", tone: "neutral" },
  { value: "Debug", label: "Depuração", tone: "neutral" },
  { value: "Information", label: "Informação", tone: "lavanda" },
  { value: "Warning", label: "Aviso", tone: "amarelo" },
  { value: "Error", label: "Erro", tone: "coral" },
  { value: "Fatal", label: "Crítico", tone: "coral" },
];

export default function SystemLogsPage() {
  const logs = useSystemLogs();
  const [expanded, setExpanded] = useState(false);
  const correlate = (id: string) => { logs.changeLevel(""); logs.changeSearch(id.slice(0, 200)); };
  const status = logs.connection === "hidden" ? "Atualização suspensa: aba em segundo plano"
    : logs.connection === "paused" ? "Atualização pausada"
    : logs.connection === "reconnecting" ? `Reconectando…${logs.retrySeconds ? ` nova tentativa em até ${logs.retrySeconds}s` : ""}`
    : logs.connection === "loading" ? "Carregando registros…" : "Ao vivo";
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold text-tinta">Logs do sistema</h1>
        <p className="mt-1 text-sm text-cinza">Acompanhe os registros da API FolhaPronta. Horários de Brasília (America/Sao_Paulo).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={logs.reload}><RefreshCw size={14} />Recarregar</button>
        <button type="button" className="btn-primary" onClick={logs.toggleLive}>
          {logs.live ? <Pause size={14} /> : <Play size={14} />}{logs.live ? "Pausar ao vivo" : "Retomar ao vivo"}
        </button>
      </div>
    </header>
    <section className="card space-y-3" aria-label="Filtros dos logs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-semibold">Buscar palavra ou frase
          <div className="relative mt-1">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
            <input type="search" className="input pl-9 font-normal" value={logs.search} maxLength={200}
              onChange={event => logs.changeSearch(event.target.value)} placeholder="Mensagem, código da falha, TraceId, usuário…" autoComplete="off" />
          </div>
        </label>
        <label className="text-sm font-semibold sm:w-48">Nível
          <select className="input mt-1 font-normal" value={logs.level} onChange={event => logs.changeLevel(event.target.value as SystemLogLevel | "")}>
            <option value="">Todos os níveis</option>
            {LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-cinza">Busque por motivo, etapa, código ou identificador. A busca ignora maiúsculas e minúsculas; credenciais e dados pessoais são ocultados antes da exibição.</p>
      <p className="text-xs text-cinza">Depuração e Detalhado mostram os passos registrados pela API. Registros antigos não ganham detalhes retroativamente.</p>
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-tinta" data-log-connection={logs.connection}>
        {(logs.connection === "loading" || logs.connection === "reconnecting") && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {status}
      </p>
    </section>
    <section aria-label="Histórico disponível" className="rounded-xl border border-amarelo/30 bg-amarelo-50 p-4 text-sm text-tinta">
      <p>Os registros começam na implantação deste recurso. Logs antigos de arquivos não são importados. Esta tela reúne somente registros da API, sem logs do navegador ou do painel externo da Stripe.</p>
      {logs.metadata && <div className="mt-2 space-y-1 text-xs">
        <p>Retenção: até {logs.metadata.retentionDays} dias e {logs.metadata.capacity.toLocaleString("pt-BR")} registros. Mais antigo disponível: {formatDateTime(logs.metadata.oldestAvailableAt)} (Brasília).</p>
        {logs.metadata.droppedCount > 0 && <p>{logs.metadata.droppedCount.toLocaleString("pt-BR")} registros descartados pelo servidor.</p>}
        {!logs.metadata.persistenceAvailable && <p className="font-semibold">Persistência em disco indisponível. Os registros em memória podem ser perdidos ao reiniciar a API.</p>}
      </div>}
    </section>
    {logs.resetNotice && <p role="status" className="rounded-xl border border-tintaSoft-100 p-3 text-sm">A janela de registros mudou. A lista foi recarregada com o histórico ainda disponível.</p>}
    {logs.error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 p-3 text-sm text-coral-800"><AlertCircle size={16} className="shrink-0" />{logs.error}</p>}
    {logs.omitted > 0 && <p className="text-sm text-cinza">{logs.omitted.toLocaleString("pt-BR")} registros mais antigos foram omitidos da tela. O limite é de {SYSTEM_LOG_LIMIT.toLocaleString("pt-BR")}; refine a busca para consultar outro trecho.</p>}
    {logs.omitted === 0 && logs.entries.length >= SYSTEM_LOG_LIMIT && <p className="text-sm text-cinza">A tela atingiu o limite de {SYSTEM_LOG_LIMIT.toLocaleString("pt-BR")} registros. Refine a busca para consultar outro trecho do histórico.</p>}
    <section aria-label="Registros do sistema" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-cinza">{logs.entries.length.toLocaleString("pt-BR")} {logs.entries.length === 1 ? "registro" : "registros"} na tela · mais recentes primeiro</p>
        <button type="button" className="btn-ghost" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>
          <ListTree size={14} aria-hidden />{expanded ? "Recolher detalhes" : "Expandir todos os detalhes"}
        </button>
      </div>
      {logs.entries.length === 0 && !logs.error && logs.connection !== "loading" && <p className="card text-sm text-cinza">Nenhum registro encontrado para estes filtros.</p>}
      {logs.entries.map(entry => <LogItem key={`${logs.metadata?.instanceId || "logs"}-${entry.id}`} entry={entry} expanded={expanded} onCorrelate={correlate} />)}
    </section>
    <div className="space-y-2">
      {logs.historyError && <p role="alert" className="text-sm text-coral-800">{logs.historyError}</p>}
      <button type="button" className="btn-ghost" onClick={logs.loadOlder}
        disabled={logs.historyLoading || logs.nextBefore === null || logs.entries.length >= SYSTEM_LOG_LIMIT || logs.connection === "hidden"}>
        {logs.historyLoading && <Loader2 size={14} className="animate-spin" />}
        {logs.historyLoading ? "Carregando anteriores…" : "Carregar anteriores"}
      </button>
    </div>
  </div>;
}

function LogItem({ entry, expanded, onCorrelate }: { entry: SystemLogEntry; expanded: boolean; onCorrelate: (id: string) => void }) {
  const level = LEVELS.find(item => item.value === entry.level)!;
  const diagnostic = getLogDiagnostic(entry);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const fields = Object.entries(entry.properties);
  const requestFields = fields.filter(([key]) => REQUEST_FIELDS.has(key));
  const otherFields = fields.filter(([key]) => !REQUEST_FIELDS.has(key) && !ERROR_FIELDS.has(key));
  const failure = ["Warning", "Error", "Fatal"].includes(entry.level);
  async function copy() {
    setCopyStatus("copying");
    try { await navigator.clipboard.writeText(logDiagnosticText(entry)); setCopyStatus("copied"); }
    catch { setCopyStatus("failed"); }
  }
  return <article className="card min-w-0 space-y-3" data-log-id={entry.id}>
    <div className="flex flex-wrap items-center gap-2 text-xs text-cinza">
      <StatusPill tone={level.tone}>{level.label}</StatusPill>
      <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)} (Brasília)</time>
      <span className="font-mono">#{entry.id}</span>
    </div>
    <p className="break-words text-xs text-cinza [overflow-wrap:anywhere]">{entry.source}</p>
    {(diagnostic.stage || diagnostic.httpStatus) && <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {diagnostic.stage && <p className="min-w-0 break-words [overflow-wrap:anywhere]"><strong>Etapa:</strong> {diagnostic.stage}</p>}
      {diagnostic.httpStatus && <p><strong>HTTP:</strong> {diagnostic.httpStatus}</p>}
    </div>}
    {failure && (diagnostic.reason || diagnostic.action) && <div className={`space-y-2 rounded-lg border-l-4 p-3 text-sm ${entry.level === "Warning" ? "border-amarelo bg-amarelo-50" : "border-coral bg-coral-50"}`} data-log-diagnostic>
      {diagnostic.reason && <div><p className="font-semibold">Motivo identificado</p><p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{diagnostic.reason}</p></div>}
      {diagnostic.action && <div><p className="font-semibold">Próxima ação</p><p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{diagnostic.action}</p></div>}
    </div>}
    {failure && diagnostic.configurationHelp && !diagnostic.action && <div className="space-y-1 rounded-lg border border-amarelo/40 bg-amarelo-50 p-3 text-sm" data-log-configuration>
      <p className="font-semibold">Verificação de configuração local</p>
      <p>{diagnostic.configurationHelp.reason}</p>
      <p className="break-words [overflow-wrap:anywhere]">{diagnostic.configurationHelp.action}</p>
      <p className="text-xs">Resultado registrado neste evento. Esta verificação não confirma uma resposta da Stripe.</p>
    </div>}
    <p className="whitespace-pre-wrap break-words font-mono text-sm text-tinta [overflow-wrap:anywhere]">{entry.message}</p>
    <div className="flex flex-wrap items-center gap-2">
      {diagnostic.correlation && diagnostic.correlation.length <= 200 && <button type="button" className="btn-ghost" onClick={() => onCorrelate(diagnostic.correlation!)}>
        <ListTree size={14} aria-hidden />Ver trajetória desta requisição
      </button>}
      <button type="button" className="btn-ghost" onClick={copy} disabled={copyStatus === "copying"}>
        {copyStatus === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {copyStatus === "copied" ? "Diagnóstico copiado" : "Copiar diagnóstico"}
      </button>
      <span className="text-xs text-cinza" role="status" aria-live="polite">{copyStatus === "copied" ? "Texto exibido copiado, com os dados sensíveis ocultados." : copyStatus === "failed" ? "O navegador bloqueou a cópia. Expanda os detalhes para selecionar o texto." : ""}</span>
    </div>
    <details open={expanded} className="min-w-0 border-t border-tintaSoft-100 pt-1 text-sm">
      <summary className="cursor-pointer rounded py-2 font-semibold text-coral focus-visible:outline-2">Detalhes do registro #{entry.id}</summary>
      {(entry.exceptionType || fields.some(([key]) => ERROR_FIELDS.has(key))) && <section aria-label="Erro e causas" className="mt-3 min-w-0 space-y-3">
        <h3 className="font-semibold">Erro e causas</h3>
        <LogFields fields={[
          ...(entry.exceptionType ? [["Tipo da exceção", entry.exceptionType] as [string, string]] : []),
          ...fields.filter(([key]) => ERROR_FIELDS.has(key) && key !== "ErrorStackTrace"),
        ]} />
        {visibleLogValue(entry.properties.ErrorStackTrace) && <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold">Local da falha · métodos e linhas disponíveis</p>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-tintaSoft-50 p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">{entry.properties.ErrorStackTrace}</pre>
        </div>}
        {entry.properties.ErrorStackTrace !== undefined && !visibleLogValue(entry.properties.ErrorStackTrace) && <p className="text-xs text-cinza">Local da falha não disponível neste registro.</p>}
      </section>}
      {requestFields.length > 0 && <section aria-label="Requisição e identificadores" className="mt-4 min-w-0 space-y-2">
        <h3 className="font-semibold">Requisição e identificadores</h3><LogFields fields={requestFields} />
      </section>}
      {otherFields.length > 0 && <section aria-label="Outros dados do evento" className="mt-4 min-w-0 space-y-2">
        <h3 className="font-semibold">Outros dados do evento</h3><LogFields fields={otherFields} />
      </section>}
      {!entry.exceptionType && fields.length === 0 && <p className="text-xs text-cinza">Sem propriedades adicionais. Este registro não contém mensagem de exceção, causas internas ou local da falha.</p>}
    </details>
  </article>;
}

function LogFields({ fields }: { fields: [string, string][] }) {
  return <dl className="min-w-0 divide-y divide-tintaSoft-100">
    {fields.map(([key, value]) => <div key={key} className="grid min-w-0 gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="break-words text-xs font-semibold text-cinza [overflow-wrap:anywhere]">{logFieldLabel(key)}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">{logFieldValue(key, value)}</dd>
    </div>)}
  </dl>;
}
