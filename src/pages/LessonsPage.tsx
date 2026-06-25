import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { adminApi } from "@/services/api";
import type { AdminActivityItem } from "@/types";
import { classNames } from "@/utils/format";

/**
 * Ativar/desativar lições (manutenção). Desativar reflete no site público
 * (catálogo, contador, cards) e exclui a lição do plano semanal.
 */
export default function LessonsPage() {
  const [items, setItems] = useState<AdminActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingType, setSavingType] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.activities.list();
      setItems(r.items);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar lições."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const total = items.length;
  const disabledCount = items.filter((i) => i.disabled).length;
  const activeCount = total - disabledCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    );
  }, [items, query]);

  const toggle = async (item: AdminActivityItem) => {
    const next = !item.disabled;
    setSavingType(item.activityType);
    // Otimista: atualiza local; reverte no erro.
    setItems((prev) => prev.map((i) => (i.activityType === item.activityType ? { ...i, disabled: next } : i)));
    try {
      await adminApi.activities.setMaintenance(item.activityType, next);
    } catch (err: unknown) {
      setItems((prev) => prev.map((i) => (i.activityType === item.activityType ? { ...i, disabled: item.disabled } : i)));
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao salvar. Tente novamente."
      );
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Lições</h1>
          <p className="mt-1 text-sm text-cinza">
            Ative ou desative lições. Desativar coloca a lição em manutenção: ela some do
            site como gerável, sai do plano semanal e não conta no total de atividades.
          </p>
        </div>
        <button onClick={load} className="btn-ghost" title="Recarregar" disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recarregar
        </button>
      </header>

      {/* Contadores */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={total} tone="tinta" />
        <StatCard label="Ativas" value={activeCount} tone="erva" />
        <StatCard label="Em manutenção" value={disabledCount} tone="coral" />
      </div>

      {error && (
        <div className="rounded-lg border border-coral/40 bg-coral-50 px-4 py-3 text-sm text-coral-900">
          {error}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar lição…"
          className="input w-full !pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-cinza">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      ) : (
        <ul className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-tinta/10 bg-creme">
          {filtered.map((item) => (
            <li key={item.activityType} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-tinta">{item.label}</p>
                <p className="truncate text-[11px] text-cinza">{item.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={classNames(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                    item.disabled ? "bg-coral-100 text-coral-800" : "bg-erva/15 text-erva"
                  )}
                >
                  {item.disabled ? "Em manutenção" : "Ativa"}
                </span>
                <ToggleSwitch
                  on={!item.disabled}
                  busy={savingType === item.activityType}
                  onClick={() => toggle(item)}
                  ariaLabel={item.disabled ? `Ativar ${item.label}` : `Desativar ${item.label}`}
                />
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-cinza">Nenhuma lição encontrada.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "tinta" | "erva" | "coral" }) {
  const toneClass: Record<string, string> = {
    tinta: "text-tinta",
    erva: "text-erva",
    coral: "text-coral",
  };
  return (
    <div className="rounded-xl border border-tinta/10 bg-creme p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-cinza">{label}</p>
      <p className={classNames("mt-1 font-display text-2xl font-bold", toneClass[tone])}>{value}</p>
    </div>
  );
}

function ToggleSwitch({ on, busy, onClick, ariaLabel }: { on: boolean; busy: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={busy}
      onClick={onClick}
      className={classNames(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50",
        on ? "bg-erva" : "bg-tinta/25"
      )}
    >
      <span
        className={classNames(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          on ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
