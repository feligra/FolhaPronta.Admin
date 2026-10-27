const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3032";
const output = path.resolve(process.env.TEST_OUTPUT_DIR || "dist/verification/subscriptions");
const now = new Date().toISOString();
const end = new Date(Date.now() + 30 * 86400000).toISOString();
// The API owns current-subscription selection before filtering and pagination.
// Its integration tests cover historical Active + PendingPayment duplicates.
const currentSubscriptions = Array.from({ length: 23 }, (_, index) => ({
  id: index === 0 ? "sub-current-active" : `sub-${index + 1}`,
  userId: `customer-${index + 1}`,
  userName: index === 0 ? "Cliente com assinatura atual" : `Cliente ${String(index + 1).padStart(2, "0")}`,
  userEmail: `cliente${index + 1}@example.com`,
  planId: "plan-1", planName: "Plano Mensal", planSlug: "mensal",
  monthlyAmount: 29.9, billingFrequencyMonths: 1,
  status: index === 1 ? "PendingPayment" : "Active",
  currentPeriodStart: index === 1 ? null : now,
  currentPeriodEnd: index === 1 ? null : end,
  canceledAt: null, hasAccess: index !== 1, createdAt: now,
}));

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "simulated-admin-token");
    localStorage.setItem("fp_admin_refresh", "simulated-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin-1", name: "Administrador", email: "admin@example.com", role: "Admin", userType: 1 }));
  });
  const queries = [];
  const mutations = [];
  const unexpected = [];
  let releaseSlow;
  let holdSlow = false;
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/admin/subscriptions" && request.method() === "GET") {
      const query = Object.fromEntries(url.searchParams);
      queries.push(query);
      if (holdSlow && query.search === "cliente1@example.com") {
        await new Promise((resolve) => { releaseSlow = resolve; });
      }
      const search = (query.search || "").toLowerCase();
      const selected = currentSubscriptions.filter((item) => (!query.status || item.status === query.status)
        && (!search || item.userName.toLowerCase().includes(search) || item.userEmail.toLowerCase().includes(search)));
      const page = Number(query.page || 1);
      const pageSize = Number(query.pageSize || 20);
      return route.fulfill({ headers, json: { items: selected.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalCount: selected.length, totalPages: Math.ceil(selected.length / pageSize) } });
    }
    if (request.method() === "POST" && /^\/api\/admin\/subscriptions\/[^/]+\/(extend|cancel)$/.test(url.pathname)) {
      mutations.push({ path: url.pathname, body: request.postDataJSON() });
      return route.fulfill({ headers, json: {} });
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, headers, json: { error: { message: "API mock não configurada" } } });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/api/")) return route.fallback();
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  async function check(name, action) { await action(); results.push({ name, passed: true }); process.stdout.write(`PASS ${name}\n`); }
  async function open(suffix = "") {
    await page.goto(`${base}/assinaturas${suffix}`);
    await page.getByRole("heading", { name: "Assinaturas", exact: true }).waitFor();
    await page.getByRole("button", { name: "Página anterior" }).waitFor();
  }
  async function waitForList(action, predicate) {
    const response = page.waitForResponse((reply) => new URL(reply.url()).pathname === "/api/admin/subscriptions"
      && predicate(new URL(reply.url()).searchParams));
    await action(); await response;
    await page.getByRole("button", { name: "Recarregar" }).locator("svg.animate-spin").waitFor({ state: "hidden" });
  }
  function visibleClients() { return page.locator('main a[href^="/clientes/"]:visible'); }

  try {
    await check("Lista conta clientes e exibe uma assinatura atual por cliente", async () => {
      await open();
      await page.getByText("Uma assinatura atual por cliente.", { exact: false }).waitFor();
      assert.equal(await visibleClients().count(), 20);
      assert.equal(await page.locator('main a[href="/clientes/customer-1"]:visible').count(), 1);
      assert.equal(await page.locator("tbody tr").filter({ hasText: "cliente1@example.com" }).getByText("Ativa", { exact: true }).count(), 1);
      assert(await page.getByText("1–20 de 23", { exact: true }).isVisible());
      assert(await page.getByRole("button", { name: "Página anterior" }).isDisabled());
    });
    await check("Paginação usa total do servidor e preserva clientes distintos", async () => {
      await waitForList(() => page.getByRole("button", { name: "Próxima página" }).click(), (q) => q.get("page") === "2");
      assert.equal(await visibleClients().count(), 3);
      assert(await page.getByText("21–23 de 23", { exact: true }).isVisible());
      assert(await page.getByRole("button", { name: "Próxima página" }).isDisabled());
      assert.equal(new URL(page.url()).searchParams.get("page"), "2");
    });
    await check("Filtro pendente volta à primeira página e não exibe histórico de cliente ativo", async () => {
      await waitForList(() => page.getByLabel("Status da assinatura atual").selectOption("PendingPayment"), (q) => q.get("status") === "PendingPayment" && q.get("page") === "1");
      assert.equal(await visibleClients().count(), 1);
      assert.equal(await page.locator('main a[href="/clientes/customer-1"]:visible').count(), 0);
      assert.equal(await page.locator('main a[href="/clientes/customer-2"]:visible').count(), 1);
      assert(await page.getByText("1–1 de 1", { exact: true }).isVisible());
      assert.equal(await page.getByRole("button", { name: "Estender", exact: true }).count(), 0);
    });
    await check("Busca respeita filtro da assinatura atual e apresenta resultado vazio", async () => {
      await waitForList(() => page.getByLabel("Buscar cliente por nome ou e-mail").fill("cliente1@example.com"), (q) => q.get("search") === "cliente1@example.com");
      assert.equal(await visibleClients().count(), 0);
      assert(await page.getByText("Nenhuma assinatura encontrada.", { exact: true }).first().isVisible());
      await waitForList(() => page.getByLabel("Status da assinatura atual").selectOption(""), (q) => !q.get("status") && q.get("search") === "cliente1@example.com");
      assert.equal(await visibleClients().count(), 1);
      assert(await page.getByText("1–1 de 1", { exact: true }).isVisible());
    });
    await check("Página antiga fora do limite volta à última página válida e refaz consulta", async () => {
      await open("?page=99");
      await page.waitForURL("**/assinaturas?page=2");
      await page.getByText("21–23 de 23", { exact: true }).waitFor();
      assert.equal(await visibleClients().count(), 3);
      assert(queries.some((query) => query.page === "99"));
      assert.equal(queries.at(-1).page, "2");
    });
    await check("Página inválida sem resultados volta à primeira página sem loop", async () => {
      await open("?page=99&search=inexistente");
      await page.waitForURL((url) => url.searchParams.get("page") === "1");
      await page.getByText("Nenhum resultado", { exact: true }).waitFor();
      assert.equal(await visibleClients().count(), 0);
      assert.equal(new URL(page.url()).searchParams.get("search"), "inexistente");
      assert(await page.getByRole("button", { name: "Página anterior" }).isDisabled());
      assert(await page.getByRole("button", { name: "Próxima página" }).isDisabled());
    });
    await check("Resposta antiga da busca não restaura assinatura de outro cliente", async () => {
      await open();
      holdSlow = true;
      const requested = page.waitForRequest((request) => new URL(request.url()).searchParams.get("search") === "cliente1@example.com");
      const response = page.waitForResponse((reply) => new URL(reply.url()).searchParams.get("search") === "cliente1@example.com");
      await page.getByLabel("Buscar cliente por nome ou e-mail").fill("cliente1@example.com");
      await requested;
      await waitForList(() => page.getByLabel("Buscar cliente por nome ou e-mail").fill("cliente2@example.com"), (q) => q.get("search") === "cliente2@example.com");
      assert.equal(await page.locator('main a[href="/clientes/customer-2"]:visible').count(), 1);
      releaseSlow(); await response;
      await page.waitForTimeout(100);
      assert.equal(await page.locator('main a[href="/clientes/customer-1"]:visible').count(), 0);
      holdSlow = false;
    });
    await check("Celular exibe um cartão e ações operam na assinatura atual", async () => {
      await page.setViewportSize({ width: 390, height: 740 });
      await open("?search=cliente1%40example.com");
      assert.equal(await visibleClients().count(), 1);
      await page.getByRole("button", { name: "Estender", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Estender por 30 dias", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(mutations.at(-1).path, "/api/admin/subscriptions/sub-current-active/extend");
      assert.equal(mutations.at(-1).body.days, 30);
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(mutations.at(-1).path, "/api/admin/subscriptions/sub-current-active/cancel");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, "subscriptions-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 850 });
      await page.screenshot({ path: path.join(output, "subscriptions-desktop.png"), fullPage: true });
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    fs.writeFileSync(path.join(output, "subscriptions-browser-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), checks: results, mockedApi: true, queries: queries.length, mutations: mutations.length }, null, 2));
    process.stdout.write(`PASS ${results.length}/${results.length} cenários; API simulada, sem alterações reais.\n`);
  } finally { releaseSlow?.(); await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
