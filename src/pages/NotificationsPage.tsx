import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, CheckCircle2, Edit3, Loader2, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AdminDialog } from "@/components/AdminDialog";
import { Link } from "react-router-dom";
import { adminApi } from "@/services/api";
import type { NotificationRecipient, NotificationRecipientBody, NotificationDeliveryStatus } from "@/types";
import { formatDateTime } from "@/utils/format";

const EVENTS = [
  { key: "customerRegistered", label: "Cliente cadastrado", hint: "Receba um aviso quando uma nova conta for criada." },
  { key: "paymentApproved", label: "Pagamento aprovado", hint: "Receba a confirmação quando o pagamento for aprovado." },
  { key: "activityReported", label: "Report de atividade e complexidade", hint: "Acompanhe problemas e avaliações enviados nas atividades." },
  { key: "contactMessage", label: "Formulário de contato", hint: "Receba uma cópia das mensagens enviadas pelo site." },
] as const;
const initial: NotificationRecipientBody = { email: "", enabled: true, customerRegistered: true, paymentApproved: true, activityReported: true, contactMessage: true };
const errorMessage = (error: unknown, fallback: string) => (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;

export default function NotificationsPage() {
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<NotificationDeliveryStatus | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [editing, setEditing] = useState<NotificationRecipient | "new" | null>(null);
  const [removing, setRemoving] = useState<NotificationRecipient | null>(null);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError(null);
    const [list, status] = await Promise.allSettled([adminApi.notificationRecipients.list(), adminApi.notificationStatus()]);
    if (version !== loadVersion.current) return;
    if (list.status === "fulfilled") setRecipients(list.value);
    else setError(errorMessage(list.reason, "Não foi possível carregar os destinatários."));
    if (status.status === "fulfilled") { setDelivery(status.value); setDeliveryError(null); }
    else { setDelivery(null); setDeliveryError("Não foi possível consultar o estado dos envios."); }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { loadVersion.current++; window.removeEventListener("focus", focus); };
  }, [load]);

  const remove = async () => {
    if (!removing || mutation.current) return;
    mutation.current = true; setBusy(true); setError(null);
    try {
      await adminApi.notificationRecipients.remove(removing.id);
      // A consulta iniciada antes da exclusão já não representa a lista atual.
      loadVersion.current++; setLoading(false);
      setRecipients((items) => items.filter((item) => item.id !== removing.id));
      setRemoving(null); setNotice("Destinatário removido.");
    } catch (reason) { setError(errorMessage(reason, "Não foi possível remover este destinatário.")); }
    finally { mutation.current = false; setBusy(false); }
  };
  return <div className="space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-display text-3xl font-bold">Notificações</h1><p className="mt-1 max-w-2xl text-sm text-cinza">Escolha os e-mails da sua equipe e os acontecimentos que cada pessoa deve receber.</p></div>
      <div className="flex flex-wrap gap-2"><button className="btn-ghost" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar</button><button className="btn-primary" onClick={() => { setNotice(null); setEditing("new"); }}><Plus size={16} /> Adicionar e-mail</button></div>
    </header>
    {delivery && <section aria-label="Estado dos envios" className={`rounded-xl border p-4 text-sm ${delivery.smtpConfigured ? "border-erva/30 bg-erva/10" : "border-amarelo/50 bg-amarelo/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{delivery.smtpConfigured ? "Envio configurado" : "Envio pausado — serviço de e-mail não configurado"}</p><Link to="/emails" className="font-semibold text-coral-800 underline underline-offset-4">Ver logs de e-mail</Link></div>
      {!delivery.smtpConfigured && <p className="mt-2 text-cinza">Os acontecimentos ficam salvos na fila enquanto o serviço de e-mail está sem configuração. Os envios serão retomados quando estiver disponível.</p>}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><div className="flex gap-1"><dt>Pendentes:</dt><dd className="font-bold">{delivery.pending}</dd></div><div className="flex gap-1"><dt>Em nova tentativa:</dt><dd className="font-bold">{delivery.retrying}</dd></div><div className="flex gap-1"><dt>Entregues:</dt><dd className="font-bold">{delivery.delivered}</dd></div></dl>
      {delivery.oldestPendingAt && <p className="mt-2 text-xs text-cinza">Primeiro envio pendente: {formatDateTime(delivery.oldestPendingAt)}</p>}
    </section>}
    {deliveryError && <p role="alert" className="rounded-md bg-amarelo/10 p-3 text-sm text-amarelo-800">{deliveryError} Use Atualizar para tentar novamente.</p>}
    <div className="rounded-xl border border-turquesa/30 bg-turquesa/10 p-4 text-sm text-tinta"><Mail className="mb-2" size={20} /><p>Você pode cadastrar seu e-mail, o de um sócio e outros destinatários, com preferências independentes. As cópias do formulário são enviadas além do contato principal do site.</p><p className="mt-2 text-cinza">Mensagens enviadas diretamente ao endereço de e-mail do site são recebidas pela caixa de correio. Para também encaminhá-las, configure o encaminhamento no seu provedor de e-mail.</p></div>
    {error && <p role="alert" className="rounded-md bg-coral-50 p-3 text-sm text-coral-800">{error}</p>}
    {notice && <p role="status" className="flex items-center gap-2 text-sm text-erva"><CheckCircle2 size={18} />{notice}</p>}
    {loading && !recipients.length ? <p className="flex items-center gap-2 py-10 text-cinza"><Loader2 size={18} className="animate-spin" /> Carregando destinatários…</p> : <div className="grid gap-4 xl:grid-cols-2">
      {recipients.map((recipient) => <article key={recipient.id} className="card min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-all text-base font-semibold">{recipient.email}</h2><span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${recipient.enabled ? "bg-erva/15 text-erva" : "bg-tintaSoft-50 text-cinza"}`}>{recipient.enabled ? "Recebimento ativo" : "Recebimento pausado"}</span></div><div className="flex gap-2"><button type="button" className="btn-ghost px-3" onClick={() => setEditing(recipient)} aria-label={`Editar ${recipient.email}`}><Edit3 size={16} /></button><button type="button" className="btn-ghost px-3 text-coral-800" onClick={() => { setError(null); setRemoving(recipient); }} aria-label={`Remover ${recipient.email}`}><Trash2 size={16} /></button></div></div>
        <ul className="space-y-2 text-sm">{EVENTS.map((event) => <li key={event.key} className={`flex items-start gap-2 ${recipient[event.key] ? "text-tinta" : "text-cinza"}`}><CheckCircle2 size={16} className={`mt-0.5 shrink-0 ${recipient[event.key] ? "text-erva" : "opacity-30"}`} />{event.label}{!recipient[event.key] && <span className="ml-auto text-xs">Desativado</span>}</li>)}</ul>
      </article>)}
      {!recipients.length && !error && <div className="card flex flex-col items-center gap-3 py-10 text-center xl:col-span-2"><Bell size={30} className="text-cinza" /><h2 className="font-semibold">Nenhum destinatário cadastrado</h2><p className="max-w-md text-sm text-cinza">Adicione seu e-mail para acompanhar novos clientes, pagamentos, reports e contatos.</p><button className="btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Adicionar e-mail</button></div>}
    </div>}
    {editing && <RecipientEditor recipient={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice("Preferências salvas."); await load(); }} />}
    {removing && <AdminDialog title="Remover destinatário" busy={busy} onClose={() => setRemoving(null)}><p className="break-words text-sm">O e-mail <strong>{removing.email}</strong> deixará de receber os acontecimentos selecionados.</p>{error && <p role="alert" className="mt-3 text-sm text-coral-800">{error}</p>}<div className="mt-6 flex flex-wrap justify-end gap-2"><button className="btn-ghost" disabled={busy} onClick={() => setRemoving(null)}>Voltar</button><button className="btn-coral" disabled={busy} onClick={() => void remove()}>{busy && <Loader2 size={16} className="animate-spin" />}Remover</button></div></AdminDialog>}
  </div>;
}

