import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, Calendar, CheckCircle2, Edit3, Loader2, Lock, Package, Plus,
  RefreshCw, Settings2, ToggleLeft, ToggleRight, Trash2, X,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type {
  AdminCreatePlanBody,
  AdminPlanDetail, AdminPlanListItem, AdminPlansListResponse,
  AdminUpdatePlanBody, ActivityTypeName,
} from "@/types";
import { ALL_ACTIVITY_TYPES } from "@/types";
import { classNames, formatPrice } from "@/utils/format";
import { ACTIVITY_TYPE_LABEL } from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";

export default function PlansPage() {
  const [data, setData] = useState<AdminPlansListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminPlanListItem | null>(null);
  // Atividades cobertas pela união de TODOS os planos com restrição. Usado pra
  // detectar atividades órfãs (não estão em plano nenhum). Carregado paralelo
  // ao listing — uma chamada por plano restrito.
  const [coveredActivities, setCoveredActivities] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.plans.list(true);
      setData(r);

      // Calcula atividades cobertas. Plano sem restrição (porta aberta) = cobre
      // tudo, então a união automática é "todas". Plano com restrição contribui
      // só com seus tipos. Resultado: união real do que pelo menos um plano libera.
      const restrictedActivePlans = r.items.filter((p) => p.isActive && p.hasActivityRestrictions);
      const openDoorActivePlans = r.items.filter((p) => p.isActive && !p.hasActivityRestrictions);

      if (openDoorActivePlans.length > 0) {
        // Algum plano ativo é porta aberta → todas as atividades estão cobertas.
        setCoveredActivities(new Set(ALL_ACTIVITY_TYPES));
      } else {
        // Nenhum porta aberta — busca o detalhe de cada plano restrito ativo
        // pra montar a união. Em paralelo, com cap implícito (o admin tem
        // tipicamente 2-5 planos, OK).
        const details = await Promise.all(
          restrictedActivePlans.map((p) => adminApi.plans.detail(p.id).catch(() => null))
        );
        const covered = new Set<string>();
        for (const d of details) {
          if (d) for (const a of d.allowedActivities) covered.add(a);
        }
        setCoveredActivities(covered);
      }
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

  const orphanActivities = useMemo(
    () => ALL_ACTIVITY_TYPES.filter((a) => !coveredActivities.has(a)),
    [coveredActivities]
  );

  const handleDelete = async (plan: AdminPlanListItem) => {
    try {
      await adminApi.plans.delete(plan.id);
      setDeleting(null);
      load();
    } catch (err: unknown) {
      // Mantém o modal aberto pro admin ver o erro inline.
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao excluir plano.";
      throw new Error(msg);
    }
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0, restricted: 0 };
    return {
      total: data.items.length,
      active: data.items.filter((p) => p.isActive).length,
      restricted: data.items.filter((p) => p.hasActivityRestrictions).length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-tinta">Planos</h1>
          <p className="mt-1 text-sm text-cinza">
            Gerencie nome, preço, status e quais atividades cada plano libera.
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

      {/* Aviso de atividades órfãs — quando nenhum plano ATIVO libera certo tipo. */}
      {data && orphanActivities.length > 0 && (
        <div className="rounded-md border border-amarelo/40 bg-amarelo-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amarelo-900" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amarelo-900">
                {orphanActivities.length} atividade(s) sem plano que libere
              </p>
              <p className="mt-1 text-xs text-amarelo-900/80">
                Esses tipos não aparecem em nenhum plano ativo restritivo, e nenhum plano ativo está em
                "porta aberta". Subscribers atuais não conseguem gerá-las. Marque-as em algum plano:
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {orphanActivities.map((t) => (
                  <span key={t} className="rounded-full bg-creme px-2 py-0.5 text-[11px] font-semibold text-amarelo-900">
                    {ACTIVITY_TYPE_LABEL[t] ?? t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total de planos" value={stats.total} />
        <Stat label="Ativos" value={stats.active} tone="erva" />
        <Stat label="Com matriz configurada" value={stats.restricted} tone="lavanda" />
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
              totalActivityTypes={data.totalActivityTypes}
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
  plan, totalActivityTypes, onEdit, onDelete,
}: {
  plan: AdminPlanListItem; totalActivityTypes: number;
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

      <div className="rounded-md border border-tintaSoft-100 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-cinza">
            Atividades liberadas
          </span>
          {plan.hasActivityRestrictions ? (
            <StatusPill tone="amarelo">
              <Lock size={10} /> {plan.allowedActivitiesCount} de {totalActivityTypes}
            </StatusPill>
          ) : (
            <StatusPill tone="erva">
              <CheckCircle2 size={10} /> Todas ({totalActivityTypes})
            </StatusPill>
          )}
        </div>
        <p className="mt-2 text-xs text-cinza">
          {plan.hasActivityRestrictions
            ? "Plano restritivo. Tentativas de gerar tipos não-listados são bloqueadas no backend."
            : "Sem restrição (porta aberta). Qualquer atividade do catálogo pode ser gerada."}
        </p>
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
          title="Excluir plano (só sem assinaturas)"
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
        .normalize("NFD").replace(/[̀-ͯ]/g, "")  // remove acentos
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
          O plano é criado <strong>ativo</strong>, em modo <strong>porta aberta</strong> (libera todas as
          atividades). Você pode restringir atividades depois clicando em "Editar".
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
            Criar e configurar atividades
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
          Excluir o plano <strong>{plan.name}</strong> ({plan.slug})? A operação só funciona se NÃO houver
          assinaturas associadas — mesmo canceladas, mesmo expiradas. Caso contrário, desative o plano em vez disso.
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

// ── Modal: editar plano (campos básicos + matriz) ───────────────────────
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

  // Matriz: undefined = ainda carregando; Set = atual.
  const [allowed, setAllowed] = useState<Set<ActivityTypeName>>(new Set());
  // "porta aberta" toggle: quando ON, salva matriz vazia (libera tudo).
  const [openDoor, setOpenDoor] = useState(false);

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
        setAllowed(new Set(d.allowedActivities));
        setOpenDoor(d.allowedActivities.length === 0);
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

  const toggleActivity = (type: ActivityTypeName) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const selectAll = () => setAllowed(new Set(ALL_ACTIVITY_TYPES));
  const selectNone = () => setAllowed(new Set());

  // Feedback de save: null durante a edição, "saved" após sucesso (mostra
  // banner verde por 800ms antes de fechar), "error" mantém banner vermelho.
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

      // Update parcial: só envia campos que mudaram.
      const updates: AdminUpdatePlanBody = {};
      if (name !== data.name) updates.name = name.trim();
      if (numericPrice !== data.monthlyPrice) updates.monthlyPrice = numericPrice;
      if ((description || null) !== (data.description ?? null)) updates.description = description || null;
      if (isActive !== data.isActive) updates.isActive = isActive;
      if (sortOrder !== data.sortOrder) updates.sortOrder = sortOrder;
      if (includesWeeklyPlanner !== data.includesWeeklyPlanner) updates.includesWeeklyPlanner = includesWeeklyPlanner;

      if (Object.keys(updates).length > 0) {
        await adminApi.plans.update(data.id, updates);
      }

      // Set activities — sempre envia (porta aberta = lista vazia).
      const activities = openDoor ? [] : Array.from(allowed);
      await adminApi.plans.setActivities(data.id, activities);

      // Confirmação visual antes de fechar — usuário vê o "✓ Salvo" por
      // ~700ms. Sem isso a modal fecha sem sinal de sucesso e o usuário
      // fica sem saber se a alteração foi aplicada.
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
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-creme p-6 shadow-xl"
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
                    placeholder="Texto curto exibido na página de planos."
                  />
                </Field>
              </div>

              {/* Toggles em <div> (não <label>): button-em-label causa double-fire
                  do click pelo bubble nativo do label, anulando o toggle.
                  cursor-pointer no wrapper pra ainda manter UX de "área toda
                  é clicável" — handler delega ao mesmo setter do botão. */}
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
                      Inativo = não aparece na vitrine de planos. Assinaturas existentes não são canceladas.
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

            {/* Matriz Plano × Atividade */}
            <section className="rounded-md border border-tintaSoft-100 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-tinta">Matriz de atividades</h3>
                  <p className="text-xs text-cinza">
                    Marque quais atividades este plano libera. "Porta aberta" libera tudo (legado).
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={openDoor}
                    onChange={(e) => setOpenDoor(e.target.checked)}
                  />
                  Porta aberta (libera todas)
                </label>
              </div>

              {!openDoor && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={selectAll} className="btn-ghost h-7 px-2 text-xs">
                      Marcar tudo
                    </button>
                    <button type="button" onClick={selectNone} className="btn-ghost h-7 px-2 text-xs">
                      Desmarcar tudo
                    </button>
                    <span className="ml-auto self-center text-xs text-cinza">
                      {allowed.size} / {ALL_ACTIVITY_TYPES.length} liberadas
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {ALL_ACTIVITY_TYPES.map((type) => {
                      const checked = allowed.has(type);
                      return (
                        <label
                          key={type}
                          className={classNames(
                            "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                            checked
                              ? "border-erva/40 bg-erva/5"
                              : "border-tintaSoft-100 hover:border-tintaSoft-200"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleActivity(type)}
                            className="accent-erva"
                          />
                          <span className="flex-1 text-tinta">{ACTIVITY_TYPE_LABEL[type] ?? type}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {openDoor && (
                <p className="rounded-md bg-erva/10 p-2 text-xs text-erva">
                  ✓ Porta aberta — todos os {ALL_ACTIVITY_TYPES.length} tipos de atividade serão liberados.
                </p>
              )}
            </section>

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
