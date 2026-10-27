const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3028";
const output = process.env.TEST_OUTPUT_DIR;
const started = "2026-10-16T15:00:00";
const ends = "2026-10-23T15:00:00";
const subscriptionEnd = "2026-10-30T15:00:00";
const initial = {
  id: "customer-1", name: "Cliente de confirmação", email: "cliente@example.com", role: "User",
  userType: 1, isActive: true, emailConfirmed: false, createdAt: started, lastLoginAt: started,
  planSlug: null, subscriptionStatus: null, isPaidPlan: false, isTrialActive: false,
  trialStatus: "WaitingForEmail", trialEndsAt: null, totalActivitiesGenerated: 0, lastActivityGeneratedAt: null,
  phone: null, cpf: null, address: null, trialStartedAt: null, trialPdfsGenerated: 0,
};
const labels = {
  WaitingForEmail: "Teste grátis aguardando confirmação", NotStarted: "Teste grátis não iniciado",
  Active: "Teste grátis ativo", Expired: "Teste grátis encerrado", Subscribed: "Assinatura ativa", Inactive: "Conta desativada",
};
function fixture(status, id = "customer-1") {
  return { ...initial, id, trialStatus: status, isActive: status !== "Inactive", emailConfirmed: status !== "WaitingForEmail",
    isTrialActive: status === "Active", trialStartedAt: ["Active", "Expired"].includes(status) ? started : null,
    trialEndsAt: ["Active", "Expired"].includes(status) ? ends : null, isPaidPlan: status === "Subscribed",
    planSlug: status === "Subscribed" ? "premium" : null, subscriptionStatus: status === "Subscribed" ? "Active" : null,
    subscriptionEndsAt: status === "Subscribed" ? subscriptionEnd : null };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Tokyo" });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "mock-admin");
    localStorage.setItem("fp_admin_refresh", "mock-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin", name: "Admin", email: "admin@example.com", role: "Admin", userType: 1 }));
  });
  let record = { ...initial };
  let allStatuses = false;
  let postMode = "success";
  let releasePost;
  let delayRead = false;
  let releaseRead;
  let failRead = false;
  const writes = [];
  const unexpected = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) {
      if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
      return route.abort();
    }
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/admin/users/customer-1/confirm-email" && request.method() === "POST") {
      writes.push(request.postDataJSON());
      if (postMode === "delay") await new Promise((resolve) => { releasePost = resolve; });
      if (postMode === "error") return route.fulfill({ status: 503, headers, json: { error: { message: "Falha temporária ao confirmar." } } });
      if (postMode === "changed-email") {
        record.email = "novo@example.com";
        return route.fulfill({ status: 409, headers, json: { error: { message: "O e-mail foi alterado. Confira o endereço atual antes de confirmar." } } });
      }
      const alreadyConfirmed = postMode === "already";
      record = { ...record, emailConfirmed: true, isTrialActive: true, trialStatus: "Active", trialStartedAt: started, trialEndsAt: ends };
      if (postMode === "failed-refresh") failRead = true;
      return route.fulfill({ status: 200, headers, json: { emailConfirmed: true, isTrialActive: true, trialStartedAt: started, trialEndsAt: ends, alreadyConfirmed } });
    }
    if (["/api/admin/users", "/api/admin/users/customer-1"].includes(url.pathname) && request.method() === "GET") {
      if (failRead) {
        failRead = false;
        return route.fulfill({ status: 503, headers, json: { error: { message: "Falha temporária ao consultar." } } });
      }
      const current = { ...record };
      const items = allStatuses ? Object.keys(labels).map((status, index) => fixture(status, `customer-${index + 1}`)) : [current];
      const body = url.pathname === "/api/admin/users"
        ? { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 }
        : { user: current, currentSubscription: current.trialStatus === "Subscribed" ? {
          id: 'current-paid', planId: 'premium', planName: 'Premium', planSlug: 'premium', status: 'Active',
          hasAccess: true, provider: 'Manual', monthlyAmount: 29.9, currentPeriodStart: started,
          currentPeriodEnd: subscriptionEnd, canceledAt: null, createdAt: started,
        } : null, payments: [], totalActivitiesGenerated: 0, activitiesByType: [], classrooms: [], recentActivities: [] };
      if (delayRead) { delayRead = false; await new Promise((resolve) => { releaseRead = resolve; }); }
      return route.fulfill({ status: 200, headers, json: body });
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, headers, json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-20T15:00:00Z") });
  const text = (label) => page.locator("main").getByText(label, { exact: true }).filter({ visible: true });
  const confirm = () => page.getByRole("button", { name: "Marcar e-mail como confirmado", exact: true });
  const details = async () => { await page.goto(base + "/clientes/customer-1"); await text(record.emailConfirmed ? "E-mail confirmado" : "E-mail não confirmado").waitFor(); };
  const waitHook = async (get) => { for (let i = 0; i < 200 && !get(); i++) await new Promise((resolve) => setTimeout(resolve, 5)); assert(get()); };
  let checks = 0;
  async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
  try {
    await check("Confirmação manual persiste endereço atual antes de liberar visual e teste", async () => {
      await details();
      await text(labels.WaitingForEmail).first().waitFor();
      postMode = "delay";
      await confirm().click();
      await waitHook(() => releasePost);
      assert.deepEqual(writes.at(-1), { email: "cliente@example.com" });
      assert.equal(await text("E-mail confirmado").count(), 0);
      assert(await page.getByRole("button", { name: "Salvando confirmação…", exact: true }).isDisabled());
      releasePost();
      await text("E-mail confirmado").waitFor();
      await text(labels.Active).first().waitFor();
      await text("Disponível até 23/10/2026, 12:00:00 (Brasília).").first().waitFor();
      assert.equal(await confirm().count(), 0);
      await text("E-mail marcado como confirmado.").waitFor();
    });
    await check("Confirmação e teste persistem após recarga e na listagem", async () => {
      await page.reload(); await text("E-mail confirmado").waitFor(); await text(labels.Active).first().waitFor();
      await page.goto(base + "/clientes"); await text("E-mail confirmado").waitFor(); await text(labels.Active).waitFor();
    });
    await check("Falha no POST mantém cadastro pendente e permite tentar novamente", async () => {
      record = { ...initial }; postMode = "error"; await details(); await confirm().click();
      await text("Falha temporária ao confirmar.").waitFor();
      await text("E-mail não confirmado").waitFor(); assert(await confirm().isEnabled());
      postMode = "success"; await confirm().click(); await text("E-mail confirmado").waitFor();
    });
    await check("Troca concorrente de e-mail recarrega endereço sem confirmar o novo automaticamente", async () => {
      record = { ...initial }; postMode = "changed-email"; await details(); await confirm().click();
      await text("O e-mail foi alterado. Confira o endereço atual antes de confirmar.").waitFor();
      await text("novo@example.com").first().waitFor(); await text("E-mail não confirmado").waitFor();
      postMode = "success"; await confirm().click(); await text("E-mail confirmado").waitFor();
      assert.deepEqual(writes.at(-1), { email: "novo@example.com" });
    });
    await check("Confirmação já salva no servidor reconcilia detalhe desatualizado", async () => {
      record = { ...initial }; postMode = "already"; await details(); await confirm().click();
      await text("O e-mail já estava confirmado no cadastro.").waitFor(); await text("E-mail confirmado").waitFor();
    });
    await check("Falha na consulta após salvar preserva aviso e permite recuperar estado real", async () => {
      record = { ...initial }; postMode = "failed-refresh"; await details(); await confirm().click();
      await text("E-mail marcado como confirmado.").waitFor(); await text("Não foi possível carregar este cliente.").waitFor();
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click(); await text("E-mail confirmado").waitFor();
    });
    await check("Consulta antiga não desfaz confirmação manual", async () => {
      record = { ...initial }; postMode = "success"; await details(); delayRead = true;
      await page.clock.fastForward(1000); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await waitHook(() => releaseRead); await confirm().click(); await text("E-mail confirmado").waitFor();
      const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/admin/users/customer-1");
      releaseRead(); await response; await text("E-mail confirmado").waitFor();
      assert.equal(await text("E-mail não confirmado").count(), 0);
    });
    await check("Conta desativada exige ativação antes da confirmação manual", async () => {
      record = { ...initial, isActive: false, trialStatus: "Inactive" }; await details();
      await text("Ative a conta antes de confirmar o e-mail.").waitFor(); assert(await confirm().isDisabled());
    });
    await check("Os seis estados de teste grátis aparecem no detalhe", async () => {
      for (const status of Object.keys(labels)) { record = fixture(status); await details(); await text(labels[status]).first().waitFor(); }
    });
    await check("Lista desktop distingue os seis estados sem depender do relógio local", async () => {
      allStatuses = true; await page.goto(base + "/clientes");
      for (const label of Object.values(labels)) await text(label).waitFor();
      if (output) { await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, "lista-desktop.png"), fullPage: true }); }
    });
    await check("Lista e confirmação manual cabem em telas mobile de 390 e 320 pixels", async () => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 }); await page.goto(base + "/clientes");
        for (const label of Object.values(labels)) await text(label).waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (output && width === 390) await page.screenshot({ path: path.join(output, "lista-mobile.png"), fullPage: true });
        record = { ...initial }; await details(); await confirm().waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (output && width === 390) await page.screenshot({ path: path.join(output, "detalhe-mobile.png"), fullPage: true });
      }
      record = fixture("Active"); await details();
      if (output) await page.screenshot({ path: path.join(output, "detalhe-ativo-mobile.png"), fullPage: true });
    });
    await check("O teste vence na tela aberta mesmo se a API continuar devolvendo Active", async () => {
      allStatuses = false;
      const boundary = await page.evaluate(() => Date.now() + 3000);
      record = { ...fixture("Active"), trialEndsAt: new Date(boundary).toISOString() };
      await details(); await text(labels.Active).first().waitFor();
      await page.clock.fastForward(3000);
      await text(labels.Expired).first().waitFor();
      assert.equal(await text(labels.Active).count(), 0);
      await text("Conta ativa").waitFor();
      await page.goto(base + "/clientes"); await text(labels.Expired).waitFor();
      assert.equal(await text(labels.Active).count(), 0);
      await text("Contas ativas (página)").waitFor();
      if (output) await page.screenshot({ path: path.join(output, "lista-api-antiga-trial-vencido.png"), fullPage: true });
    });
    await check("API antiga sem trialStatus não mostra trial vencido como ativo", async () => {
      record = { ...fixture("Active"), trialStatus: undefined, trialEndsAt: "2026-10-19T15:00:00", subscriptionStatus: "Trialing" };
      await details(); await text(labels.Expired).first().waitFor();
      await page.goto(base + "/clientes"); await text(labels.Expired).waitFor();
      await text("Expirada").waitFor();
      assert.equal(await text(labels.Active).count(), 0);
      assert.equal(await text("Trial").count(), 0);
    });
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    const report = { checks, writes: writes.length, pageErrors: errors, unexpectedApiCalls: unexpected };
    if (output) await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
