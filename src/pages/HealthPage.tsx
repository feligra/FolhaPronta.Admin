import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { adminApi } from "@/services/api";
import type { AdminHealthResponse } from "@/types";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Smoke test do RBAC: dispara `GET /api/admin/health` e mostra o resultado.
 * Se autenticação + role estão corretos, vem 200 com dados do admin; qualquer
 * outra resposta (401/403) indica problema na configuração.
 */
export default function HealthPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await adminApi.health();
        if (!cancelled) setData(r);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            (err as { response?: { data?: { error?: { message?: string } } }; message?: string })
              ?.response?.data?.error?.message ??
            (err as { message?: string })?.message ??
            "Falha desconhecida.";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-tinta">Saúde do painel</h1>
        <p className="mt-1 text-sm text-cinza">
          Smoke test do RBAC. Se o painel chegou aqui e o card abaixo está verde,
          o JWT está sendo aceito como Admin pelo backend.
        </p>
      </header>

      <section className="card space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-cinza">Sessão atual</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" value={user?.name ?? "—"} />
          <Field label="E-mail" value={user?.email ?? "—"} />
          <Field label="Role" value={user?.role ?? "—"} highlight={user?.role === "Admin"} />
          <Field label="Id do usuário" value={user?.id ?? "—"} mono />
        </div>
      </section>

      <section className="card space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-cinza">
          GET /api/admin/health
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-cinza">
            <Loader2 size={16} className="animate-spin" />
            Verificando…
          </div>
        )}
        {!loading && error && (
          <div className="flex items-start gap-2 rounded-md bg-coral-50 p-3 text-sm text-coral-800">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Falhou</p>
              <p>{error}</p>
            </div>
          </div>
        )}
        {!loading && data && (
          <>
            <div className="flex items-center gap-2 text-sm text-erva">
              <CheckCircle2 size={16} />
              <span className="font-semibold">OK — RBAC validado</span>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Status" value={data.status} />
              <Field label="Timestamp" value={new Date(data.timestamp).toLocaleString("pt-BR")} />
              <Field label="Admin id (do token)" value={data.adminId} mono />
              <Field label="E-mail (do token)" value={data.email} />
            </div>
          </>
        )}
      </section>

      <section className="card">
        <p className="text-xs font-bold uppercase tracking-wider text-cinza">Próximas fases</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-tinta/80">
          <li><strong>Fase 2:</strong> Listagem e detalhe de clientes</li>
          <li><strong>Fase 3:</strong> Administração de assinaturas</li>
          <li><strong>Fase 4:</strong> Planos + matriz Plano × Atividade</li>
          <li><strong>Fase 5:</strong> Diagnóstico (métricas, emails, logs)</li>
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</p>
      <p className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm font-medium"} ${highlight ? "text-erva" : "text-tinta"}`}>
        {value}
      </p>
    </div>
  );
}
