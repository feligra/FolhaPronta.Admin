import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Ban, BookOpen, CalendarPlus, CheckCircle2, CreditCard,
  Edit3, FileText, Loader2, Mail, MapPin, Phone, Repeat, Send, Sparkles, Trash2,
  User as UserIcon, Users as UsersIcon, X,
} from "lucide-react";
import { adminApi } from "@/services/api";
import type { AdminPlanListItem, AdminUserDetail, AdminUpdateUserBody } from "@/types";
import { classNames, formatDate, formatDateTime, formatPrice } from "@/utils/format";
import {
  ACTIVITY_TYPE_LABEL,
  PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE,
  SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE,
  USER_TYPE_LABEL,
} from "@/utils/labels";
import { StatusPill } from "@/components/StatusPill";

type TabKey = "overview" | "subscription" | "payments" | "activities" | "classrooms";

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: "overview", label: "Visão geral", icon: UserIcon },
  { key: "subscription", label: "Assinatura", icon: Sparkles },
  { key: "payments", label: "Pagamentos", icon: CreditCard },
  { key: "activities", label: "Atividades", icon: FileText },
  { key: "classrooms", label: "Turmas", icon: BookOpen },
];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // Modal state pra ações de assinatura. Só uma aberta por vez.
  type SubAction = { kind: "grant" | "change" | "cancel" | "extend" } | null;
  const [subAction, setSubAction] = useState<SubAction>(null);

  // Modais de edição/exclusão do USUÁRIO (não da sub).
  const [editingUser, setEditingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.users.detail(id);
      setData(r);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao carregar cliente.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-cinza">
        <Loader2 size={20} className="animate-spin" /> Carregando…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-cinza hover:text-tinta">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <div className="card flex items-start gap-2 text-coral-800">
          <AlertCircle size={18} className="mt-0.5" />
          <div>
            <p className="font-semibold">Não foi possível carregar este cliente.</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const { user, currentSubscription, payments, totalActivitiesGenerated, activitiesByType, classrooms } = data;

  return (
    <div className="space-y-6">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-cinza hover:text-tinta">
        <ArrowLeft size={14} /> Clientes
      </Link>

      {/* Header com identidade */}
      <header className="card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={classNames(
            "flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md font-display text-xl font-bold",
            user.role === "Admin" ? "bg-coral text-creme" : "bg-tintaSoft-50 text-tinta"
          )}>
            {user.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-tinta">{user.name}</h1>
            <p className="text-sm text-cinza">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={user.isActive ? "erva" : "coral"}>
                {user.isActive ? "Ativo" : "Inativo"}
              </StatusPill>
              {user.role === "Admin" && <StatusPill tone="coral">Admin</StatusPill>}
              <StatusPill tone="neutral">{USER_TYPE_LABEL[user.userType] ?? "—"}</StatusPill>
              {!user.emailConfirmed && <StatusPill tone="amarelo">E-mail não confirmado</StatusPill>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 sm:text-right">
          <div className="text-xs text-cinza">
            <div>Cadastro: <strong className="text-tinta">{formatDate(user.createdAt)}</strong></div>
            <div className="mt-1">Último login: <strong className="text-tinta">{formatDateTime(user.lastLoginAt)}</strong></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditingUser(true)} className="btn-ghost h-8 px-2 text-xs">
              <Edit3 size={12} /> Editar
            </button>
            <button
              onClick={() => setDeletingUser(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-coral/30 bg-coral-50 px-2 text-xs font-semibold text-coral-800 transition hover:bg-coral-100"
              title="Excluir usuário (soft-delete; libera o email)"
            >
              <Trash2 size={12} /> Excluir
            </button>
          </div>
        </div>
      </header>

      {!user.emailConfirmed && <EmailNotConfirmedBanner userId={user.id} />}

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-tintaSoft-100 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={classNames(
                "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition whitespace-nowrap",
                isActive
                  ? "border-coral text-coral-800"
                  : "border-transparent text-cinza hover:text-tinta"
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Identidade">
            <Field label="Nome" value={user.name} />
            <Field label="E-mail" value={user.email} icon={Mail} />
            <Field label="Telefone" value={user.phone || "—"} icon={Phone} />
            <Field label="CPF" value={user.cpf || "—"} mono />
            <Field label="Tipo de usuário" value={USER_TYPE_LABEL[user.userType] ?? "—"} />
            <Field label="Role" value={user.role} />
          </Section>
          <Section title="Endereço">
            {user.address ? (
              <>
                <Field label="CEP" value={user.address.zipCode} icon={MapPin} />
                <Field label="Logradouro" value={`${user.address.street}, ${user.address.number}${user.address.complement ? ` — ${user.address.complement}` : ""}`} />
                <Field label="Bairro" value={user.address.neighborhood} />
                <Field label="Cidade/UF" value={`${user.address.city}/${user.address.state}`} />
              </>
            ) : (
              <p className="text-sm text-cinza">Endereço não cadastrado.</p>
            )}
          </Section>
          <Section title="Trial">
            {user.trialStartedAt ? (
              <>
                <Field label="Início" value={formatDate(user.trialStartedAt)} />
                <Field label="Expira em" value={formatDate(user.trialEndsAt)} />
                <Field label="PDFs gerados (trial)" value={String(user.trialPdfsGenerated)} />
              </>
            ) : (
              <p className="text-sm text-cinza">Trial ainda não iniciado.</p>
            )}
          </Section>
          <Section title="Resumo de uso">
            <Field label="Atividades geradas" value={String(totalActivitiesGenerated)} />
            <Field label="Turmas" value={String(classrooms.length)} />
            <Field label="Pagamentos registrados" value={String(payments.length)} />
          </Section>
        </div>
      )}

      {tab === "subscription" && (
        <Section title="Assinatura corrente">
          {currentSubscription ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl font-bold text-tinta">
                    {currentSubscription.planName ?? "—"}
                  </p>
                  <p className="text-sm text-cinza">
                    R$ {formatPrice(currentSubscription.monthlyAmount)}/mês
                  </p>
                </div>
                <StatusPill tone={SUBSCRIPTION_STATUS_TONE[currentSubscription.status]}>
                  {SUBSCRIPTION_STATUS_LABEL[currentSubscription.status]}
                </StatusPill>
              </div>
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <Field label="Plano (slug)" value={currentSubscription.planSlug ?? "—"} />
                <Field label="Acesso vigente?" value={currentSubscription.hasAccess ? "Sim" : "Não"} />
                <Field label="Início do período" value={formatDate(currentSubscription.currentPeriodStart)} />
                <Field label="Fim do período" value={formatDate(currentSubscription.currentPeriodEnd)} />
                <Field label="Cancelada em" value={formatDate(currentSubscription.canceledAt)} />
                <Field label="Motivo do cancelamento" value={currentSubscription.cancelReason || "—"} />
                <Field label="Subscription id" value={currentSubscription.id} mono />
                <Field label="Criada em" value={formatDate(currentSubscription.createdAt)} />
              </div>

              {/* Ações administrativas — variantes dependendo do estado da sub.
                  - Active: cancelar (civilizado) é a opção natural
                  - Cancelled-vigente: já tá cancelada, só faz sentido cortar acesso AGORA
                  - Sem acesso (Cancelled-expirada/Expired/PendingPayment-sem-acesso):
                    só conceder nova faz sentido. */}
              <div className="flex flex-wrap gap-2 border-t border-tintaSoft-100 pt-4">
                {currentSubscription.hasAccess && currentSubscription.status !== "Cancelled" && (
                  <>
                    <button onClick={() => setSubAction({ kind: "change" })} className="btn-primary">
                      <Repeat size={14} /> Trocar plano
                    </button>
                    <button onClick={() => setSubAction({ kind: "extend" })} className="btn-ghost">
                      <CalendarPlus size={14} /> Estender vigência
                    </button>
                    <button onClick={() => setSubAction({ kind: "cancel" })} className="btn-ghost">
                      <Ban size={14} /> Cancelar
                    </button>
                  </>
                )}
                {currentSubscription.hasAccess && currentSubscription.status === "Cancelled" && (
                  <>
                    <button onClick={() => setSubAction({ kind: "extend" })} className="btn-primary">
                      <CalendarPlus size={14} /> Estender (reativa)
                    </button>
                    <button onClick={() => setSubAction({ kind: "change" })} className="btn-ghost">
                      <Repeat size={14} /> Trocar plano
                    </button>
                    <button onClick={() => setSubAction({ kind: "cancel" })} className="btn-ghost">
                      <Ban size={14} /> Cortar acesso agora
                    </button>
                  </>
                )}
                {!currentSubscription.hasAccess && (
                  <button onClick={() => setSubAction({ kind: "grant" })} className="btn-primary">
                    <Sparkles size={14} /> Conceder nova assinatura
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-cinza">Este cliente nunca assinou.</p>
              <button onClick={() => setSubAction({ kind: "grant" })} className="btn-primary">
                <Sparkles size={14} /> Conceder assinatura
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Modais de ação de assinatura */}
      {subAction?.kind === "grant" && id && (
        <GrantSubscriptionModal
          userId={id}
          onClose={() => setSubAction(null)}
          onDone={() => { setSubAction(null); load(); }}
        />
      )}
      {subAction?.kind === "change" && currentSubscription && (
        <ChangePlanModal
          subscriptionId={currentSubscription.id}
          currentPlanId={currentSubscription.planId}
          onClose={() => setSubAction(null)}
          onDone={() => { setSubAction(null); load(); }}
        />
      )}
      {subAction?.kind === "extend" && currentSubscription && (
        <ExtendSubscriptionModal
          subscriptionId={currentSubscription.id}
          currentPeriodEnd={currentSubscription.currentPeriodEnd}
          onClose={() => setSubAction(null)}
          onDone={() => { setSubAction(null); load(); }}
        />
      )}
      {subAction?.kind === "cancel" && currentSubscription && (
        <CancelSubscriptionModal
          subscriptionId={currentSubscription.id}
          currentPeriodEnd={currentSubscription.currentPeriodEnd}
          alreadyCancelled={currentSubscription.status === "Cancelled"}
          onClose={() => setSubAction(null)}
          onDone={() => { setSubAction(null); load(); }}
        />
      )}

      {/* Edição/Exclusão do USUÁRIO. */}
      {editingUser && (
        <EditUserModal
          user={user}
          onClose={() => setEditingUser(false)}
          onSaved={() => { setEditingUser(false); load(); }}
        />
      )}
      {deletingUser && (
        <DeleteUserModal
          user={user}
          onClose={() => setDeletingUser(false)}
          onDeleted={() => navigate("/clientes")}
        />
      )}

      {tab === "payments" && (
        <Section title={`Pagamentos (${payments.length})`}>
          {payments.length === 0 ? (
            <p className="text-sm text-cinza">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="divide-y divide-tintaSoft-100">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-tinta">
                      {p.description ?? p.type}
                    </p>
                    <p className="mt-0.5 text-xs text-cinza">
                      {formatDateTime(p.paidAt ?? p.createdAt)}
                      {p.paymentMethod && ` · ${p.paymentMethod}`}
                    </p>
                    {p.failureReason && (
                      <p className="mt-1 text-xs italic text-coral-800">{p.failureReason}</p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right">
                    <p className="font-semibold text-tinta">R$ {formatPrice(p.amount)}</p>
                    <StatusPill tone={PAYMENT_STATUS_TONE[p.status]} className="mt-1">
                      {PAYMENT_STATUS_LABEL[p.status]}
                    </StatusPill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "activities" && (
        <Section title={`Atividades geradas (${totalActivitiesGenerated})`}>
          {activitiesByType.length === 0 ? (
            <p className="text-sm text-cinza">Nenhuma atividade gerada ainda.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {activitiesByType.map((a) => (
                <li key={a.type} className="flex items-center justify-between rounded-md border border-tintaSoft-100 px-3 py-2 text-sm">
                  <span className="text-tinta">{ACTIVITY_TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="font-bold text-coral-800">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "classrooms" && (
        <Section title={`Turmas (${classrooms.length})`}>
          {classrooms.length === 0 ? (
            <p className="text-sm text-cinza">Nenhuma turma cadastrada.</p>
          ) : (
            <ul className="divide-y divide-tintaSoft-100">
              {classrooms.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-tinta">{c.name}</p>
                    <p className="text-xs text-cinza">Criada em {formatDate(c.createdAt)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-cinza">
                    <UsersIcon size={12} /> {c.studentCount} aluno(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-cinza">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, mono, icon: Icon }: { label: string; value: string; mono?: boolean; icon?: typeof UserIcon }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon size={14} className="mt-0.5 text-cinza" />}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cinza">{label}</p>
        <p className={classNames(
          "mt-0.5 break-words text-tinta",
          mono ? "font-mono text-xs" : "text-sm"
        )}>
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Banner amarelo com ação "Reenviar email de confirmação". Estado local
 * (idle/sending/sent/error) — não recarrega a página inteira porque o status
 * `emailConfirmed` só vira true quando o usuário clicar no link do email.
 */
function EmailNotConfirmedBanner({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onResend = async () => {
    setState("sending");
    setError(null);
    try {
      await adminApi.users.resendEmailConfirmation(userId);
      setState("sent");
      // Volta o botão pro estado original em 5s pra permitir reenvio se preciso.
      setTimeout(() => setState("idle"), 5000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Falha ao enviar email.";
      setError(msg);
      setState("error");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-amarelo/40 bg-amarelo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm text-amarelo-900">
        <Mail size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">E-mail ainda não confirmado</p>
          <p className="text-xs text-amarelo-900/80">
            O cliente não pode usar o trial até confirmar. Reenvie o link.
          </p>
          {state === "error" && error && (
            <p className="mt-1 text-xs italic text-coral-800">{error}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onResend}
        disabled={state === "sending" || state === "sent"}
        className={classNames(
          "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition flex-shrink-0",
          state === "sent"
            ? "bg-erva text-creme"
            : "bg-tinta text-creme hover:bg-tintaSoft-600 disabled:opacity-60"
        )}
      >
        {state === "sending" && (<><Loader2 size={14} className="animate-spin" /> Enviando…</>)}
        {state === "sent" && (<><CheckCircle2 size={14} /> Email enviado</>)}
        {(state === "idle" || state === "error") && (<><Send size={14} /> Reenviar confirmação</>)}
      </button>
    </div>
  );
}

// ── Modal genérico ─────────────────────────────────────────────────────
function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-creme p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-tinta">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-cinza hover:text-tinta">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Carrega planos ATIVOS pra os selects das modais (Conceder/Trocar). */
function useActivePlans() {
  const [plans, setPlans] = useState<AdminPlanListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await adminApi.plans.list(false);
        if (!cancelled) setPlans(r.items.filter((p) => p.isActive));
      } catch {
        if (!cancelled) setError("Falha ao carregar planos.");
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return { plans, error };
}

const DAYS_PRESETS = [7, 15, 30, 60, 90];

// ── Conceder assinatura ────────────────────────────────────────────────
function GrantSubscriptionModal({
  userId, onClose, onDone,
}: { userId: string; onClose: () => void; onDone: () => void }) {
  const { plans, error: plansError } = useActivePlans();
  const [planId, setPlanId] = useState<string>("");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!planId) { setErr("Escolha um plano."); return; }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.users.grantSubscription(userId, { planId, days, reason: reason || undefined });
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao conceder assinatura.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Conceder assinatura" onClose={onClose}>
      <p className="text-sm text-tinta/80">
        Cria uma assinatura <strong>Active</strong> diretamente, sem passar pelo Mercado Pago.
        Use pra cortesias, parcerias ou setup manual.
      </p>

      <label className="label mt-4">Plano</label>
      <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
        <option value="">— Escolha um plano —</option>
        {plans?.map((p) => (
          <option key={p.id} value={p.id}>{p.name} (R$ {formatPrice(p.monthlyPrice)}/mês)</option>
        ))}
      </select>
      {plansError && <p className="mt-1 text-xs text-coral-800">{plansError}</p>}

      <DaysPicker days={days} setDays={setDays} />

      <label className="label mt-4">Motivo (opcional)</label>
      <textarea className="input min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cortesia de boas-vindas" />

      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Conceder por {days}d
        </button>
      </div>
    </Modal>
  );
}

// ── Trocar plano (admin) ───────────────────────────────────────────────
function ChangePlanModal({
  subscriptionId, currentPlanId, onClose, onDone,
}: { subscriptionId: string; currentPlanId: string; onClose: () => void; onDone: () => void }) {
  const { plans, error: plansError } = useActivePlans();
  const [planId, setPlanId] = useState<string>("");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!planId) { setErr("Escolha um plano."); return; }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.subscriptions.changePlan(subscriptionId, { newPlanId: planId, days, reason: reason || undefined });
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao trocar plano.");
    } finally { setBusy(false); }
  };

  // Filtra o plano atual da lista — admin não troca pra ele mesmo.
  const otherPlans = plans?.filter((p) => p.id !== currentPlanId) ?? [];

  return (
    <Modal title="Trocar plano da assinatura" onClose={onClose}>
      <p className="text-sm text-tinta/80">
        Cancela a assinatura atual no Mercado Pago (best-effort) e cria uma nova
        assinatura <strong>Active</strong> no plano alvo. A nova fica ativa imediatamente
        pelos dias informados — não passa por checkout.
      </p>

      <label className="label mt-4">Novo plano</label>
      <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
        <option value="">— Escolha um plano —</option>
        {otherPlans.map((p) => (
          <option key={p.id} value={p.id}>{p.name} (R$ {formatPrice(p.monthlyPrice)}/mês)</option>
        ))}
      </select>
      {plansError && <p className="mt-1 text-xs text-coral-800">{plansError}</p>}

      <DaysPicker days={days} setDays={setDays} />

      <label className="label mt-4">Motivo (opcional)</label>
      <textarea className="input min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: solicitação por suporte" />

      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
          Trocar plano
        </button>
      </div>
    </Modal>
  );
}

// ── Estender vigência ──────────────────────────────────────────────────
function ExtendSubscriptionModal({
  subscriptionId, currentPeriodEnd, onClose, onDone,
}: { subscriptionId: string; currentPeriodEnd: string | null; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.subscriptions.extend(subscriptionId, days, reason || undefined);
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao estender.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Estender vigência (cortesia)" onClose={onClose}>
      <p className="text-sm text-tinta/80">
        Vigência atual: <strong>{formatDate(currentPeriodEnd)}</strong>. Subs Cancelled/Expired
        voltam pra Active automaticamente.
      </p>
      <DaysPicker days={days} setDays={setDays} />
      <label className="label mt-4">Motivo (opcional)</label>
      <textarea className="input min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: compensação por incidente" />
      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
          Estender por {days}d
        </button>
      </div>
    </Modal>
  );
}

// ── Cancelar ───────────────────────────────────────────────────────────
function CancelSubscriptionModal({
  subscriptionId, currentPeriodEnd, alreadyCancelled, onClose, onDone,
}: {
  subscriptionId: string; currentPeriodEnd: string | null;
  alreadyCancelled?: boolean;
  onClose: () => void; onDone: () => void;
}) {
  // Quando a sub já está Cancelled-vigente, o backend SÓ aceita immediate=true
  // (cancelar civilizado dela seria no-op). Forçamos isso pra UI ficar honesta.
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(!!alreadyCancelled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.subscriptions.cancel(subscriptionId, reason || undefined, immediate);
      onDone();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao cancelar.");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      title={alreadyCancelled ? "Cortar acesso agora" : "Cancelar assinatura"}
      onClose={onClose}
    >
      {alreadyCancelled ? (
        <p className="text-sm text-tinta/80">
          A assinatura já foi cancelada e o acesso vence em <strong>{formatDate(currentPeriodEnd)}</strong>.
          Esta ação corta o acesso <strong>imediatamente</strong> (não dá pra desfazer pelo painel).
        </p>
      ) : (
        <p className="text-sm text-tinta/80">
          Cancelamento "civilizado" mantém acesso até <strong>{formatDate(currentPeriodEnd)}</strong>.
        </p>
      )}
      <label className="label mt-4">Motivo (opcional)</label>
      <textarea className="input min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: solicitação por suporte" />
      {!alreadyCancelled && (
        <label className="mt-3 flex items-start gap-2 text-sm text-tinta">
          <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="block font-semibold">Cortar acesso imediatamente</span>
            <span className="block text-[11px] text-cinza">Marca CurrentPeriodEnd no passado — cliente perde acesso já. Use só em casos extremos (fraude, abuso).</span>
          </span>
        </label>
      )}
      {err && <p className="mt-3 rounded-md bg-coral-50 p-2 text-sm text-coral-800">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Voltar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-coral">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
          {alreadyCancelled ? "Confirmar corte de acesso" : "Confirmar cancelamento"}
        </button>
      </div>
    </Modal>
  );
}

// ── Helper: input de dias com presets ──────────────────────────────────
function DaysPicker({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <div className="mt-3">
      <label className="label">Dias de vigência</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input w-24"
        />
        <span className="text-xs text-cinza">(1 a 365)</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {DAYS_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDays(n)}
            className={
              "rounded-full px-2 py-0.5 text-xs font-semibold " +
              (days === n ? "bg-tinta text-creme" : "bg-tintaSoft-50 text-tinta hover:bg-tintaSoft-100")
            }
          >
            {n}d
          </button>
        ))}
      </div>
    </div>
  );
}

// Wrapper de input rotulado pra forms editáveis (diferente do `Field`
// read-only definido acima).
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// ── Editar usuário (perfil + role + status) ────────────────────────────
function EditUserModal({
  user, onClose, onSaved,
}: {
  user: AdminUserDetail["user"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [isActive, setIsActive] = useState(user.isActive);
  const [role, setRole] = useState(user.role);
  const [userType, setUserType] = useState(user.userType);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      // Update parcial — só envia campos que mudaram. Reduz risco de bater
      // unique-email quando o admin não mexeu no email.
      const body: AdminUpdateUserBody = {};
      if (name.trim() !== user.name) body.name = name.trim();
      if (email.trim().toLowerCase() !== user.email) body.email = email.trim().toLowerCase();
      if ((phone.trim() || null) !== (user.phone ?? null)) body.phone = phone.trim();
      if (isActive !== user.isActive) body.isActive = isActive;
      if (role !== user.role) body.role = role;
      if (userType !== user.userType) body.userType = userType;

      if (Object.keys(body).length === 0) { onSaved(); return; }

      await adminApi.users.update(user.id, body);
      onSaved();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao salvar.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Editar usuário" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="E-mail">
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Telefone">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 9..." />
        </FormField>
        <FormField label="Tipo">
          <select className="input" value={userType} onChange={(e) => setUserType(Number(e.target.value))}>
            <option value={0}>Pais/Responsável</option>
            <option value={1}>Professor(a)</option>
            <option value={2}>Escola</option>
          </select>
        </FormField>
        <FormField label="Role">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="User">User</option>
            <option value="Admin">Admin</option>
          </select>
        </FormField>
        <FormField label="Status">
          <select className="input" value={isActive ? "true" : "false"} onChange={(e) => setIsActive(e.target.value === "true")}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </FormField>
      </div>

      <p className="mt-3 text-[11px] text-cinza">
        Trocar o e-mail força reconfirmação (resetará "E-mail confirmado"). Senha não é
        editável aqui — use o fluxo de "esqueci a senha" no app principal.
      </p>

      {err && <div className="mt-3 rounded-md bg-coral-50 p-3 text-sm text-coral-800">{err}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
          Salvar alterações
        </button>
      </div>
    </Modal>
  );
}

// ── Excluir usuário (soft-delete) ──────────────────────────────────────
function DeleteUserModal({
  user, onClose, onDeleted,
}: {
  user: AdminUserDetail["user"];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pra evitar clique acidental, exigimos digitar o e-mail (padrão GitHub).
  const canSubmit = confirm.trim().toLowerCase() === user.email;

  const submit = async () => {
    if (!canSubmit) { setErr("Digite o e-mail exatamente pra confirmar."); return; }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.users.remove(user.id, reason || undefined);
      onDeleted();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? "Falha ao excluir.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Excluir usuário" onClose={onClose}>
      <div className="space-y-3 text-sm text-tinta">
        <p>
          Vai excluir <strong>{user.name}</strong> ({user.email}). Operação <strong>soft-delete</strong>:
          o registro fica no banco pra auditoria, mas o usuário some das listagens, é deslogado, e o
          e-mail fica <strong>livre pra novo cadastro imediatamente</strong>.
        </p>
        <p className="text-xs text-coral-800">
          Qualquer assinatura ativa do cliente é cancelada (incluindo no Mercado Pago). Não dá pra
          desfazer pelo painel.
        </p>
      </div>

      <label className="label mt-4">Motivo (opcional)</label>
      <textarea className="input min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: solicitação por LGPD, conta de teste, fraude" />

      <label className="label mt-4">Digite o e-mail pra confirmar</label>
      <input
        className="input"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={user.email}
        autoComplete="off"
      />

      {err && <div className="mt-3 rounded-md bg-coral-50 p-3 text-sm text-coral-800">{err}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy || !canSubmit} className="btn-coral">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Excluir definitivamente
        </button>
      </div>
    </Modal>
  );
}
