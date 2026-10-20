/* eslint-disable @typescript-eslint/no-require-imports -- Local browser test; every API request is simulated. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3115";
const output = path.resolve(process.env.OUTPUT_DIR || "../output/marketing-conversions/admin");
const date = "2026-10-20T15:00:00Z";
const marketing = {
  since: "2026-09-20T15:00:00Z", consentedVisits: 250, registeredVisits: 40, planViewVisits: 70,
  registrations: 42, registeredPayers: 8, trials: 35, trialPayers: 7, activatedUsers: 28,
  checkouts: 15, paidCheckouts: 8, unpaidCheckoutsOver24h: 3, newPayers: 8, renewals: 4,
  cancelledSubscriptions: 1, acquisitionRevenue: 239.2, recurringRevenue: 119.6, refundedRevenue: 29.9,
  visitRegistrationRate: 16, registrationPaidRate: 19.047619, checkoutPaidRate: 53.3333,
  trialPaidRate: 20, paymentApprovalRate: 80, averageHoursToFirstPayment: 12.5,
  cac: null, roas: null, capiEnabled: true, deliveryMode: "Test", configurationIssue: null,
  deliveryStatus: { Sent: 10, Failed: 1, Pending: 2, Suppressed: 30 },
  campaigns: [{ source: "meta_" + "origem".repeat(20), medium: "paid_social", campaign: "campanha_".repeat(18), visits: 250, registrations: 40, checkouts: 15, newPayers: 8, revenue: 239.2 }],
};
const metrics = {
  generatedAt: date, marketing,
  users: { total: 100, active: 98, withActiveTrial: 35, last7Days: 10, last30Days: 42 },
  subscriptions: { byStatus: { Active: 10, PendingPayment: 2 }, mrr: 299 },
  payments: { approved30d: 12, rejected30d: 3, pending30d: 2, revenue30d: 358.8 },
  activities: { totalGenerated: 320, last7Days: 60, last30Days: 100, top5: [] },
  emails: { sent30d: 42, failed30d: 0, pending30d: 0, skippedDev30d: 0 },
};
const failed = { id: "11111111-1111-4111-8111-111111111111", eventName: "Purchase", eventId: "purchase:stable-id", eventTime: date, status: "Failed", attempts: 3, lastError: "meta_429_" + "diagnostico".repeat(16), deliveryMode: "Test" };

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "local-admin");
    localStorage.setItem("fp_admin_refresh", "local-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin", name: "Admin", email: "admin@example.test", role: "Admin", userType: 1 }));
  });
  const state = { failQueue: true, failRetry: true, posts: [], requests: [], queue: [{ ...failed }], errors: [], unexpected: [] };
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.startsWith("/api/")) {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const json = (body, status = 200) => route.fulfill({ json: body, status, headers });
      if (url.pathname === "/api/admin/metrics") return json(metrics);
      if (url.pathname === "/api/admin/marketing/conversions") {
        if (state.failQueue) return json({ error: { message: "Fila indisponível" } }, 503);
        const pageNumber = Number(url.searchParams.get("page") || 1);
        const status = url.searchParams.get("status");
        state.requests.push({ page: pageNumber, status });
        const items = status ? state.queue.filter(item => item.status === status) : state.queue;
        return json({ total: items.length, items: items.slice((pageNumber - 1) * 50, pageNumber * 50) });
      }
      if (url.pathname === `/api/admin/marketing/conversions/${failed.id}/retry`) {
        state.posts.push({ path: url.pathname, body: req.postData() });
        await new Promise(resolve => setTimeout(resolve, 350));
        if (state.failRetry) return json({ error: { message: "Evento fora do prazo" } }, 409);
        state.queue = state.queue.map(item => item.id === failed.id ? { ...item, status: "Pending" } : item);
        return json({ id: failed.id, eventId: failed.eventId, message: "Reenvio agendado com o mesmo identificador." });
      }
      state.unexpected.push(url.pathname);
      return json({});
    }
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => state.errors.push(error.message));
  const checks = [];
  try {
    await page.goto(base + "/metricas");
    await page.getByRole("heading", { name: "Aquisição e conversões" }).waitFor();
    await page.getByRole("alert").filter({ hasText: "Não foi possível consultar a fila" }).waitFor();
    assert(await page.getByText("Receita recorrente mensal", { exact: true }).isVisible());
    state.failQueue = false;
    await page.getByRole("button", { name: "Atualizar fila" }).click();
    await page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true }).waitFor();
    checks.push("Falha na fila preserva métricas e Atualizar fila recupera sem recarregar");

    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow global em ${width}px`);
      const action = page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true });
      await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width, `ação cortada em ${width}px`);
      await page.screenshot({ path: path.join(output, `metricas-${width}.png`), fullPage: true });
    }
    checks.push("Layout 320/390/1280px sem overflow global; reenvio acessível e textos longos contidos");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole("status").filter({ hasText: "Não foi possível reenviar" }).waitFor();
    assert.equal(state.posts.length, 1);
    assert(await page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true }).isEnabled());
    checks.push("Clique duplo cria uma tentativa; falha libera botão para novo envio");

    state.failRetry = false;
    await page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true }).click();
    await page.getByRole("status").filter({ hasText: "Reenvio agendado" }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Tentar novamente Purchase"));
    assert.equal(state.posts.length, 2);
    assert(state.posts.every(item => item.path.endsWith(`/${failed.id}/retry`)));
    assert(await page.locator('[aria-label="Conversões recentes"]').getByText("Aguardando", { exact: true }).isVisible());
    checks.push("Reenvio preserva recurso original, atualiza fila e remove ação durante estado pendente");

    state.queue = [];
    await page.getByRole("button", { name: "Atualizar fila" }).click();
    await page.getByText("Nenhuma conversão registrada na fila.", { exact: true }).waitFor();
    checks.push("Fila vazia apresenta estado explícito");

    state.queue = [...Array.from({ length: 50 }, (_, index) => ({
      ...failed, id: `sent-${index}`, eventName: "CompleteRegistration", status: "Sent", lastError: null,
    })), { ...failed }];
    await page.getByRole("button", { name: "Atualizar fila" }).click();
    await page.getByText("Página 1 de 2 · 51 eventos", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Tentar novamente Purchase" }).count(), 0);
    await page.getByRole("button", { name: "Próxima", exact: true }).click();
    await page.getByText("Página 2 de 2 · 51 eventos", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true }).waitFor();
    assert(state.requests.some(request => request.page === 2));
    await page.getByRole("combobox", { name: "Estado da entrega" }).selectOption("Failed");
    await page.getByText("Página 1 de 1 · 1 eventos", { exact: true }).waitFor();
    assert(state.requests.some(request => request.page === 1 && request.status === "Failed"));
    await page.getByRole("button", { name: "Tentar novamente Purchase" }).filter({ visible: true }).click();
    await page.getByText("Nenhuma conversão registrada na fila.", { exact: true }).waitFor();
    assert.equal(state.posts.length, 3);
    checks.push("Paginação alcança evento após os 50 primeiros; filtro de falha e retry usam contrato real total/page/status e resposta 200");
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.unexpected, []);
    fs.writeFileSync(path.join(output, "browser-report.json"), JSON.stringify({ checks, passed: checks.length, errors: state.errors, realReplays: 0 }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, errors: state.errors, realReplays: 0 }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