function RecipientEditor({ recipient, onClose, onSaved }: { recipient: NotificationRecipient | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<NotificationRecipientBody>(recipient ? { ...recipient } : initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving.current) return;
    const email = form.email.trim();
    if (!EVENTS.some(({ key }) => form[key])) { setError("Selecione pelo menos um acontecimento."); return; }
    saving.current = true; setBusy(true); setError(null);
    const body: NotificationRecipientBody = { email, enabled: form.enabled, customerRegistered: form.customerRegistered, paymentApproved: form.paymentApproved, activityReported: form.activityReported, contactMessage: form.contactMessage };
    try { if (recipient) await adminApi.notificationRecipients.update(recipient.id, body); else await adminApi.notificationRecipients.create(body); await onSaved(); }
    catch (reason) { setError(errorMessage(reason, "Não foi possível salvar. Tente novamente.")); }
    finally { saving.current = false; setBusy(false); }
  };
  return <AdminDialog title={recipient ? "Editar destinatário" : "Adicionar destinatário"} onClose={onClose} busy={busy}>
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div><label htmlFor="recipient-email" className="label">E-mail</label><input id="recipient-email" className="input" type="email" autoComplete="email" maxLength={254} required disabled={busy} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="voce@empresa.com.br" /></div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-tintaSoft-100 p-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0 accent-erva" disabled={busy} checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />Recebimento ativo</label>
      <fieldset disabled={busy} className="space-y-2"><legend className="label mb-3">Acontecimentos</legend>{EVENTS.map((event) => <label key={event.key} className="flex cursor-pointer items-start gap-3 rounded-md border border-tintaSoft-100 p-3"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-coral" checked={form[event.key]} onChange={(change) => setForm({ ...form, [event.key]: change.target.checked })} /><span className="min-w-0"><span className="block text-sm font-semibold">{event.label}</span><span className="mt-1 block text-xs text-cinza">{event.hint}</span></span></label>)}</fieldset>
      {error && <p role="alert" className="rounded-md bg-coral-50 p-3 text-sm text-coral-800">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Salvar preferências</button></div>
    </form>
  </AdminDialog>;
}
