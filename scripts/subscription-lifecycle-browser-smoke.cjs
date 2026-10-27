/* Local lifecycle/sorting regression: every API request and mutation is mocked. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3032";
const output = path.resolve(process.env.TEST_OUTPUT_DIR || "dist/verification/subscription-lifecycle");
const day = 86400000;
const instant = Date.now();
const at = days => new Date(instant + days * day).toISOString();
const sortFields = ["userName", "userEmail", "planName", "provider", "monthlyAmount", "status", "currentPeriodEnd", "createdAt"];
const headers = { userName: "Cliente", planName: "Plano", provider: "Provedor", monthlyAmount: "Valor", status: "Status", currentPeriodEnd: "Vigência", createdAt: "Criada" };

function subscription(id, overrides = {}) {
  return {
    id, userId: `customer-${id}`, userName: `Cliente ${id}`, userEmail: `${id}@example.invalid`,
    planId: "plan-paid", planName: "Plano Mensal", planSlug: "mensal", provider: "Manual",
    monthlyAmount: 29.9, billingFrequencyMonths: 1, hasProviderAgreement: false,
    status: "Active", rawStatus: "Active", currentPeriodStart: at(-10), currentPeriodEnd: at(20),
    canceledAt: null, hasAccess: true, createdAt: at(-60), trialEndsAt: null,
    canCancel: true, canExtend: true, canCancelRenewal: false,
    ...overrides,
  };
}

const fixtures = [
  subscription("api-expired", { userName: "API vigência vencida", status: "Expired", rawStatus: "Active", currentPeriodEnd: at(-4), hasAccess: false, canCancel: false, canExtend: false }),
  // Old payloads omit all newly introduced lifecycle capabilities/rawStatus.
  subscription("legacy-active-expired", { userName: "Legado ativa vencida", status: "Active", rawStatus: undefined, currentPeriodEnd: at(-3), hasAccess: false, canCancel: undefined, canExtend: undefined, canCancelRenewal: undefined }),
  subscription("legacy-trial-expired", { userName: "Legado trial vencido", status: "Trialing", rawStatus: undefined, planId: "plan-trial", planName: "Plano Trial", planSlug: "trial", monthlyAmount: 0, currentPeriodEnd: at(15), trialEndsAt: at(-2), hasAccess: false, canCancel: undefined, canExtend: undefined, canCancelRenewal: undefined }),
  subscription("active-current", { userName: "Ativa vigente", provider: "Stripe", hasProviderAgreement: true, stripeSubscriptionId: "sub_local_active", currentPeriodEnd: at(30) }),
  subscription("cancelled-current", { userName: "Cancelada ainda vigente", status: "Cancelled", rawStatus: "Cancelled", canceledAt: at(-1), currentPeriodEnd: at(12), canCancel: false, canExtend: true, hasAccess: true }),
  subscription("expired-remote", { userName: "Expirada com recorrência remota", status: "Expired", rawStatus: "Active", provider: "Stripe", hasProviderAgreement: true, stripeSubscriptionId: "sub_local_remote", currentPeriodEnd: at(-5), hasAccess: false, canCancel: true, canExtend: false, canCancelRenewal: true }),
  subscription("expired-no-actions", { userName: "Expirada sem recorrência", status: "Expired", rawStatus: "Expired", currentPeriodEnd: at(-6), hasAccess: false, canCancel: false, canExtend: false, canCancelRenewal: false }),
  subscription("api-trial-expired", { userName: "API trial vencido", status: "Expired", rawStatus: "Trialing", planId: "plan-trial", planName: "Plano Trial", planSlug: "trial", monthlyAmount: 0, currentPeriodEnd: null, trialEndsAt: at(-8), hasAccess: false, canCancel: false, canExtend: false, canCancelRenewal: false }),
  subscription("expiry-boundary", { userName: "Vigência encerra com modal aberto", provider: "Stripe", hasProviderAgreement: true, stripeSubscriptionId: "sub_local_boundary", currentPeriodEnd: new Date(instant + 120000).toISOString(), canCancelRenewal: true }),
  ...Array.from({ length: 38 }, (_, index) => subscription(`ordered-${String(index).padStart(2, "0")}`, {
    userName: `Cliente Ordenação ${String(37 - index).padStart(2, "0")}`,
    userEmail: `ordenacao-${String((index * 13) % 38).padStart(2, "0")}@example.invalid`,
    planName: ["Plano Alfa", "Plano Médio", "Plano Zeta"][index % 3],
    provider: ["Stripe", "MercadoPago", "Manual"][index % 3],
    monthlyAmount: 12 + ((index * 7) % 38),
    status: index < 27 ? "Expired" : "Active", rawStatus: index < 27 ? "Active" : "Active",
    currentPeriodEnd: at(index < 27 ? -1 - index : 2 + index),
    createdAt: at(-3 - ((index * 11) % 38)),
    hasAccess: index >= 27, canCancel: index >= 27, canExtend: index >= 27,
  })),
];

function effectiveStatus(item) {
  if (item.status === "Trialing" && item.trialEndsAt && Date.parse(item.trialEndsAt) <= instant) return "Expired";
  if (["Active", "Trialing", "Cancelled"].includes(item.status) && item.currentPeriodEnd && Date.parse(item.currentPeriodEnd) <= instant) return "Expired";
  return item.status;
}
function ordered(query, rows = fixtures) {
  const search = (query.search || "").toLowerCase();
  const selected = rows.filter(item => (!query.status || effectiveStatus(item) === query.status)
    && (!search || item.userName.toLowerCase().includes(search) || item.userEmail.toLowerCase().includes(search)));
  const field = sortFields.includes(query.sortBy) ? query.sortBy : "createdAt";
  const multiplier = query.sortDirection === "asc" ? 1 : -1;
  const value = item => field === "status" ? effectiveStatus(item) : item[field];
  selected.sort((a, b) => {
    const left = value(a), right = value(b);
    // Stable identities break ties; null dates remain valid display values.
    if (left == null || right == null) return left == null && right == null ? a.id.localeCompare(b.id) : left == null ? 1 : -1;
    const primary = typeof left === "number" ? left - right : String(left).localeCompare(String(right), "pt-BR");
    return primary * multiplier || a.id.localeCompare(b.id);
  });
  return selected;
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "simulated-admin-token");
    localStorage.setItem("fp_admin_refresh", "simulated-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin-local", name: "Admin Local", email: "admin@example.invalid", role: "Admin", userType: 1 }));
  });
  const queries = [], mutations = [], unexpected = [], errors = [], results = [];
  const rows = fixtures.map(item => ({ ...item }));
  let releaseSlow, holdSort = false;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
    const json = (body, status = 200) => route.fulfill({ status, headers, json: body });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/admin/subscriptions" && request.method() === "GET") {
      const query = Object.fromEntries(url.searchParams), selected = ordered(query, rows);
      const page = Number(query.page || 1), pageSize = Number(query.pageSize || 20);
      const items = selected.slice((page - 1) * pageSize, page * pageSize);
      queries.push({ ...query, returnedIds: items.map(item => item.id), totalCount: selected.length });
      if (holdSort && query.sortBy === "userName" && query.sortDirection === "asc") await new Promise(resolve => { releaseSlow = resolve; });
      return json({ items, page, pageSize, totalCount: selected.length, totalPages: Math.ceil(selected.length / pageSize) });
    }
    const mutation = url.pathname.match(/^\/api\/admin\/subscriptions\/([^/]+)\/(cancel|extend)$/);
    if (request.method() === "POST" && mutation) {
      mutations.push({ path: url.pathname, body: request.postDataJSON() });
      const item = rows.find(row => row.id === mutation[1]);
      if (item && mutation[2] === "cancel") Object.assign(item, { canCancel: false, canCancelRenewal: false, hasProviderAgreement: false });
      return json({});
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return json({ error: { message: "Unexpected local fixture endpoint" } }, 404);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => errors.push(error.message));
  const report = () => fs.writeFileSync(path.join(output, "subscription-lifecycle-browser-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), mockedApi: true, datasetSize: rows.length, checks: results, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, errors, unexpected, queries, mutations }, null, 2));
  async function check(name, action) {
    try { await action(); results.push({ name, passed: true }); process.stdout.write(`PASS ${name}\n`); }
    catch (error) { const screenshot = `failure-${results.length + 1}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }).catch(() => {}); results.push({ name, passed: false, error: error.message, stack: error.stack, screenshot }); process.stdout.write(`FAIL ${name}: ${error.message}\n`); }
    finally { report(); }
  }
  async function settled() { await page.getByRole("button", { name: "Página anterior" }).waitFor(); await page.getByRole("button", { name: "Recarregar" }).locator("svg.animate-spin").waitFor({ state: "hidden" }); }
  async function open(suffix = "") { await page.goto(`${base}/assinaturas${suffix}`); await page.getByRole("heading", { name: "Assinaturas", exact: true }).waitFor(); await settled(); }
  async function waitForList(action, predicate) {
    const response = page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/admin/subscriptions" && predicate(new URL(reply.url()).searchParams));
    await action(); await response; await settled();
  }
  async function visibleIds() { return page.locator('main a[href^="/clientes/"]:visible').evaluateAll(nodes => nodes.map(node => node.getAttribute("href").replace("/clientes/customer-", ""))); }
  async function assertServerOrder(query) {
    const expected = ordered(query, rows).slice((Number(query.page || 1) - 1) * 20, Number(query.page || 1) * 20).map(item => item.id);
    await page.waitForFunction(ids => {
      const actual = [...document.querySelectorAll('main a[href^="/clientes/"]')].filter(node => node.getClientRects().length).map(node => node.getAttribute("href").replace("/clientes/customer-", ""));
      return JSON.stringify(actual) === JSON.stringify(ids);
    }, expected);
    assert.deepEqual(await visibleIds(), expected);
  }
  function record(id) {
    const client = page.locator(`main a[href="/clientes/customer-${id}"]:visible`);
    return page.viewportSize().width >= 1024 ? client.locator("xpath=ancestor::tr") : client.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," card ")][1]');
  }
  async function openOne(id) { await open(`?search=${encodeURIComponent(`${id}@example.invalid`)}`); assert.equal(await visibleIds().then(ids => ids.length), 1); return record(id); }

  try {
    for (const width of [1280, 390]) await check(`Vigência efetiva e ações seguras em ${width}px`, async () => {
      await page.setViewportSize({ width, height: 850 });
      for (const id of ["api-expired", "legacy-active-expired", "legacy-trial-expired", "api-trial-expired"]) {
        const card = await openOne(id); await card.getByText("Expirada", { exact: true }).waitFor(); assert.equal(await card.getByText("Ativa", { exact: true }).count(), 0); assert.equal(await card.getByText("Trial", { exact: true }).count(), 0);
      }
      let card = await openOne("active-current"); await card.getByText("Ativa", { exact: true }).waitFor(); assert.equal(await card.getByRole("button", { name: /Estender/ }).count(), 1); assert.equal(await card.getByRole("button", { name: /Cancelar/ }).count(), 1);
      card = await openOne("cancelled-current"); await card.getByText("Cancelada", { exact: true }).waitFor(); assert.equal(await card.getByRole("button", { name: /Estender/ }).count(), 1); assert.equal(await card.getByRole("button", { name: /Cancelar|Encerrar recorrência/ }).count(), 0);
      card = await openOne("expired-no-actions"); await card.getByText("Sem ações disponíveis", { exact: true }).waitFor(); assert.equal(await card.getByRole("button").count(), 0, "Unavailable actions must be absent rather than misleading disabled controls");
      card = await openOne("expired-remote"); await card.getByRole("button", { name: /Encerrar recorrência/ }).waitFor(); assert.equal(await card.getByRole("button", { name: /Estender/ }).count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Page overflow");
      await page.screenshot({ path: path.join(output, `lifecycle-${width}.png`), fullPage: true });
    });

    await check("Recorrência remota vencida usa cancelamento correto sem criar nova assinatura", async () => {
      await page.setViewportSize({ width: 390, height: 850 }); const card = await openOne("expired-remote");
      await card.getByRole("button", { name: /Encerrar recorrência/ }).click(); const dialog = page.getByRole("dialog"); await dialog.waitFor();
      await dialog.getByRole("button", { name: /Confirmar/ }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(mutations.length, 1); assert.equal(mutations[0].path, "/api/admin/subscriptions/expired-remote/cancel");
      await record("expired-remote").getByText("Sem ações disponíveis", { exact: true }).waitFor();
    });

    await check("Filtro Expiradas usa status efetivo antes da paginação e reinicia página", async () => {
      await page.setViewportSize({ width: 1280, height: 850 }); await open("?page=2");
      await waitForList(() => page.getByLabel("Status da assinatura atual").selectOption("Expired"), q => q.get("status") === "Expired" && q.get("page") === "1");
      const query = { status: "Expired", page: "1", sortBy: "createdAt", sortDirection: "desc" }; await assertServerOrder(query);
      assert(ordered(query, rows).length > 20, "Expired dataset must span pages"); assert(await page.getByRole("button", { name: "Próxima página", exact: true }).isEnabled());
      await waitForList(() => page.getByRole("button", { name: "Próxima página", exact: true }).click(), q => q.get("status") === "Expired" && q.get("page") === "2");
      await assertServerOrder({ ...query, page: "2" }); assert.equal(new URL(page.url()).searchParams.get("status"), "Expired");
    });

    await check("Oito atributos ordenam todos os resultados asc/desc pela API antes de paginar", async () => {
      await page.setViewportSize({ width: 1280, height: 850 });
      for (const field of sortFields) {
        await open("?status=Expired&search=Ordena%C3%A7%C3%A3o&page=2");
        await waitForList(() => field === "createdAt" ? page.getByRole("button", { name: "Ordenar em ordem crescente", exact: true }).click() : page.locator("#subscription-sort").selectOption(field), q => q.get("sortBy") === field && q.get("sortDirection") === "asc" && q.get("page") === "1" && q.get("status") === "Expired" && q.get("search") === "Ordenação");
        const query = { status: "Expired", search: "Ordenação", sortBy: field, sortDirection: "asc", page: "1" }; await assertServerOrder(query);
        assert.equal(new URL(page.url()).searchParams.get("page"), "1");
        await waitForList(() => page.getByRole("button", { name: "Próxima página", exact: true }).click(), q => q.get("page") === "2" && q.get("sortBy") === field && q.get("sortDirection") === "asc");
        await assertServerOrder({ ...query, page: "2" });
        await waitForList(() => page.getByRole("button", { name: "Ordenar em ordem decrescente", exact: true }).click(), q => q.get("sortBy") === field && q.get("sortDirection") === "desc" && q.get("page") === "1");
        await assertServerOrder({ ...query, sortDirection: "desc" });
        const url = new URL(page.url()); assert.equal(url.searchParams.get("status"), "Expired"); assert.equal(url.searchParams.get("search"), "Ordenação");
      }
    });

    await check("Cabeçalhos clicáveis expõem aria-sort e mantêm filtros", async () => {
      await page.setViewportSize({ width: 1280, height: 850 });
      for (const [field, label] of Object.entries(headers)) {
        await open("?status=Expired&search=Ordena%C3%A7%C3%A3o"); const heading = page.getByRole("button", { name: `Ordenar por ${label}`, exact: true });
        await waitForList(() => heading.click(), q => q.get("sortBy") === field && q.get("sortDirection") === "asc");
        assert.equal(await heading.locator("..").getAttribute("aria-sort"), "ascending");
        await waitForList(() => heading.click(), q => q.get("sortBy") === field && q.get("sortDirection") === "desc");
        assert.equal(await heading.locator("..").getAttribute("aria-sort"), "descending");
      }
      assert.equal(await page.getByRole("columnheader", { name: "Ações", exact: true }).getByRole("button").count(), 0);
    });

    await check("Ordenação móvel mantém query/filtros e layout sem overflow", async () => {
      await page.setViewportSize({ width: 390, height: 850 }); await open("?status=Expired&search=Ordena%C3%A7%C3%A3o&page=2");
      await waitForList(() => page.locator("#subscription-sort").selectOption("userEmail"), q => q.get("sortBy") === "userEmail" && q.get("sortDirection") === "asc" && q.get("page") === "1");
      await assertServerOrder({ status: "Expired", search: "Ordenação", sortBy: "userEmail", sortDirection: "asc", page: "1" });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, "sorted-expired-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 850 }); await page.screenshot({ path: path.join(output, "sorted-expired-desktop.png"), fullPage: true });
    });

    await check("Resposta atrasada asc não substitui ordenação desc mais recente", async () => {
      await page.setViewportSize({ width: 1280, height: 850 }); await open("?sortBy=userName&sortDirection=desc"); holdSort = true;
      const request = page.waitForRequest(request => new URL(request.url()).pathname === "/api/admin/subscriptions" && new URL(request.url()).searchParams.get("sortBy") === "userName" && new URL(request.url()).searchParams.get("sortDirection") === "asc");
      const staleResponse = page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/admin/subscriptions" && new URL(reply.url()).searchParams.get("sortBy") === "userName" && new URL(reply.url()).searchParams.get("sortDirection") === "asc");
      await page.getByRole("button", { name: "Ordenar por Cliente", exact: true }).click(); await request;
      await waitForList(() => page.getByRole("button", { name: "Ordenar por Cliente", exact: true }).click(), q => q.get("sortBy") === "userName" && q.get("sortDirection") === "desc");
      await assertServerOrder({ sortBy: "userName", sortDirection: "desc", page: "1" });
      releaseSlow(); holdSort = false; await staleResponse; await settled(); await assertServerOrder({ sortBy: "userName", sortDirection: "desc", page: "1" });
    });

    await check("Vencimento com cancelamento aberto passa a encerrar recorrência imediatamente", async () => {
      await page.clock.install({ time: new Date(instant) });
      await page.setViewportSize({ width: 390, height: 850 });
      const card = await openOne("expiry-boundary");
      await card.getByRole("button", { name: "Cancelar", exact: true }).click();
      const dialog = page.getByRole("dialog"); await dialog.waitFor();
      const immediate = dialog.getByRole("checkbox", { name: /Cortar acesso imediatamente/ });
      assert.equal(await immediate.isChecked(), false);
      await page.clock.fastForward(120001);
      await dialog.getByRole("heading", { name: "Encerrar recorrência", exact: true }).waitFor();
      assert.equal(await dialog.getByRole("checkbox").count(), 0, "An elapsed access period must not retain the old deferred-cancel option");
      await page.screenshot({ path: path.join(output, "expired-open-cancel-modal-mobile.png"), fullPage: true });
      const before = mutations.length;
      await dialog.getByRole("button", { name: "Confirmar encerramento", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(mutations.length, before + 1);
      assert.equal(mutations.at(-1).path, "/api/admin/subscriptions/expiry-boundary/cancel");
      assert.equal(mutations.at(-1).body.immediate, true);
    });
  } finally {
    releaseSlow?.(); await context.close(); await browser.close(); report();
    const failed = results.filter(item => !item.passed).length;
    process.stdout.write(`${results.length - failed}/${results.length} cenários; ${errors.length} erros de página; ${unexpected.length} endpoints inesperados.\n`);
    if (failed || errors.length || unexpected.length) process.exitCode = 1;
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
