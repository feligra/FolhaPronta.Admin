import { AlertCircle, Loader2, Pause, Play, RefreshCw, Search } from "lucide-react";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { SYSTEM_LOG_LIMIT, useSystemLogs } from "@/hooks/useSystemLogs";
import { formatDateTime } from "@/utils/format";
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
              onChange={event => logs.changeSearch(event.target.value)} placeholder="Ex.: pagamento recusado" autoComplete="off" />
          </div>
        </label>
        <label className="text-sm font-semibold sm:w-48">Nível
          <select className="input mt-1 font-normal" value={logs.level} onChange={event => logs.changeLevel(event.target.value as SystemLogLevel | "")}>
            <option value="">Todos os níveis</option>
            {LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-cinza">A busca ignora maiúsculas e minúsculas e considera o texto já sanitizado. Os filtros ficam apenas nesta tela.</p>
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
      <p className="text-sm text-cinza">{logs.entries.length.toLocaleString("pt-BR")} {logs.entries.length === 1 ? "registro" : "registros"} na tela · mais recentes primeiro</p>
      {logs.entries.length === 0 && !logs.error && logs.connection !== "loading" && <p className="card text-sm text-cinza">Nenhum registro encontrado para estes filtros.</p>}
      {logs.entries.map(entry => <LogItem key={entry.id} entry={entry} />)}
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

function LogItem({ entry }: { entry: SystemLogEntry }) {
  const level = LEVELS.find(item => item.value === entry.level)!;
  return <article className="card min-w-0 space-y-2" data-log-id={entry.id}>
    <div className="flex flex-wrap items-center gap-2 text-xs text-cinza">
      <StatusPill tone={level.tone}>{level.label}</StatusPill>
      <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)} (Brasília)</time>
      <span className="font-mono">#{entry.id}</span>
    </div>
    <p className="break-words text-xs text-cinza [overflow-wrap:anywhere]">{entry.source}</p>
    <p className="whitespace-pre-wrap break-words font-mono text-sm text-tinta [overflow-wrap:anywhere]">{entry.message}</p>
    <details className="min-w-0 text-sm">
      <summary className="cursor-pointer rounded py-2 font-semibold text-coral focus-visible:outline-2">Detalhes do registro #{entry.id}</summary>
      {entry.exceptionType && <p className="mt-2 break-words [overflow-wrap:anywhere]"><strong>Tipo da exceção:</strong> {entry.exceptionType}</p>}
      <dl className="mt-2 space-y-2">
        {Object.entries(entry.properties).map(([key, value]) => <div key={key} className="min-w-0 rounded-md bg-tintaSoft-50 p-3">
          <dt className="break-words font-semibold [overflow-wrap:anywhere]">{key}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words font-mono text-xs [overflow-wrap:anywhere]">{value}</dd>
        </div>)}
      </dl>
      {!entry.exceptionType && Object.keys(entry.properties).length === 0 && <p className="text-xs text-cinza">Sem propriedades adicionais.</p>}
    </details>
  </article>;
}
