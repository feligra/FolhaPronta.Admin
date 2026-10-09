import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, CheckCircle2, Clock3, Eye, Loader2, Mail, Monitor, Plus, RefreshCw, Send, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adminApi } from "@/services/api";
import type { AdminEmailBatchResult, AdminEmailDraft, AdminEmailOptions, AdminEmailPreview, AdminSendEmailBody } from "@/types";
import { classNames, formatDateTime } from "@/utils/format";
import { emailErrorMessage, parseEmailRecipients } from "@/utils/email";

function savedRequest(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export default function SendEmailPage() {
  const { user } = useAuth();
  const storageKey = `fp_admin_email_request_${user?.id ?? ""}`;
  const [options, setOptions] = useState<AdminEmailOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [addresses, setAddresses] = useState("");
  const [preview, setPreview] = useState<(AdminEmailPreview & { key: string }) | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(() => savedRequest(storageKey));
  const [attempt, setAttempt] = useState<AdminSendEmailBody | null>(null);
  const [result, setResult] = useState<AdminEmailBatchResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusNotFound, setStatusNotFound] = useState(false);
  const mutation = useRef(false);
  const statusMutation = useRef(false);
  const mounted = useRef(true);
  const optionsVersion = useRef(0);
  const activeId = useRef(requestId);
  activeId.current = requestId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; optionsVersion.current++; }; }, []);

  const loadOptions = useCallback(async () => {
    const version = ++optionsVersion.current;
    setOptionsLoading(true); setOptionsError(null);
    try {
      const data = await adminApi.emails.options();
      if (!data.templates.length || !data.categories.length) throw new Error("Configuração vazia.");
      if (!mounted.current || optionsVersion.current !== version) return;
      setOptions(data);
      setTemplateId((current) => data.templates.some((item) => item.id === current) ? current : data.templates[0].id);
      setCategory((current) => data.categories.some((item) => item.id === current) ? current : data.categories.find((item) => item.id === "notice")?.id ?? data.categories[0].id);
    } catch (reason) {
      if (mounted.current && optionsVersion.current === version) setOptionsError(emailErrorMessage(reason, "Não foi possível carregar os modelos de e-mail."));
    } finally { if (mounted.current && optionsVersion.current === version) setOptionsLoading(false); }
  }, []);
  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const parsed = useMemo(() => parseEmailRecipients(addresses), [addresses]);
  const draft = useMemo<AdminEmailDraft>(() => ({ templateId, category, subject: subject.trim(), body: body.trim() }), [templateId, category, subject, body]);
  const draftKey = JSON.stringify(draft);
  const hasContent = !!draft.subject && !!draft.body && !!templateId && !!category;
  const contentValid = !!options && hasContent && !/[\r\n]/.test(draft.subject)
    && draft.subject.length <= options.maxSubjectLength && draft.body.length <= options.maxBodyLength;
  const currentPreview = preview?.key === draftKey ? preview : null;
  const locked = busy || !!requestId;

  useEffect(() => {
    setPreviewError(null);
    if (!contentValid) { setPreview(null); return; }
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await adminApi.emails.preview(draft, controller.signal);
        if (!cancelled) setPreview({ ...data, key: draftKey });
      } catch (reason) {
        if (!cancelled) setPreviewError(emailErrorMessage(reason, "Não foi possível atualizar a prévia. Tente novamente."));
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [draft, draftKey, contentValid, previewVersion]);

  const refreshStatus = useCallback(async () => {
    const id = activeId.current;
    if (!id || statusMutation.current) return;
    statusMutation.current = true; setStatusLoading(true);
    try {
      const data = await adminApi.emails.status(id);
      if (mounted.current && activeId.current === id) { setResult(data); setStatusError(null); setStatusNotFound(false); setError(null); }
    } catch (reason) {
      if (mounted.current && activeId.current === id) {
        setStatusNotFound((reason as { response?: { status?: number } })?.response?.status === 404);
        setStatusError(emailErrorMessage(reason, "Não foi possível consultar este envio. Consulte novamente antes de enviar outra cópia."));
      }
    } finally {
      statusMutation.current = false;
      if (mounted.current && activeId.current === id) setStatusLoading(false);
    }
  }, []);

  const shouldPoll = !!requestId && !busy && (!result || result.queued > 0 || result.results.some((item) => item.retrying));
  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState !== "hidden") await refreshStatus();
      if (!cancelled) timer = setTimeout(poll, 10000);
    };
    timer = setTimeout(poll, result ? 10000 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shouldPoll, requestId, refreshStatus]);

  const remember = (id: string | null) => {
    activeId.current = id; setRequestId(id);
    try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); } catch { /* The in-memory request remains available. */ }
  };

  const enqueue = async (payload: AdminSendEmailBody) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(null); setStatusError(null);
    setAttempt(payload); remember(payload.requestId);
    try {
      const data = await adminApi.emails.send(payload);
      if (mounted.current) setResult(data);
    } catch (reason) {
      if (!mounted.current) return;
      const status = (reason as { response?: { status?: number } })?.response?.status;
      if (status === 400 || status === 422) { remember(null); setAttempt(null); }
      setError(emailErrorMessage(reason, "A confirmação do envio não chegou. Consulte o andamento ou tente registrar novamente; a mesma solicitação será reutilizada para evitar cópias."));
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.current || locked) return;
    if (!options || !contentValid || !currentPreview) { setError("Preencha o assunto e a mensagem e aguarde a prévia atualizada."); return; }
    if (parsed.invalid.length || !parsed.recipients.length || parsed.recipients.length > options.maxRecipients) { setError("Confira a lista de destinatários antes de enviar."); return; }
    void enqueue({ ...draft, recipients: parsed.recipients, requestId: crypto.randomUUID() });
  };

  const newMessage = () => {
    if (mutation.current) return;
    remember(null); setAttempt(null); setResult(null); setError(null); setStatusError(null);
    setSubject(""); setBody(""); setAddresses(""); setPreview(null); setStatusLoading(false); setStatusNotFound(false);
  };

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-display text-3xl font-bold">Enviar e-mail</h1><p className="mt-1 max-w-2xl text-sm text-cinza">Escolha um modelo, escreva sua mensagem e confira como ela vai chegar.</p></div>
      <Link to="/emails" className="btn-ghost"><Mail size={16} /> Histórico de e-mails</Link>
    </header>

    {optionsError && <div role="alert" className="card space-y-3 text-sm text-coral-800"><p>{optionsError}</p><button type="button" className="btn-ghost" onClick={() => void loadOptions()} disabled={optionsLoading}><RefreshCw size={16} /> Carregar modelos novamente</button></div>}
    {optionsLoading && !options && <p role="status" className="flex items-center gap-2 py-8 text-sm text-cinza"><Loader2 size={18} className="animate-spin" /> Carregando modelos…</p>}
    {options && !options.sendingConfigured && <p className="rounded-xl border border-amarelo/40 bg-amarelo/10 p-4 text-sm">O serviço de e-mail está pausado. As mensagens ficarão na fila e serão enviadas quando o serviço estiver configurado.</p>}

    {requestId && <section aria-label="Andamento do envio" className="card space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">{result && result.sent === result.total ? <CheckCircle2 size={20} className="text-erva" /> : <Clock3 size={20} className="text-turquesa" />}{result ? "Andamento do envio" : "Consultando a solicitação"}</h2>
        <button type="button" className="btn-ghost" onClick={() => void refreshStatus()} disabled={statusLoading || busy}><RefreshCw size={14} className={statusLoading ? "animate-spin" : ""} /> Atualizar envio</button>
      </div>
      {result && <>
        <p className="text-sm text-cinza">Cada destinatário recebe uma mensagem individual. Você pode acompanhar as tentativas no histórico.</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><div className="flex gap-2"><dt>Total:</dt><dd className="font-semibold">{result.total}</dd></div><div className="flex gap-2"><dt>Na fila:</dt><dd className="font-semibold">{result.queued}</dd></div><div className="flex gap-2"><dt>Enviados:</dt><dd className="font-semibold">{result.sent}</dd></div><div className="flex gap-2"><dt>Falhas na tentativa:</dt><dd className="font-semibold">{result.failed}</dd></div></dl>
        <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">{result.results.map((item) => <li key={item.email} className="rounded-md border border-tinta/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-all font-medium">{item.email}</span><span className={classNames("text-xs font-semibold", item.status === "sent" ? "text-erva" : item.retrying || item.status === "queued" ? "text-turquesa" : "text-coral-800")}>{item.status === "sent" ? "Enviado" : item.retrying ? "Nova tentativa agendada" : item.status === "queued" ? "Na fila" : "Falha no envio"}</span></div>
          {item.error && <p className="mt-1 break-words text-xs text-cinza">{item.error}</p>}
          {item.retrying && item.nextAttemptAt && <p className="mt-1 text-xs text-cinza">Próxima tentativa: {formatDateTime(item.nextAttemptAt)}</p>}
        </li>)}</ul>
        <button type="button" className="btn-ghost" onClick={newMessage} disabled={busy}><Plus size={16} /> Escrever outra mensagem</button>
      </>}
      {statusError && <p role="alert" className="rounded-md bg-amarelo/10 p-3 text-sm">{statusError}</p>}
      {!result && attempt && !busy && <button type="button" className="btn-ghost" onClick={() => void enqueue(attempt)}><RefreshCw size={16} /> Tentar registrar novamente</button>}
      {!result && !attempt && statusNotFound && <button type="button" className="btn-ghost" onClick={newMessage}>Voltar à composição</button>}
    </section>}

    {error && <p role="alert" className="flex items-start gap-2 rounded-md bg-coral-50 p-3 text-sm text-coral-800"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></p>}
    {options && <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={locked} className="card min-w-0 space-y-4">
        <legend className="sr-only">Modelo do e-mail</legend>
        <div><h2 className="font-display text-lg font-bold">1. Escolha o modelo</h2><p className="mt-1 text-sm text-cinza">O modelo define o visual. O tipo de mensagem pode ser escolhido separadamente.</p></div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Modelo do e-mail">
          {options.templates.map((template) => <label key={template.id} className={classNames("relative flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border p-3 transition", templateId === template.id ? "border-coral bg-coral-50/50 ring-1 ring-coral" : "border-tinta/15 hover:border-tinta/40", locked && "cursor-default opacity-75")}>
            <div className="flex items-center justify-between gap-2"><span className="h-2 w-12 rounded-full" style={{ backgroundColor: template.accentColor }} aria-hidden="true" /><input type="radio" name="email-template" value={template.id} checked={templateId === template.id} onChange={() => setTemplateId(template.id)} className="h-4 w-4 accent-[#c84638]" /></div>
            <div><span className="block text-sm font-semibold">{template.name}</span><span className="mt-1 block text-xs leading-relaxed text-cinza">{template.description}</span></div>
          </label>)}
        </div>
      </fieldset>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <fieldset disabled={locked} className="card min-w-0 space-y-5">
          <legend className="sr-only">Conteúdo e destinatários</legend>
          <h2 className="font-display text-lg font-bold">2. Escreva sua mensagem</h2>
          <div><label htmlFor="email-category" className="label">Tipo de mensagem</label><select id="email-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>{options.categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div><label htmlFor="email-subject" className="label">Assunto</label><input id="email-subject" className="input" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={options.maxSubjectLength} required placeholder="Ex.: Novidades para suas próximas atividades" /></div>
          <div><label htmlFor="email-body" className="label">Corpo do e-mail</label><textarea id="email-body" className="input min-h-[230px] resize-y leading-relaxed" value={body} onChange={(event) => setBody(event.target.value)} maxLength={options.maxBodyLength} required placeholder="Olá! Escreva aqui a mensagem que você quer enviar…" aria-describedby="email-body-hint" /><div id="email-body-hint" className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-cinza"><span>Use texto e quebras de linha para separar os parágrafos.</span><span>{body.length.toLocaleString("pt-BR")} / {options.maxBodyLength.toLocaleString("pt-BR")}</span></div></div>
          <div><label htmlFor="email-recipients" className="label">E-mails dos destinatários</label><textarea id="email-recipients" className="input min-h-[110px] resize-y" value={addresses} onChange={(event) => setAddresses(event.target.value)} required placeholder={"pessoa@exemplo.com\noutra@exemplo.com"} aria-describedby="email-recipients-hint" aria-invalid={parsed.invalid.length > 0 || parsed.recipients.length > options.maxRecipients} autoCapitalize="none" spellCheck={false} /><p id="email-recipients-hint" className="mt-2 text-xs text-cinza">Separe por linha, vírgula ou ponto e vírgula. Até {options.maxRecipients} destinatários por envio.</p>
            <p className="mt-2 text-sm"><strong>{parsed.recipients.length}</strong> {parsed.recipients.length === 1 ? "destinatário válido" : "destinatários válidos"}{parsed.duplicates > 0 && <span className="text-cinza"> · {parsed.duplicates} {parsed.duplicates === 1 ? "repetido removido" : "repetidos removidos"}</span>}</p>
            {parsed.invalid.length > 0 && <p role="alert" className="mt-2 break-all text-sm text-coral-800">Confira estes endereços: {parsed.invalid.join(", ")}</p>}
            {parsed.recipients.length > options.maxRecipients && <p role="alert" className="mt-2 text-sm text-coral-800">Use no máximo {options.maxRecipients} destinatários neste envio.</p>}
          </div>
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={locked || !contentValid || !currentPreview || !!previewError || parsed.invalid.length > 0 || parsed.recipients.length === 0 || parsed.recipients.length > options.maxRecipients}>{busy ? <Loader2 size={16} className="animate-spin" /> : result ? <Check size={16} /> : <Send size={16} />}{busy ? "Registrando envio…" : result ? "Envio registrado" : `Enviar para ${parsed.recipients.length} ${parsed.recipients.length === 1 ? "destinatário" : "destinatários"}`}</button>
        </fieldset>

        <section className="card min-w-0 space-y-4 self-start xl:sticky xl:top-4" aria-label="Prévia do e-mail">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-display text-lg font-bold"><Eye size={18} /> 3. Confira a prévia</h2><div className="flex gap-1"><button type="button" className={classNames("btn-ghost h-9 px-2", !mobilePreview && "border-coral")} aria-label="Prévia no computador" aria-pressed={!mobilePreview} onClick={() => setMobilePreview(false)}><Monitor size={16} /></button><button type="button" className={classNames("btn-ghost h-9 px-2", mobilePreview && "border-coral")} aria-label="Prévia no celular" aria-pressed={mobilePreview} onClick={() => setMobilePreview(true)}><Smartphone size={16} /></button></div></div>
          {currentPreview && <p className="break-words text-sm text-cinza"><strong>Assunto:</strong> {currentPreview.subject}</p>}
          {previewError ? <div role="alert" className="space-y-3 rounded-md bg-coral-50 p-4 text-sm text-coral-800"><p>{previewError}</p><button type="button" className="btn-ghost" onClick={() => setPreviewVersion((value) => value + 1)}>Atualizar prévia</button></div>
            : currentPreview ? <div className={classNames("mx-auto w-full overflow-hidden rounded-xl border border-tinta/10 bg-white transition-[max-width]", mobilePreview ? "max-w-[375px]" : "max-w-full")}><iframe title="Conteúdo do e-mail" srcDoc={currentPreview.html} sandbox="" referrerPolicy="no-referrer" className="block h-[620px] w-full border-0 bg-white" /></div>
              : <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-tinta/20 p-6 text-center text-sm text-cinza">{hasContent ? <><Loader2 size={24} className="animate-spin" /><p>Atualizando a prévia…</p></> : <><Mail size={32} className="opacity-50" /><p>Preencha o assunto e o corpo para visualizar seu e-mail neste modelo.</p></>}</div>}
          <p className="text-xs leading-relaxed text-cinza">A prévia usa o mesmo modelo do envio. Pequenos detalhes de exibição podem variar entre aplicativos de e-mail.</p>
        </section>
      </div>
    </form>}
  </div>;
}
