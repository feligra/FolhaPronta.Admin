import { useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowRight, Eye, Loader2, MousePointer2, RefreshCw, Users } from "lucide-react";
import { getTrackingReport } from "@/services/tracking";
import type { TrackingReport } from "@/types/tracking";
import { classNames, formatDateTime } from "@/utils/format";
import { TRACKING_EVENT_LABELS, trackingActivityLabel, trackingPathLabel } from "@/utils/trackingLabels";

const number = (value: number) => value.toLocaleString("pt-BR");
const dayLabel = (date: string) => date.slice(5).split("-").reverse().join("/");
const deviceLabel: Record<string, string> = { mobile: "Celular", tablet: "Tablet", desktop: "Computador" };

export default function BehaviorPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<TrackingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    getTrackingReport(days, controller.signal).then(report => {
      if (!controller.signal.aborted) setData(report);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [days, revision]);

  const report = data?.days === days ? data : null;
  const selected = report?.daily.find(item => item.date === selectedDay);
  const maxViews = Math.max(1, ...(report?.daily.map(item => item.pageViews) ?? []));

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-tinta">Comportamento</h1>
          <p className="mt-1 text-sm text-cinza">Veja as páginas visitadas e como as atividades são usadas.</p>
          {report && <p className="mt-1 text-xs text-cinza">Atualizado em {formatDateTime(report.generatedAt)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="tracking-period">Período</label>
          <select id="tracking-period" className="input !w-auto" value={days} onChange={event => {
            setDays(Number(event.target.value) as 7 | 30);
            setSelectedDay(null);
          }}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
          <button className="btn-ghost disabled:opacity-50" disabled={loading} onClick={() => setRevision(value => value + 1)}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </header>

      {error && <div role="alert" className="card flex flex-wrap items-center gap-3 text-coral-800">
        <AlertCircle size={18} className="shrink-0" />
        <p className="min-w-0 flex-1 text-sm">Não foi possível carregar o comportamento.{report && " Os números abaixo são da última consulta."}</p>
        <button className="btn-ghost" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button>
      </div>}
      {loading && !report && <p role="status" className="flex items-center justify-center gap-2 py-12 text-cinza"><Loader2 size={18} className="animate-spin" /> Carregando visitas…</p>}

      {report && <>
        <p className="rounded-lg bg-tintaSoft-50 p-3 text-xs leading-relaxed text-cinza">
          Somente visitas com análise de uso autorizada. Uma pessoa pode iniciar várias sessões. Os eventos ficam disponíveis por {report.retentionDays} dias; as contagens diárias usam UTC. Pagamentos confirmados estão em Métricas.
        </p>
        {report.summary.sessions === 0 && <div role="status" className="card border-dashed py-8 text-center">
          <MousePointer2 size={28} className="mx-auto mb-3 text-lavanda" />
          <h2 className="font-display text-lg font-bold">Nenhuma visita registrada neste período</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-cinza">As visitas aparecem depois que o rastreamento estiver publicado e a pessoa autorizar a análise de uso. Não há histórico anterior à ativação.</p>
        </div>}

        <section aria-label="Resumo das visitas" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Sessões", value: report.summary.sessions, icon: Users },
            { label: "Páginas vistas", value: report.summary.pageViews, icon: Eye },
            { label: "Atividades abertas", value: report.summary.activityOpens, icon: Activity },
            { label: "Prévias públicas ampliadas", value: report.summary.previewOpens, icon: MousePointer2 },
          ].map(({ label, value, icon: Icon }) => <div className="card" key={label}>
            <div className="flex items-center gap-2 text-sm text-cinza"><Icon size={17} className="shrink-0 text-lavanda" />{label}</div>
            <p className="mt-2 text-3xl font-bold tabular-nums">{number(value)}</p>
          </div>)}
        </section>

        <section className="card" aria-labelledby="tracking-usage-title">
          <h2 id="tracking-usage-title" className="font-display text-lg font-bold">Ações no período</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
            {[
              ["Gerações solicitadas", report.summary.generationRequests],
              ["Gerações recebidas", report.summary.generationSuccesses],
              ["Falhas de geração", report.summary.generationFailures],
              ["Downloads solicitados", report.summary.downloadClicks],
              ["Cadastros iniciados", report.summary.signupStarts],
              ["Pedidos de assinatura", report.summary.checkoutStarts],
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-cinza">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{number(Number(value))}</dd></div>)}
          </dl>
          <p className="mt-4 text-xs text-cinza">Pedidos de assinatura incluem checkout e troca de plano. Downloads incluem os iniciados após gerar uma atividade e não confirmam que o arquivo foi salvo.</p>
        </section>

        <section className="card" aria-labelledby="tracking-daily-title">
          <h2 id="tracking-daily-title" className="font-display text-lg font-bold">Navegação ao longo dos dias</h2>
          <p className="mt-1 text-xs text-cinza">Páginas vistas por dia. Selecione uma barra para ver os detalhes.</p>
          <div className="mt-5 flex h-36 items-end gap-1 border-b border-tinta/15" role="group" aria-label="Páginas vistas por dia">
            {report.daily.map(item => <button key={item.date} type="button"
              aria-label={`${dayLabel(item.date)}: ${number(item.pageViews)} páginas vistas`}
              aria-pressed={selectedDay === item.date}
              onClick={() => setSelectedDay(item.date)}
              className={classNames("min-w-0 flex-1 rounded-t-sm outline-offset-2 transition hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta", selectedDay === item.date ? "bg-coral" : "bg-lavanda")}
              style={{ height: `${Math.max(3, (item.pageViews / maxViews) * 100)}%` }}
            />)}
          </div>
          <div className="mt-2 flex justify-between text-xs text-cinza"><span>{dayLabel(report.daily[0]?.date ?? "")}</span><span>{dayLabel(report.daily[report.daily.length - 1]?.date ?? "")}</span></div>
          <p aria-live="polite" className="mt-3 min-h-5 text-sm">{selected
            ? `${dayLabel(selected.date)} · ${number(selected.pageViews)} páginas vistas · ${number(selected.sessions)} sessões · ${number(selected.activityOpens)} atividades abertas`
            : "Selecione um dia no gráfico."}</p>
        </section>

        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <section className="card" aria-labelledby="tracking-pages-title">
            <h2 id="tracking-pages-title" className="font-display text-lg font-bold">Páginas mais visitadas</h2>
            {!report.topPages.length && <Empty />}
            <ol className="mt-4 space-y-4">{report.topPages.map(item => <li key={item.path}>
              <div className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{trackingPathLabel(item.path)}</span><span className="shrink-0 tabular-nums">{number(item.views)} visitas</span></div>
              <p className="mt-0.5 break-all text-xs text-cinza">{item.path} · {number(item.sessions)} sessões</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tintaSoft-50"><div className="h-full rounded-full bg-lavanda" style={{ width: `${(item.views / Math.max(1, ...report.topPages.map(page => page.views))) * 100}%` }} /></div>
            </li>)}</ol>
          </section>
          <section className="card" aria-labelledby="tracking-journeys-title">
            <h2 id="tracking-journeys-title" className="font-display text-lg font-bold">Caminhos mais percorridos</h2>
            <p className="mt-1 text-xs text-cinza">Mudanças de página dentro da mesma sessão.</p>
            {!report.journeys.length && <Empty />}
            <ol className="mt-3 divide-y divide-tinta/10">{report.journeys.map((item, index) => <li key={`${item.fromPath}-${item.toPath}-${index}`} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1 text-sm"><p className="break-words">{trackingPathLabel(item.fromPath)}</p><p className="mt-1 flex items-start gap-1.5 text-cinza"><ArrowRight size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{trackingPathLabel(item.toPath)}</span></p></div>
              <span className="shrink-0 text-sm font-semibold tabular-nums" aria-label={`${number(item.count)} transições`}>{number(item.count)}</span>
            </li>)}</ol>
          </section>
        </div>

        <section className="card" aria-labelledby="tracking-activities-title">
          <h2 id="tracking-activities-title" className="font-display text-lg font-bold">Uso das atividades</h2>
          <p className="mt-1 text-xs text-cinza">Cada ação pode ocorrer várias vezes por sessão. Em telas pequenas, deslize a tabela para ver todas as colunas.</p>
          {!report.activities.length ? <Empty /> : <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de uso das atividades">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-tinta/15 text-left text-xs text-cinza">{["Atividade", "Aberturas", "Prévias públicas", "Prévias no editor", "Gerações solicitadas", "Recebidas", "Falhas", "Baixar"].map(label => <th scope="col" className="px-3 py-3 first:pl-0" key={label}>{label}</th>)}</tr></thead>
              <tbody>{report.activities.map(item => <tr key={item.activityKind} className="border-b border-tinta/10 last:border-0">
                <th scope="row" className="py-3 pr-3 text-left font-medium">{trackingActivityLabel(item.activityKind)}</th>
                {[item.opens, item.publicPreviews, item.previewRequests, item.generationRequests, item.generationSuccesses, item.generationFailures, item.downloads].map((count, index) => <td key={index} className="px-3 py-3 tabular-nums">{number(count)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>}
        </section>

        <section className="card" aria-labelledby="tracking-sessions-title">
          <h2 id="tracking-sessions-title" className="font-display text-lg font-bold">Sessões recentes</h2>
          <p className="mt-1 text-xs text-cinza">Até 20 sessões, com até 50 ações em cada uma. Abra uma sessão para acompanhar seu percurso.</p>
          {!report.recentSessions.length && <Empty />}
          <div className="mt-4 space-y-2">{report.recentSessions.map((session, index) => <details key={session.sessionId} className="rounded-lg border border-tinta/15">
            <summary className="cursor-pointer px-3 py-3 text-sm marker:text-lavanda">
              <span className="font-semibold">Visita {index + 1}</span>
              <span className="ml-2 text-cinza">{deviceLabel[session.device] ?? "Dispositivo"} · {session.authenticated ? "Com login" : "Sem login"} · {number(session.eventCount)} ações</span>
              <span className="mt-1 block pl-4 text-xs text-cinza">{formatDateTime(session.startedAt)} — {formatDateTime(session.lastSeenAt)}</span>
            </summary>
            <ol className="space-y-4 border-t border-tinta/10 p-4">{session.events.map((event, eventIndex) => <li key={eventIndex} className="border-l-2 border-lavanda/50 pl-3">
              <p className="text-sm font-medium">{TRACKING_EVENT_LABELS[event.name] ?? event.name}</p>
              <p className="mt-0.5 break-words text-sm text-cinza">{trackingPathLabel(event.path)}{event.activityKind ? ` · ${trackingActivityLabel(event.activityKind)}` : ""}</p>
              <p className="mt-1 text-xs text-cinza">{formatDateTime(event.occurredAt)}</p>
            </li>)}</ol>
            {session.eventCount > session.events.length && <p className="px-4 pb-4 text-xs text-cinza">Exibindo {session.events.length} de {number(session.eventCount)} ações desta sessão.</p>}
          </details>)}</div>
        </section>
      </>}
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-sm text-cinza">Nenhuma ação registrada neste período.</p>;
}
