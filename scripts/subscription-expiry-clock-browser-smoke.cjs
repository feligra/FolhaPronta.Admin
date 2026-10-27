/* All network responses and mutations below are local fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3193";
const output = path.resolve(process.env.TEST_OUTPUT_DIR || "dist/verification/subscription-expiry-clock");
const baseline = process.env.TEST_BASELINE === "1";

function item(id, end, overrides = {}) {
  return { id, userId: id, userName: `Cliente ${id}`, userEmail: `${id}@example.invalid`,
    planId: "mensal", planName: "Mensal", planSlug: "mensal", monthlyAmount: 29.9,
    provider: "Manual", hasProviderAgreement: false, status: "Active", rawStatus: "Active",
    hasAccess: true, canExtend: true, canCancel: true, canCancelRenewal: false,
    currentPeriodStart: "2026-10-01T12:00:00Z", currentPeriodEnd: new Date(end).toISOString(),
    createdAt: "2026-10-01T12:00:00Z", canceledAt: null, ...overrides };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Tokyo" });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "local-admin");
    localStorage.setItem("fp_admin_refresh", "local-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "local", role: "Admin", name: "Admin", email: "admin@example.invalid", userType: 1 }));
  });
  let rows = [], mode = "success", releasePost, holdPost = false;
  const queries = [], writes = [], errors = [], unexpected = [], checks = [];
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === base ? route.continue() : route.abort();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "GET" && url.pathname === "/api/admin/subscriptions") {
      const query = Object.fromEntries(url.searchParams);
      queries.push({ ...query, response: mode });
      if (mode === "network") return route.abort("failed");
      if (mode === "400") return route.fulfill({ status: 400, headers, json: { error: { message: "Falha local simulada" } } });
      const selected = rows.filter(row => !query.search || row.userEmail.includes(query.search));
      const currentPage = Number(query.page || 1);
      return route.fulfill({ headers, json: { items: selected, page: currentPage, pageSize: 20,
        totalCount: currentPage === 2 ? 20 + selected.length : selected.length, totalPages: currentPage } });
    }
    if (request.method() === "POST" && /^\/api\/admin\/subscriptions\/[^/]+\/(cancel|extend)$/.test(url.pathname)) {
      writes.push({ path: url.pathname, body: request.postDataJSON() });
      if (holdPost) await new Promise(resolve => { releasePost = resolve; });
      return route.fulfill({ headers, json: {} });
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, headers, json: {} });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-01T12:00:01Z"));
  const settleReact = () => new Promise(resolve => setTimeout(resolve, 50));
  const card = id => {
    const link = page.locator(`main a[href="/clientes/${id}"]:visible`);
    return page.viewportSize().width >= 1024 ? link.locator("xpath=ancestor::tr")
      : link.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," card ")][1]');
  };
  const stat = async label => Number(await page.getByText(label, { exact: true }).locator("..").locator("span").last().innerText());
  const ids = () => page.locator('main a[href^="/clientes/"]:visible').evaluateAll(nodes => nodes.map(node => node.getAttribute("href").split("/").at(-1)));
  const open = async suffix => {
    await page.goto(`${base}/assinaturas${suffix || ""}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.getByRole("button", { name: "Página anterior", exact: true }).waitFor();
  };
  async function prepare(width = 1280, suffix = "?page=2&sortBy=status&sortDirection=asc") {
    mode = "success"; holdPost = false;
    await page.setViewportSize({ width, height: 900 });
    const now = await page.evaluate(() => Date.now());
    rows = [
      item("paid", now + 2000, { checkoutProgress: { subscriptionId: "pending-new", status: "AwaitingConfirmation", planName: "Anual", planSlug: "anual" } }),
      item("trial", now + 86400000, { status: "Trialing", rawStatus: "Trialing", trialEndsAt: new Date(now + 3000).toISOString(), canExtend: false, canCancel: false, monthlyAmount: 0 }),
      item("cancelled", now + 4000, { status: "Cancelled", rawStatus: "Cancelled", canCancel: false }),
      item("pending", now - 1000, { status: "PendingPayment", rawStatus: "PendingPayment", hasAccess: false, canExtend: false,
        checkoutProgress: { subscriptionId: "pending", status: "AwaitingConfirmation", planName: "Mensal" } }),
    ];
    await open(suffix);
    await card("paid").getByText("Ativa", { exact: true }).waitFor();
    return now;
  }
  async function failRefresh(failure) {
    mode = failure;
    const request = page.waitForRequest(request => new URL(request.url()).pathname === "/api/admin/subscriptions");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await request; await settleReact();
  }
  async function check(name, run) {
    try { await run(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { const screenshot = `failure-${checks.length + 1}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }).catch(() => {}); checks.push({ name, passed: false, error: error.message, screenshot }); console.log(`FAIL ${name}: ${error.message}`); }
  }
  try {
    await check("Lista aberta vence Active/Trialing/Cancelled sem API e conserva ordem, totais e checkout pendente", async () => {
      await prepare(); const initialIds = await ids();
      assert.equal(await stat("Ativas (página)"), 1); assert.equal(await stat("Expiradas (página)"), 0);
      await failRefresh("400");
      await page.clock.runFor(2000); await settleReact();
      assert.equal(await card("paid").getByText("Expirada", { exact: true }).count(), 1, "Active must expire on the open page independently of API success");
      assert.equal(await card("paid").getByRole("button", { name: /Estender|Cancelar/ }).count(), 0);
      assert.equal(await stat("Ativas (página)"), 0); assert.equal(await stat("Expiradas (página)"), 1);
      await page.clock.runFor(1000); await settleReact();
      assert.equal(await card("trial").getByText("Expirada", { exact: true }).count(), 1, "Next trial deadline must also be scheduled");
      assert.equal(await stat("Expiradas (página)"), 2);
      await page.clock.runFor(1000); await settleReact();
      assert.equal(await card("cancelled").getByRole("button", { name: /Estender/ }).count(), 0);
      await card("cancelled").getByText("Cancelada", { exact: true }).waitFor();
      await card("pending").getByText("Em processamento", { exact: true }).waitFor();
      await card("paid").getByText("Nova contratação em processamento: Anual", { exact: true }).waitFor();
      assert.equal(await stat("Pendentes (página)"), 1); assert.equal(await stat("Canceladas (página)"), 1);
      assert.equal(await stat("Clientes (filtro atual)"), 24);
      assert.deepEqual(await ids(), initialIds); assert.equal(new URL(page.url()).searchParams.get("page"), "2");
      await page.screenshot({ path: path.join(output, "expired-api-400-desktop.png"), fullPage: true });
    });

    if (!baseline) {
      await check("Mobile vence mesmo com falha de rede e sem reordenar a página filtrada", async () => {
        await prepare(390, "?status=Active&page=2&sortBy=createdAt&sortDirection=desc");
        const initialIds = await ids(); await failRefresh("network");
        await page.clock.runFor(4100); await settleReact();
        assert.equal(await card("paid").getByText("Expirada", { exact: true }).count(), 1);
        assert.equal(await card("trial").getByText("Expirada", { exact: true }).count(), 1);
        assert.equal(await card("cancelled").getByRole("button", { name: /Estender/ }).count(), 0);
        assert.deepEqual(await ids(), initialIds); assert.equal(new URL(page.url()).searchParams.get("status"), "Active");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, "expired-network-mobile.png"), fullPage: true });
      });
      await check("Retorno à aba recalcula vigência sem aguardar consulta nem timer suspenso", async () => {
        const now = await prepare(); mode = "network";
        await page.clock.setSystemTime(new Date(now + 5000));
        await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await settleReact();
        assert.equal(await card("paid").getByText("Expirada", { exact: true }).count(), 1);
        assert.equal(await card("trial").getByText("Expirada", { exact: true }).count(), 1);
        assert.equal(await stat("Expiradas (página)"), 2);
      });
    }

    await check("POST antigo não sobrescreve nova busca nem fecha outro modal", async () => {
      mode = "success"; holdPost = true;
      const now = await page.evaluate(() => Date.now());
      rows = [item("paid-a", now + 60000), item("paid-b", now + 60000)];
      await open("?search=paid-a"); await card("paid-a").getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
      for (let attempt = 0; attempt < 100 && !releasePost; attempt++) await settleReact();
      assert(releasePost, "POST fixture was not reached");
      await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("searchbox").fill("paid-b"); await page.clock.runFor(350);
      await card("paid-b").getByRole("button", { name: "Cancelar", exact: true }).click();
      const queryCount = queries.length;
      releasePost(); releasePost = undefined; holdPost = false;
      await settleReact(); await settleReact();
      assert.equal(await page.getByRole("dialog").count(), 1, "Finishing A must not close the newer B dialog");
      assert((await page.getByRole("dialog").innerText()).includes("Cliente paid-b"));
      assert.equal(new URL(page.url()).searchParams.get("search"), "paid-b");
      assert.deepEqual(await ids(), ["paid-b"]);
      assert(queries.slice(queryCount).every(query => query.search === "paid-b"), "Late completion must only refresh the latest query");
      await page.getByRole("dialog").getByRole("button", { name: "Voltar", exact: true }).click();
      assert.equal(writes.at(-1).path, "/api/admin/subscriptions/paid-a/cancel");
    });
  } finally {
    releasePost?.(); await context.close(); await browser.close();
    const report = { baseline, mockedApi: true, checks, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length, errors, unexpected, queries, writes };
    fs.writeFileSync(path.join(output, "subscription-expiry-clock-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, failed: report.failed, pageErrors: errors.length, unexpectedApi: unexpected.length }));
    if (report.failed || errors.length || unexpected.length) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
