import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { formatDateTime, formatPrice } from "@/utils/format";
import type { MarketingDelivery, MarketingMetricsData } from "@/types";

const rate = (value: number | null) => value == null ? "Sem base suficiente" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const mode = (value: string) => value === "Test" ? "Teste" : value === "Production" ? "Produção" : value;
const statuses: Record<string, string> = {
  Pending: "Aguardando", Processing: "Enviando", Sent: "Aceitos pela API",
  Failed: "Falha", Suppressed: "Somente interno / consentimento indisponível", Expired: "Prazo encerrado",
};

export function MarketingMetrics({ data }: { data: MarketingMetricsData }) {
  const [deliveries, setDeliveries] = useState<MarketingDelivery[]>([]);
  const [message, setMessage] = useState("");
  const [queueError, setQueueError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const retrying = useRef(false);
  const requestVersion = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setQueueError("");
    try {
      const response = await api.get<{ items: MarketingDelivery[]; total: number }>("/admin/marketing/conversions", {
        signal, params: { page, ...(status ? { status } : {}) },
      });
      if (version === requestVersion.current && !signal?.aborted) {
        setDeliveries(response.data.items);
        setTotal(response.data.total);
        // A retry can remove the final item of a filtered page.
        const lastPage = Math.max(1, Math.ceil(response.data.total / 50));
        if (page > lastPage) setPage(lastPage);
      }
    } catch {
      if (version === requestVersion.current && !signal?.aborted)
        setQueueError("Não foi possível consultar a fila de conversões. Tente atualizar a fila.");
    } finally {
      if (version === requestVersion.current && !signal?.aborted) setLoading(false);
    }
  }, [page, status]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); requestVersion.current++; };
  }, [data, load]);
  const retry = async (id: string) => {
    if (retrying.current) return;
    retrying.current = true;
    setBusy(id);
    setMessage("");
    try {
      await api.post(`/admin/marketing/conversions/${id}/retry`);
      setMessage("Reenvio agendado. O identificador da conversão foi preservado.");
      await load();
    } catch {
      setMessage("Não foi possível reenviar. Confira o consentimento, o ambiente e o prazo do evento.");
    } finally { retrying.current = false; setBusy(null); }
  };
  const retryButton = (item: MarketingDelivery) => item.status === "Failed" && (
    <button type="button" className="btn-ghost min-h-11 whitespace-normal" disabled={loading || busy !== null}
      aria-label={`Tentar novamente ${item.eventName}`}
      onClick={() => void retry(item.id)}>{busy === item.id ? "Agendando…" : "Tentar novamente"}</button>
  );
  const metrics: [string, string | number][] = [
    ["Visitas consentidas", data.consentedVisits], ["Visitas que viram planos", data.planViewVisits],
    ["Cadastros", data.registrations], ["Testes iniciados", data.trials],
    ["Cadastros com atividade gerada", data.activatedUsers], ["Checkouts criados", data.checkouts],
    ["Checkouts pagos", data.paidCheckouts], ["Sem pagamento há mais de 24h", data.unpaidCheckoutsOver24h],
    ["Novos pagantes", data.newPayers], ["Cobranças posteriores", data.renewals],
    ["Receita da primeira compra", `R$ ${formatPrice(data.acquisitionRevenue)}`],
    ["Receita de compras posteriores", `R$ ${formatPrice(data.recurringRevenue)}`],
    ["Valores com estorno / contestação", `R$ ${formatPrice(data.refundedRevenue)}`],
    ["Canceladas nos últimos 30 dias", data.cancelledSubscriptions],
    ["Visita consentida → cadastro", rate(data.visitRegistrationRate)],
    ["Cadastro → pagante", rate(data.registrationPaidRate)],
    ["Teste → pagante", rate(data.trialPaidRate)],
    ["Checkout → pagamento", rate(data.checkoutPaidRate)],
    ["Aprovação entre aprovados e recusados", rate(data.paymentApprovalRate)],
    ["Cadastro até primeiro pagamento", data.averageHoursToFirstPayment == null ? "Sem dados" : `${data.averageHoursToFirstPayment.toLocaleString("pt-BR")} h`],
  ];
  return <section className="card min-w-0 space-y-5">
    <div>
      <h2 className="font-display text-xl font-bold text-tinta">Aquisição e conversões</h2>
      <p className="mt-1 text-sm text-cinza">Coortes dos últimos 30 dias, desde {formatDateTime(data.since)}.</p>
      <p className="mt-2 text-xs text-cinza">
        Visitas representam identificadores de navegador com consentimento, não pessoas únicas ou todo o tráfego.
        Cada taxa usa a própria coorte: cadastros, testes ou checkouts iniciados no período.
        Checkouts sem pagamento há 24h são uma estimativa de abandono e podem ser aprovados depois.
      </p>
    </div>
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value]) => <div key={label} className="rounded-md border border-tintaSoft-100 p-3">
        <dt className="text-xs text-cinza">{label}</dt><dd className="mt-1 break-words font-bold text-tinta">{value}</dd>
      </div>)}
    </dl>
    <p className="text-xs text-cinza">
      Compras posteriores incluem renovação, recuperação e troca de plano. CAC e ROAS aguardam dados confiáveis de investimento.
      A primeira geração é medida internamente, sem ler conteúdo das atividades ou dados de alunos.
    </p>
    <div>
      <h3 id="marketing-campaigns-title" className="mb-2 font-bold text-tinta">Origem das visitas consentidas</h3>
      <div className="max-w-full overflow-x-auto" role="region" aria-labelledby="marketing-campaigns-title" tabIndex={0}>
      <table className="w-full min-w-[650px] table-fixed text-left text-sm">
        <thead><tr>{["Origem / mídia", "Campanha", "Visitas", "Cadastros", "Checkouts", "Novos pagantes", "Receita inicial"].map(x =>
          <th key={x} className="border-b border-tintaSoft-100 p-2">{x}</th>)}</tr></thead>
        <tbody>{data.campaigns.map((x, i) => <tr key={i}>
          <td className="break-words p-2">{x.source} / {x.medium}</td><td className="break-words p-2">{x.campaign}</td>
          <td className="p-2">{x.visits}</td><td className="p-2">{x.registrations}</td><td className="p-2">{x.checkouts}</td>
          <td className="p-2">{x.newPayers}</td><td className="p-2">R$ {formatPrice(x.revenue)}</td>
        </tr>)}</tbody>
      </table>
      </div>
      {!data.campaigns.length && <p className="py-3 text-sm text-cinza">Ainda não há atribuições consentidas neste período.</p>}
    </div>
    <div className="space-y-2 border-t border-tintaSoft-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-tinta">Entrega à Meta</h3>
        <button type="button" className="btn-ghost min-h-11" disabled={loading || busy !== null}
          onClick={() => void load()}>{loading ? "Consultando fila…" : "Atualizar fila"}</button>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm text-tinta">
        Estado da entrega
        <select aria-label="Estado da entrega" className="min-h-11 rounded-md border border-tintaSoft-100 bg-creme px-3"
          value={status} disabled={loading || busy !== null}
          onChange={event => { setPage(1); setStatus(event.target.value); setMessage(""); }}>
          <option value="">Todos os estados</option>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="text-sm text-cinza">
        {data.capiEnabled ? "Envio habilitado" : "Envio desabilitado"} · {mode(data.deliveryMode)}
        {data.configurationIssue && data.configurationIssue !== "disabled" && ` · Configuração pendente: ${data.configurationIssue}`}
      </p>
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(data.deliveryStatus).map(([status, count]) =>
          <span key={status}>{statuses[status] ?? status}: <strong>{count}</strong></span>)}
      </div>
      <p className="text-xs text-cinza">Aceito pela API significa recebimento confirmado. Correspondência, deduplicação e atribuição de anúncios devem ser conferidas no Gerenciador de Eventos.</p>
      {message && <p role="status" className="text-sm text-tinta">{message}</p>}
      {queueError && <p role="alert" className="text-sm text-coral-800">{queueError}</p>}
      {!loading && !queueError && deliveries.length === 0 && <p className="py-3 text-sm text-cinza">Nenhuma conversão registrada na fila.</p>}
      <div className="space-y-3 sm:hidden" aria-label="Conversões recentes">
        {deliveries.map(item => <article key={item.id} className="min-w-0 space-y-2 rounded-md border border-tintaSoft-100 p-3">
          <p className="break-words font-bold text-tinta" title={item.eventId}>{item.eventName} · {mode(item.deliveryMode)}</p>
          <dl className="space-y-1 text-xs">
            <div><dt className="inline text-cinza">Quando: </dt><dd className="inline">{formatDateTime(item.eventTime)}</dd></div>
            <div><dt className="inline text-cinza">Estado: </dt><dd className="inline">{statuses[item.status] ?? item.status}</dd></div>
            <div><dt className="inline text-cinza">Tentativas: </dt><dd className="inline">{item.attempts}</dd></div>
            <div className="break-words"><dt className="inline text-cinza">Diagnóstico: </dt><dd className="inline">{item.lastError ?? "—"}</dd></div>
          </dl>
          {retryButton(item)}
        </article>)}
      </div>
      <div className="hidden max-w-full overflow-x-auto sm:block">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead><tr>{["Evento", "Quando ocorreu", "Estado", "Tentativas", "Diagnóstico", "Ação"].map(x =>
            <th key={x} className="border-b border-tintaSoft-100 p-2">{x}</th>)}</tr></thead>
          <tbody>{deliveries.map(x => <tr key={x.id}>
            <td className="p-2" title={x.eventId}>{x.eventName} · {mode(x.deliveryMode)}</td>
            <td className="p-2">{formatDateTime(x.eventTime)}</td><td className="p-2">{statuses[x.status] ?? x.status}</td>
            <td className="p-2">{x.attempts}</td><td className="max-w-[240px] break-words p-2">{x.lastError ?? "—"}</td>
            <td className="p-2">{retryButton(x)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {total > 0 && <nav aria-label="Páginas de conversões" className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
        <span>Página {page} de {Math.max(1, Math.ceil(total / 50))} · {total} eventos</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost min-h-11" disabled={loading || busy !== null || page <= 1}
            onClick={() => setPage(value => value - 1)}>Anterior</button>
          <button type="button" className="btn-ghost min-h-11" disabled={loading || busy !== null || page * 50 >= total}
            onClick={() => setPage(value => value + 1)}>Próxima</button>
        </div>
      </nav>}
    </div>
  </section>;
}
