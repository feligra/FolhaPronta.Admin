import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Calendar, CheckCircle2, Edit3, Loader2, Package, Plus,
  RefreshCw, Settings2, ToggleLeft, ToggleRight, Trash2, X,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type {
  AdminCreatePlanBody,
  AdminPlanDetail, AdminPlanListItem, AdminPlansListResponse,
  AdminUpdatePlanBody,
} from "@/types";
import { classNames, formatPrice } from "@/utils/format";
import { StatusPill } from "@/components/StatusPill";

/**
 * Admin Plans. A partir de 2026-05 o produto é plano único — "tem assinatura =
 * tem tudo". A matriz de atividades por plano saiu. Esta página só lista, edita
 * metadados (nome/preço/descrição/ativo/planejador) e remove planos sem
 * assinantes vigentes.
 */
export default function PlansPage() {
  const [data, setData] = useState<AdminPlansListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminPlanListItem | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.plans.list(true);
      setData(r);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar planos."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (plan: AdminPlanListItem) => {
    try {
      await adminApi.plans.delete(plan.id);
      setDeleting(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao excluir plano.";
      throw new Error(msg);
    }
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0 };
    return {
      total: data.items.length,
      active: data.items.filter((p) => p.isActive).length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Planos</h1>
          <p className="mt-1 text-sm text-cinza">
            Plano único do produto. Edite nome, preço e descrição. Assinantes pagos têm acesso a tudo.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost" title="Recarregar">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Recarregar
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={14} /> Novo plano
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Total de planos" value={stats.total} />
        <Stat label="Ativos" value={stats.active} tone="erva" />
      </section>

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
        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data.items.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              onEdit={() => setEditingPlanId(p.id)}
              onDelete={() => setDeleting(p)}
            />
          ))}
          {data.items.length === 0 && (
            <div className="card flex flex-col items-center gap-2 py-12 text-cinza">
              <Package size={28} className="opacity-40" />
              <p className="text-sm">Nenhum plano cadastrado.</p>
            </div>
          )}
        </section>
      )}

      {editingPlanId && (
        <PlanEditModal
          planId={editingPlanId}
          onClose={() => setEditingPlanId(null)}
          onSaved={() => { setEditingPlanId(null); load(); }}
        />
      )}

      {creating && (
        <PlanCreateModal
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setEditingPlanId(id); load(); }}
        />
      )}

      {deleting && (
        <PlanDeleteModal
          plan={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "erva" | "lavanda" }) {
  const toneCls =
    tone === "erva" ? "text-erva" :
    tone === "lavanda" ? "text-lavanda-800" :
    "text-tinta";
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cinza">{label}</span>
      <span className={classNames("font-display text-2xl font-bold", toneCls)}>{value}</span>
    </div>
  );
}

