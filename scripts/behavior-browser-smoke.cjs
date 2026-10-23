/* Every API response is local and simulated; no customer or payment data is used. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3115";
const output = path.resolve(process.env.OUTPUT_DIR || "../output/tracking/admin");
const date = "2026-10-23T15:00:00Z";
const sessionEvents = [
  { name: "page_view", path: "/catalogo", activityKind: null, occurredAt: date },
  { name: "public_preview_opened", path: "/catalogo", activityKind: "word-search", occurredAt: date },
  { name: "activity_opened", path: "/atividades/caca-palavras", activityKind: "word-search", occurredAt: date },
  { name: "activity_generate_succeeded", path: "/atividades/caca-palavras", activityKind: "word-search", occurredAt: date },
];
function report(days, empty = false) {
  const zero = value => empty ? 0 : value;
  return {
    days, retentionDays: 30, generatedAt: date,
    summary: { sessions: zero(days === 7 ? 42 : 125), pageViews: zero(500), activityOpens: zero(82), previewOpens: zero(64), generationRequests: zero(20), generationSuccesses: zero(18), generationFailures: zero(2), downloadClicks: zero(15), signupStarts: zero(12), checkoutStarts: zero(8) },
    daily: Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 24 - days + i)).toISOString().slice(0, 10), pageViews: zero(i + 1), sessions: zero(i), activityOpens: zero(i) })),
    topPages: empty ? [] : [{ path: "/catalogo", views: 220, sessions: 40 }, { path: "/atividades/caca-palavras", views: 45, sessions: 20 }],
    activities: empty ? [] : [{ activityKind: "word-search", opens: 82, publicPreviews: 64, previewRequests: 29, generationRequests: 20, generationSuccesses: 18, generationFailures: 2, downloads: 15 }],
    journeys: empty ? [] : [{ fromPath: "/catalogo", toPath: "/preco", count: 30 }],
    recentSessions: empty ? [] : [{ sessionId: "11111111-1111-4111-8111-111111111111", startedAt: date, lastSeenAt: date, device: "mobile", authenticated: false, eventCount: 56, events: sessionEvents }],
  };
}
const metrics = {
  generatedAt: date,
  users: { total: 100, active: 98, withActiveTrial: 35, last7Days: 10, last30Days: 42 },
  subscriptions: { byStatus: { Active: 90, PendingPayment: 2 }, mrr: 9999 },
  payments: { approved30d: 1, rejected30d: 3, pending30d: 2, revenueTotal: 79.9, revenue30d: 29.9 },
  activities: { totalGenerated: 320, last7Days: 60, last30Days: 100, top5: [] },
  emails: { sent30d: 42, failed30d: 0, pending30d: 0, skippedDev30d: 0 },
};

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "local-admin");
    localStorage.setItem("fp_admin_refresh", "local-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin", name: "Admin", email: "admin@example.test", role: "Admin", userType: 1 }));
  });
  const state = { fail: false, empty: false, missingRevenue: false, delay7: 0, requests: [], errors: [], unexpected: [] };
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.startsWith("/api/")) {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      assert.equal(req.headers().authorization, "Bearer local-admin");
      if (url.pathname === "/api/admin/tracking") {
        const days = Number(url.searchParams.get("days"));
        state.requests.push(days);
        const body = report(days, state.empty);
        if (state.fail) return route.fulfill({ status: 503, json: {}, headers });
        if (days === 7 && state.delay7) await new Promise(resolve => setTimeout(resolve, state.delay7));
        return route.fulfill({ json: body, headers });
      }
      if (url.pathname === "/api/admin/metrics") {
        const body = structuredClone(metrics);
        if (state.missingRevenue) delete body.payments.revenueTotal;
        return route.fulfill({ json: body, headers });
      }
      state.unexpected.push(url.pathname);
      return route.fulfill({ json: {}, headers });
    }
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => state.errors.push(error.message));
  const checks = [];
  try {
    await page.goto(base + "/comportamento");
    const summary = page.getByRole("region", { name: "Resumo das visitas" });
    await summary.getByText("42", { exact: true }).waitFor();
    await page.getByRole("button", { name: "23/10: 7 páginas vistas" }).click();
    await page.getByText("23/10 · 7 páginas vistas · 6 sessões · 6 atividades abertas", { exact: true }).waitFor();
    await page.locator("summary").filter({ hasText: "Visita 1" }).click();
    await page.getByText("Recebeu a atividade gerada", { exact: true }).waitFor();
    await page.getByText("Exibindo 4 de 56 ações desta sessão.", { exact: true }).waitFor();
    checks.push("Resumo, seleção de dia, caminho da sessão e limite de histórico funcionam");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(300); // Let the responsive sidebar transition finish before the screenshot.
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow global ${theme} ${width}px`);
        const region = page.getByRole("region", { name: "Tabela de uso das atividades" });
        const box = await region.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= width, `tabela cortada ${width}px`);
        if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(output, `comportamento-${theme}-${width}.png`), fullPage: true });
      }
    }
    checks.push("Layout em cinco larguras, claro e escuro, com rolagem de tabela contida");
    await page.getByRole("combobox", { name: "Período" }).selectOption("30");
    await summary.getByText("125", { exact: true }).waitFor();
    assert(state.requests.includes(30));
    state.delay7 = 1500;
    await page.getByRole("combobox", { name: "Período" }).selectOption("7");
    await page.getByRole("combobox", { name: "Período" }).selectOption("30");
    await summary.getByText("125", { exact: true }).waitFor();
    await page.waitForTimeout(1700);
    assert(await summary.getByText("125", { exact: true }).isVisible());
    state.delay7 = 0;
    checks.push("Período chega à API e resposta atrasada não substitui seleção atual");
    state.fail = true;
    await page.getByRole("button", { name: "Atualizar", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert(await summary.getByText("125", { exact: true }).isVisible());
    state.fail = false;
    state.empty = true;
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await page.getByRole("heading", { name: "Nenhuma visita registrada neste período" }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    checks.push("Falha preserva último relatório, nova tentativa recupera e período vazio é explícito");
    await page.goto(base + "/metricas");
    await page.getByText("Receita recebida (total)", { exact: true }).waitFor();
    assert(await page.getByText("R$ 79,90", { exact: true }).isVisible());
    assert.equal(await page.getByText(/9\.999/).count(), 0);
    assert.equal(await page.getByText("Receita recorrente mensal", { exact: true }).count(), 0);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow métricas ${width}px`);
    }
    state.missingRevenue = true;
    await page.getByRole("button", { name: "Recoletar", exact: true }).click();
    await page.getByText("Indisponível", { exact: true }).waitFor();
    checks.push("Receita usa cobranças reais, ignora MRR das cortesias e não inventa valor durante atualização da API");
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.unexpected, []);
    fs.writeFileSync(path.join(output, "browser-report.json"), JSON.stringify({ checks, passed: checks.length, errors: state.errors }, null, 2));
    console.log(JSON.stringify({ checks, passed: checks.length, errors: state.errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
