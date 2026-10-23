/* Local regression: API responses are simulated and no payment is made. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3115";
const output = path.resolve(process.env.OUTPUT_DIR || "../output/metrics-double-check/admin");
const metrics = total => ({
  generatedAt: "2026-10-23T15:00:00Z",
  users: { total: 100, active: 98, withActiveTrial: 35, last7Days: 10, last30Days: 42 },
  subscriptions: { byStatus: { Active: 90, PendingPayment: 2 }, mrr: 9999 },
  payments: { approved30d: 1, rejected30d: 3, pending30d: 2, revenueTotal: total, revenue30d: 29.9 },
  activities: { totalGenerated: 320, last7Days: 60, last30Days: 100, top5: [] },
  emails: { sent30d: 42, failed30d: 0, pending30d: 0, skippedDev30d: 0 },
});

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "local-admin");
    localStorage.setItem("fp_admin_refresh", "local-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin", name: "Admin", email: "admin@example.test", role: "Admin", userType: 1 }));
  });
  const state = { requests: 0, completed: [], fail: false, total: null, errors: [] };
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.startsWith("/api/")) {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      assert.equal(url.pathname, "/api/admin/metrics");
      const request = ++state.requests;
      const body = metrics(state.total ?? request * 100);
      if (request === 2) await new Promise(resolve => setTimeout(resolve, 900));
      state.completed.push(request);
      return route.fulfill({ status: state.fail ? 503 : 200, json: state.fail ? { error: { message: "Falha simulada de coleta." } } : body, headers });
    }
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => state.errors.push(error.message));
  const findings = [], checks = [];
  try {
    await page.goto(base + "/metricas");
    await page.getByText("R$ 100,00", { exact: true }).waitFor();
    const refresh = page.getByRole("button", { name: "Recoletar", exact: true });
    await refresh.evaluate(button => { button.click(); button.click(); });
    await page.waitForTimeout(120);
    if (!(await refresh.isDisabled())) findings.push("Recoletar continua habilitado durante uma consulta pendente.");
    await page.waitForTimeout(1100);
    if (state.requests !== 2) findings.push(`Clique duplo iniciou ${state.requests - 1} consultas; conclusão fora de ordem: ${state.completed.join(", ")}.`);
    checks.push("Atualização simultânea não pode fazer uma resposta antiga substituir a consulta atual");

    state.fail = true;
    await refresh.click();
    await page.getByText(/Falha simulada de coleta/).waitFor();
    if (!(await page.getByText(/última consulta/).count())) findings.push("Falha de atualização conserva valores anteriores sem identificá-los como antigos.");
    assert(await page.getByText("R$ 200,00", { exact: true }).isVisible(), JSON.stringify({ requests: state.requests, completed: state.completed, findings, total: await page.getByText("Receita recebida (total)", { exact: true }).locator("..").innerText() }));
    state.fail = false;
    state.total = 99999999.99;
    await refresh.click();
    const amount = page.getByText("R$ 99.999.999,99", { exact: true });
    await amount.waitFor();
    checks.push("Falha preserva dados com aviso e uma atualização posterior recupera o painel");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [320, 390, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(250);
        const geometry = await amount.evaluate(element => ({ clipped: element.scrollWidth > element.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth }));
        if (geometry.clipped || geometry.overflow) findings.push(`Receita grande cortada/fora da tela em ${width}px, ${theme}.`);
      }
    }
    checks.push("Valor financeiro completo permanece legível em quatro larguras e dois temas");
    state.total = 0;
    await refresh.click();
    await page.getByText("R$ 0,00", { exact: true }).waitFor();
    assert.equal(await page.getByText(/9\.999/).count(), 0);
    assert.deepEqual(state.errors, []);
    checks.push("Zero recebido é exibido como zero, sem substituir pela soma dos planos de cortesia");
    const report = { checks, findings, errors: state.errors };
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.deepEqual(findings, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