function PlanCard({
  plan, onEdit, onDelete,
}: {
  plan: AdminPlanListItem;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <article className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-bold text-tinta">{plan.name}</h2>
            <span className="text-[10px] uppercase tracking-wider text-cinza">{plan.slug}</span>
          </div>
          <p className="mt-1 font-display text-3xl font-bold text-coral">
            R$ {formatPrice(plan.monthlyPrice)}
            <span className="ml-1 text-sm font-normal text-cinza">/mês</span>
          </p>
          {plan.description && <p className="mt-1 text-sm text-tinta/70">{plan.description}</p>}
        </div>
        <StatusPill tone={plan.isActive ? "erva" : "neutral"}>
          {plan.isActive ? "Ativo" : "Inativo"}
        </StatusPill>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border border-tintaSoft-100 p-3">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cinza">
          <Calendar size={12} /> Planejador semanal
        </span>
        {plan.includesWeeklyPlanner ? (
          <StatusPill tone="lavanda"><CheckCircle2 size={10} /> Incluído</StatusPill>
        ) : (
          <StatusPill tone="neutral">Não incluído</StatusPill>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={onEdit} className="btn-primary">
          <Edit3 size={14} /> Editar
        </button>
        <button
          onClick={onDelete}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-coral/30 bg-coral-50 px-3 text-sm font-semibold text-coral-800 transition hover:bg-coral-100"
          title="Excluir plano (só sem assinaturas vigentes)"
        >
          <Trash2 size={14} /> Excluir
        </button>
      </div>
    </article>
  );
}

// ── Modal: criar plano ──────────────────────────────────────────────────
function PlanCreateModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("0");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Slug auto-derivado do nome (só se admin não tocou no slug ainda).
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (!slugTouched) {
      const auto = name.trim().toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setSlug(auto);
    }
  }, [name, slugTouched]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const numericPrice = Number(price.replace(",", "."));
      if (!isFinite(numericPrice) || numericPrice < 0) { setErr("Preço inválido."); setBusy(false); return; }
      if (!name.trim() || !slug.trim()) { setErr("Nome e slug obrigatórios."); setBusy(false); return; }

      const body: AdminCreatePlanBody = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        monthlyPrice: numericPrice,
        description: description || undefined,
      };
      const res = await adminApi.plans.create(body);
      onCreated(res.id);
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao criar plano.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-creme p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-tinta">Novo plano</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-cinza hover:text-tinta">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs text-cinza">
          O plano é criado <strong>ativo</strong>. Assinantes pagos têm acesso a todas as atividades do
          catálogo — não há mais matriz por plano.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Premium" />
          </Field>
          <Field label="Slug (URL)">
            <input
              className="input"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              placeholder="ex.: premium"
            />
          </Field>
          <Field label="Preço mensal (R$)">
            <input type="number" step="0.01" min="0" className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição (opcional)">
              <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        </div>

        {err && <div className="mt-3 rounded-md bg-coral-50 p-3 text-sm text-coral-800">{err}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Criar plano
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: confirmar exclusão ──────────────────────────────────────────
function PlanDeleteModal({
  plan, onClose, onConfirm,
}: { plan: AdminPlanListItem; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try { await onConfirm(); }
    catch (e: unknown) {
      setErr((e as Error)?.message ?? "Falha ao excluir.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-creme p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-tinta">Excluir plano</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-cinza hover:text-tinta">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-tinta">
          Excluir o plano <strong>{plan.name}</strong> ({plan.slug})? Só bloqueia se houver
          assinatura <strong>Ativa</strong> ou <strong>Trial</strong> realmente vigente
          (cliente pagando agora). Subs Canceladas (mesmo com período residual),
          Expiradas e PendingPayment não bloqueiam.
        </p>
        {err && <div className="mt-3 rounded-md bg-coral-50 p-3 text-sm text-coral-800">{err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-coral">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: editar plano (só metadados, sem matriz) ──────────────────────
function PlanEditModal({
  planId, onClose, onSaved,
}: { planId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<AdminPlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form fields (controlled).
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [includesWeeklyPlanner, setIncludesWeeklyPlanner] = useState(false);
  // Features: editor textarea com 1 linha = 1 bullet. Convertido pra JSON array
  // no save. Stored como string JSON em `featuresJson` no banco.
  const [features, setFeatures] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await adminApi.plans.detail(planId);
        if (cancelled) return;
        setData(d);
        setName(d.name);
        setPrice(String(d.monthlyPrice));
        setDescription(d.description ?? "");
        setIsActive(d.isActive);
        setSortOrder(d.sortOrder);
        setIncludesWeeklyPlanner(d.includesWeeklyPlanner);
        setFeatures(featuresJsonToLines(d.featuresJson));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
            "Falha ao carregar plano."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [planId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  const submit = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    setSaveStatus("idle");
    try {
      const numericPrice = Number(price.replace(",", "."));
      if (!isFinite(numericPrice) || numericPrice < 0) {
        setError("Preço inválido.");
        setBusy(false);
        return;
      }

      const updates: AdminUpdatePlanBody = {};
      if (name !== data.name) updates.name = name.trim();
      if (numericPrice !== data.monthlyPrice) updates.monthlyPrice = numericPrice;
      if ((description || null) !== (data.description ?? null)) updates.description = description || null;
      if (isActive !== data.isActive) updates.isActive = isActive;
      if (sortOrder !== data.sortOrder) updates.sortOrder = sortOrder;
      if (includesWeeklyPlanner !== data.includesWeeklyPlanner) updates.includesWeeklyPlanner = includesWeeklyPlanner;
      const newFeaturesJson = linesToFeaturesJson(features);
      if (newFeaturesJson !== (data.featuresJson ?? null)) updates.featuresJson = newFeaturesJson;

      if (Object.keys(updates).length > 0) {
        await adminApi.plans.update(data.id, updates);
      }

      setSaveStatus("saved");
      setTimeout(() => onSaved(), 700);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao salvar. Tente novamente."
      );
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-creme p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-tinta">
            Editar plano {data?.name ? `· ${data.name}` : ""}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-cinza hover:text-tinta">
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-cinza">
            <Loader2 size={16} className="animate-spin" /> Carregando…
          </div>
        )}

        {!loading && data && (
          <div className="space-y-5">
            {data.subscriptionCount > 0 && !data.isActive && (
              <div className="rounded-md bg-amarelo-50 p-3 text-xs text-amarelo-900">
                Atenção: este plano está <strong>inativo</strong> mas tem{" "}
                <strong>{data.subscriptionCount}</strong> assinatura(s) associadas.
                Reativar permite novos checkouts; desativar não cancela as existentes.
              </div>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Slug (não editável)">
                <input className="input opacity-60" value={data.slug} disabled />
              </Field>
              <Field label="Preço mensal (R$)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field label="Ordem de exibição">
                <input
                  type="number"
                  className="input"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Descrição">
                  <textarea
                    className="input min-h-[60px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Texto curto exibido na página de preço."
                  />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label='Features ("Tudo que está incluso" no card de preço — 1 linha = 1 bullet)'>
                  <textarea
                    className="input min-h-[140px] font-mono text-xs"
                    value={features}
                    onChange={(e) => setFeatures(e.target.value)}
                    placeholder={"Ex.:\nCatálogo completo de atividades\nAcervo de 517+ ilustrações\nGeração ilimitada\nPlanejador semanal incluso"}
                  />
                </Field>
                <p className="mt-1 text-[11px] text-cinza">
                  Cada linha vira um item com check verde. Linhas em branco são ignoradas.
                  Salvo como JSON array no banco (<code>featuresJson</code>).
                </p>
              </div>

              {/* Toggles em <div> (não <label>): button-em-label causa double-fire
                  do click pelo bubble nativo do label, anulando o toggle. */}
              <div className="sm:col-span-2">
                <div
                  className="flex cursor-pointer items-center gap-2 text-sm text-tinta"
                  onClick={() => setIsActive((v) => !v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setIsActive((v) => !v); }}
                  aria-pressed={isActive}
                >
                  {isActive ? <ToggleRight size={28} className="text-erva" /> : <ToggleLeft size={28} className="text-cinza" />}
                  <div>
                    <span className="block font-semibold">Plano {isActive ? "ativo" : "inativo"}</span>
                    <span className="block text-[11px] text-cinza">
                      Inativo = não aparece na vitrine. Assinaturas existentes não são canceladas.
                    </span>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <div
                  className="flex cursor-pointer items-center gap-2 text-sm text-tinta"
                  onClick={() => setIncludesWeeklyPlanner((v) => !v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setIncludesWeeklyPlanner((v) => !v); }}
                  aria-pressed={includesWeeklyPlanner}
                >
                  {includesWeeklyPlanner ? <ToggleRight size={28} className="text-lavanda-800" /> : <ToggleLeft size={28} className="text-cinza" />}
                  <div>
                    <span className="block font-semibold">
                      Planejador semanal {includesWeeklyPlanner ? "incluído" : "não incluído"}
                    </span>
                    <span className="block text-[11px] text-cinza">
                      Quando ligado, assinantes deste plano podem criar e usar o Planejador semanal por turma.
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <div className="rounded-md border border-erva/20 bg-erva/5 p-3 text-xs text-tinta/80">
              <strong className="text-erva">Plano único — tudo incluso.</strong> Assinantes pagos têm
              acesso a todo o catálogo de atividades. A antiga matriz por plano foi removida.
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-coral/30 bg-coral-50 p-3 text-sm text-coral-800">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {saveStatus === "saved" && (
              <div className="flex items-start gap-2 rounded-md border border-erva/30 bg-erva/10 p-3 text-sm text-erva">
                <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                <span>Alterações salvas com sucesso.</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
              <button type="button" onClick={submit} disabled={busy || saveStatus === "saved"} className="btn-primary">
                {busy ? <Loader2 size={14} className="animate-spin" /> :
                 saveStatus === "saved" ? <CheckCircle2 size={14} /> : <Settings2 size={14} />}
                {saveStatus === "saved" ? "Salvo" : "Salvar alterações"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// `featuresJson` no banco é JSON array de strings. UI usa textarea com 1 linha
// = 1 feature porque é mais simples pro admin que editar JSON cru.
function featuresJsonToLines(json: string | null | undefined): string {
  if (!json) return "";
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string").join("\n");
    }
    return "";
  } catch {
    return "";
  }
}

function linesToFeaturesJson(text: string): string | null {
  const items = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (items.length === 0) return null;
  return JSON.stringify(items);
}
