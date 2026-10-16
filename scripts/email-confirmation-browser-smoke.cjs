const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3018";
const now = new Date().toISOString();
const user = {
  id: "customer-1", name: "Cliente de confirmação", email: "cliente@example.com", role: "User",
  userType: 1, isActive: true, emailConfirmed: false, createdAt: now, lastLoginAt: now,
  planSlug: null, subscriptionStatus: null, isPaidPlan: false, isTrialActive: false,
  trialEndsAt: null, totalActivitiesGenerated: 0, lastActivityGeneratedAt: null,
  phone: null, cpf: null, address: null, trialStartedAt: null, trialPdfsGenerated: 0,
};

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "mock-admin");
    localStorage.setItem("fp_admin_refresh", "mock-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin", name: "Admin", email: "admin@example.com", role: "Admin", userType: 1 }));
  });
  let confirmed = false;
  let failNext = false;
  let releaseDelayed;
  let delayNext = false;
  let reads = 0;
  const unexpected = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) {
      if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
      return route.abort();
    }
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/admin/users" || url.pathname === "/api/admin/users/customer-1") {
      reads++;
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, headers, json: { error: { message: "Falha temporária" } } });
      }
      const current = { ...user, emailConfirmed: confirmed, isTrialActive: confirmed };
      const body = url.pathname === "/api/admin/users"
        ? { items: [current], page: 1, pageSize: 20, totalCount: 1, totalPages: 1 }
        : { user: current, currentSubscription: null, payments: [], totalActivitiesGenerated: 0, activitiesByType: [], classrooms: [], recentActivities: [] };
      if (delayNext) {
        delayNext = false;
        await new Promise((resolve) => { releaseDelayed = resolve; });
      }
      return route.fulfill({ status: 200, headers, json: body });
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, headers, json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  const badge = (label) => page.locator("main").getByText(label, { exact: true }).filter({ visible: true });
  async function update(event = "focus") {
    await page.clock.fastForward(1000);
    await page.evaluate((name) => (name === "focus" ? window : document).dispatchEvent(new Event(name)), event);
  }
  let checks = 0;
  async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
  try {
    await check("Detalhe pendente é atualizado ao voltar à aba e remove bloqueio visual", async () => {
      await page.goto(base + "/clientes/customer-1");
      await badge("E-mail não confirmado").waitFor();
      await page.getByRole("button", { name: "Reenviar confirmação", exact: true }).waitFor();
      confirmed = true;
      await update();
      await badge("E-mail confirmado").waitFor();
      assert.equal(await badge("E-mail não confirmado").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Reenviar confirmação", exact: true }).count(), 0);
    });
    await check("Recarregar a página preserva confirmação retornada pela API", async () => {
      await page.reload();
      await badge("E-mail confirmado").waitFor();
    });
    await check("Atualização automática mantém modal e texto que está sendo editado", async () => {
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("input").first().fill("Nome em edição");
      const before = reads;
      const response = page.waitForResponse((r) => r.url().endsWith("/api/admin/users/customer-1"));
      await update();
      await response;
      assert(reads > before);
      assert.equal(await dialog.locator("input").first().inputValue(), "Nome em edição");
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    });
    await check("Falha temporária de consulta não apaga confirmação já carregada", async () => {
      failNext = true;
      const response = page.waitForResponse((r) => r.status() === 503);
      await update();
      await response;
      await badge("E-mail confirmado").waitFor();
      assert.equal(await badge("E-mail não confirmado").count(), 0);
    });
    await check("Detalhe permite atualizar explicitamente sem recarregar navegador", async () => {
      confirmed = false;
      await page.getByRole("button", { name: "Atualizar", exact: true }).click();
      await badge("E-mail não confirmado").waitFor();
      confirmed = true;
      await page.getByRole("button", { name: "Atualizar", exact: true }).click();
      await badge("E-mail confirmado").waitFor();
    });
    await check("Lista desktop exibe estado confirmado e acompanha reconfirmação", async () => {
      await page.goto(base + "/clientes");
      await badge("E-mail confirmado").waitFor();
      confirmed = false;
      await update("visibilitychange");
      await badge("E-mail não confirmado").waitFor();
      confirmed = true;
      await update();
      await badge("E-mail confirmado").waitFor();
    });
    await check("Lista mobile atualiza periodicamente e cabe na tela", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await badge("E-mail confirmado").waitFor();
      confirmed = false;
      await page.clock.fastForward(31_000);
      await badge("E-mail não confirmado").waitFor();
      confirmed = true;
      await update();
      await badge("E-mail confirmado").waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    await check("Resposta antiga pendente não sobrescreve confirmação mais recente", async () => {
      confirmed = false;
      delayNext = true;
      const pendingRequest = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/admin/users");
      await update();
      await pendingRequest;
      while (!releaseDelayed) await new Promise((resolve) => setTimeout(resolve, 5));
      confirmed = true;
      const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/admin/users");
      await page.getByRole("button", { name: "Recarregar", exact: true }).click();
      await response;
      const oldResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/admin/users");
      releaseDelayed();
      await oldResponse;
      await badge("E-mail confirmado").waitFor();
      assert.equal(await badge("E-mail não confirmado").count(), 0);
    });
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, reads, pageErrors: errors, unexpectedApiCalls: unexpected }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
