import { useEffect, useState } from "react";
import {
  Activity, AlertCircle, CheckCircle2, CreditCard,
  DollarSign, FileText, Loader2, Mail, RefreshCw, Sparkles, UserPlus, Users, XCircle,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type { MetricsResponse, SubscriptionStatus } from "@/types";
import { classNames, formatDateTime, formatPrice } from "@/utils/format";
import {
  ACTIVITY_TYPE_LABEL, SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE,
} from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";

export default function MetricsPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.metrics.get();
      setData(r);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar métricas."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Métricas do sistema</h1>
          <p className="mt-1 text-sm text-cinza">
            KPIs unificados do FolhaPronta. Atualizados sob demanda.
          </p>
          {data && (
            <p className="mt-1 text-[11px] text-cinza">
              Última coleta: {formatDateTime(data.generatedAt)}
            </p>
          )}
        </div>
        <button onClick={load} className="btn-ghost" title="Recoletar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recoletar
        </button>
      </header>

      {error && (
        <div className="card flex items-start gap-2 text-coral-800">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-12 text-cinza">
          <Loader2 size={18} className="animate-spin" /> Carregando…
        </div>
      )}

      {data && (
        <>
          {/* Linha 1 — Negócio (MRR + receita 30d destaque) */}
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <BigStat
              icon={DollarSign}
              label="MRR (Active)"
              value={`R$ ${formatPrice(data.subscriptions.mrr)}`}
              tone="erva"
              hint="Soma do MonthlyAmount das assinaturas Active."
            />
            <BigStat
              icon={Sparkles}
              label="Receita 30d"
              value={`R$ ${formatPrice(data.payments.revenue30d)}`}
              tone="erva"
              hint={`${data.payments.approved30d} pagamento(s) aprovados.`}
            />
            <BigStat
              icon={Users}
              label="Usuários ativos"
              value={data.users.active}
              tone="lavanda"
              hint={`${data.users.total} no total.`}
            />
            <BigStat
              icon={FileText}
              label="PDFs gerados (30d)"
              value={data.activities.last30Days}
              tone="lavanda"
              hint={`${data.activities.totalGenerated} desde sempre.`}
            />
          </section>

          {/* Linha 2 — Detalhamento por área */}
          <section className="grid gap-4 lg:grid-cols-2">
            {/* Usuários */}
            <Card title="Usuários" icon={Users}>
              <Row label="Total" value={data.users.total} />
              <Row label="Ativos" value={data.users.active} tone="erva" />
              <Row label="Trial em andamento" value={data.users.withActiveTrial} tone="amarelo" />
              <Row label="Novos últimos 7d" value={data.users.last7Days} icon={UserPlus} />
              <Row label="Novos últimos 30d" value={data.users.last30Days} icon={UserPlus} />
            </Card>

            {/* Assinaturas */}
            <Card title="Assinaturas" icon={CreditCard}>
              <div className="space-y-2">
                {Object.entries(data.subscriptions.byStatus).length === 0 && (
                  <p className="text-sm text-cinza">Nenhuma assinatura registrada.</p>
                )}
                {Object.entries(data.subscriptions.byStatus).map(([status, count]) => {
                  const s = status as SubscriptionStatus;
                  return (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <StatusPill tone={SUBSCRIPTION_STATUS_TONE[s] ?? "neutral"}>
                        {SUBSCRIPTION_STATUS_LABEL[s] ?? status}
                      </StatusPill>
                      <span className="font-bold text-tinta">{count}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-tintaSoft-100 pt-3">
                <Row label="MRR" value={`R$ ${formatPrice(data.subscriptions.mrr)}`} tone="erva" />
              </div>
            </Card>

            {/* Pagamentos */}
            <Card title="Pagamentos (últimos 30 dias)" icon={DollarSign}>
              <Row label="Aprovados" value={data.payments.approved30d} icon={CheckCircle2} tone="erva" />
              <Row label="Recusados" value={data.payments.rejected30d} icon={XCircle} tone="coral" />
              <Row label="Pendentes / em análise" value={data.payments.pending30d} tone="amarelo" />
              <div className="mt-3 border-t border-tintaSoft-100 pt-3">
                <Row label="Receita bruta" value={`R$ ${formatPrice(data.payments.revenue30d)}`} tone="erva" />
              </div>
            </Card>

            {/* Atividades */}
            <Card title="Atividades geradas" icon={FileText}>
              <Row label="Total no sistema" value={data.activities.totalGenerated} />
              <Row label="Últimos 7 dias" value={data.activities.last7Days} />
              <Row label="Últimos 30 dias" value={data.activities.last30Days} />

              <div className="mt-4 border-t border-tintaSoft-100 pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-cinza">
                  Top 5 mais geradas
                </p>
                {data.activities.top5.length === 0 ? (
                  <p className="text-sm text-cinza">Sem dados ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.activities.top5.map((t, idx) => {
                      const max = data.activities.top5[0].count || 1;
                      const pct = Math.round((t.count / max) * 100);
                      return (
                        <li key={t.type} className="text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-tinta">
                              <strong className="mr-1 text-cinza">#{idx + 1}</strong>
                              {ACTIVITY_TYPE_LABEL[t.type] ?? t.type}
                            </span>
                            <span className="font-bold text-coral-800">{t.count}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tintaSoft-50">
                            <div className="h-full bg-coral" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>

            {/* Emails (full row) */}
            <Card title="Emails (últimos 30 dias)" icon={Mail} className="lg:col-span-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Enviados" value={data.emails.sent30d} tone="erva" />
                <MiniStat label="Falharam" value={data.emails.failed30d} tone="coral" />
                <MiniStat label="Pendentes" value={data.emails.pending30d} tone="amarelo" />
                <MiniStat
                  label="Pulados (dev)"
                  value={data.emails.skippedDev30d}
                  tone="neutral"
                  hint="SMTP não configurado — só registrado."
                />
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function BigStat({
  icon: Icon, label, value, tone, hint,
}: {
  icon: typeof Activity; label: string; value: string | number;
  tone: "erva" | "lavanda" | "coral" | "neutral"; hint?: string;
}) {
  const toneCls = {
    erva: "bg-erva text-creme",
    lavanda: "bg-lavanda text-creme",
    coral: "bg-coral text-creme",
    neutral: "bg-tintaSoft-50 text-tinta",
  }[tone];
  return (
    <div className="card flex items-start gap-3">
      <div className={classNames("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md", toneCls)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</p>
        <p className="mt-0.5 font-display text-2xl font-bold text-tinta truncate">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-cinza">{hint}</p>}
      </div>
    </div>
  );
}

function Card({
  title, icon: Icon, className, children,
}: { title: string; icon: typeof Activity; className?: string; children: React.ReactNode }) {
  return (
    <section className={classNames("card space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-cinza" />
        <h2 className="font-display text-lg font-bold text-tinta">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({
  label, value, icon: Icon, tone,
}: {
  label: string; value: string | number;
  icon?: typeof Activity; tone?: "erva" | "amarelo" | "coral";
}) {
  const valueCls =
    tone === "erva" ? "text-erva" :
    tone === "amarelo" ? "text-amarelo-800" :
    tone === "coral" ? "text-coral-800" :
    "text-tinta";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-tinta/80">
        {Icon && <Icon size={12} className="text-cinza" />}
        {label}
      </span>
      <strong className={classNames("font-bold", valueCls)}>{value}</strong>
    </div>
  );
}

function MiniStat({
  label, value, tone, hint,
}: { label: string; value: number; tone: "erva" | "amarelo" | "coral" | "neutral"; hint?: string }) {
  const toneCls =
    tone === "erva" ? "text-erva" :
    tone === "amarelo" ? "text-amarelo-800" :
    tone === "coral" ? "text-coral-800" :
    "text-tinta";
  return (
    <div className="rounded-md border border-tintaSoft-100 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</p>
      <p className={classNames("mt-1 font-display text-2xl font-bold", toneCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-cinza">{hint}</p>}
    </div>
  );
}

