/* Local-only regression: stale customer responses must not outlive a paid period. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3193";
const output = path.resolve(process.env.TEST_OUTPUT_DIR || "dist/verification/customer-subscription-expiry");
const instant = Date.parse("2026-10-27T15:00:00Z");
// The legacy API returns UTC instants without Z. A Tokyo browser makes local-time parsing observable.
const at = offset => new Date(instant + offset).toISOString().replace(/Z$/, "");
const day = 86400000;

function fixture(mode, width) {
  const end = mode === "null" ? null : at(mode === "elapsed" ? -day : 2000);
  const user = {
    id: "customer-local", name: "Cliente de vigência", email: "vigencia@example.invalid",
    role: "User", userType: 1, isActive: true, emailConfirmed: true,
    createdAt: at(-60 * day), lastLoginAt: at(-day), phone: null, cpf: null, address: null,
    planSlug: "mensal", subscriptionStatus: "Active", subscriptionEndsAt: end,
    isPaidPlan: true, isTrialActive: false, trialStatus: "Subscribed",
    trialStartedAt: at(-30 * day), trialEndsAt: at(width === 1280 ? -20 * day : 20 * day),
    trialPdfsGenerated: 3, totalActivitiesGenerated: 8, lastActivityGeneratedAt: at(-day),
  };
  const subscription = {
    id: "subscription-local", planId: "plan-local", planName: "Plano Mensal", planSlug: "mensal",
    provider: "Manual", hasProviderAgreement: false, monthlyAmount: 29.9,
    billingFrequencyMonths: 1, status: "Active", rawStatus: "Active", hasAccess: true,
    canExtend: true, canCancel: true, canCancelRenewal: false, trialEndsAt: null,
    currentPeriodStart: at(-30 * day), currentPeriodEnd: end,
    canceledAt: null, cancelReason: null, createdAt: at(-60 * day),
  };
  return { user, subscription };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const checks = [], errors = [], unexpected = [], queries = [];
  const report = () => fs.writeFileSync(path.join(output, "customer-subscription-expiry-browser-report.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), mockedApi: true, browserTimezone: "Asia/Tokyo",
    legacyUtcWithoutSuffix: true, checks, passed: checks.filter(x => x.passed).length,
    failed: checks.filter(x => !x.passed).length, errors, unexpected, queries,
  }, null, 2));

  async function check(name, width, action) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Asia/Tokyo" });
    await context.addInitScript(() => {
      localStorage.setItem("fp_admin_access", "local-mocked-admin");
      localStorage.setItem("fp_admin_refresh", "local-mocked-refresh");
      localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin-local", name: "Admin Local", email: "admin@example.invalid", role: "Admin", userType: 1 }));
    });
    let active = fixture("future", width), failReads = false, deniedReads = 0;
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,OPTIONS" };
      const json = (body, status = 200) => route.fulfill({ status, headers, json: body });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.method() === "GET" && ["/api/admin/users", "/api/admin/users/customer-local"].includes(url.pathname)) {
        queries.push({ check: name, path: url.pathname, status: failReads ? 503 : 200 });
        if (failReads) { deniedReads++; return json({ error: { message: "Consulta indisponível na fixture local." } }, 503); }
        return url.pathname === "/api/admin/users"
          ? json({ items: [active.user], page: 1, pageSize: 20, totalCount: 1, totalPages: 1 })
          : json({ user: active.user, currentSubscription: active.subscription, checkoutProgress: null, payments: [], totalActivitiesGenerated: 8, activitiesByType: [], recentActivities: [], classrooms: [] });
      }
      unexpected.push(`${request.method()} ${url.pathname}`);
      return json({ error: { message: "Endpoint não previsto no teste local." } }, 404);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push({ check: name, error: error.message }));
    await page.clock.install({ time: new Date(instant - 1000) });
    await page.clock.pauseAt(new Date(instant));
    const visibleText = text => page.locator("main").getByText(text, { exact: true }).filter({ visible: true });
    const stat = label => page.locator("main section").first().locator("div.card").filter({ has: page.getByText(label, { exact: true }) }).locator("span").last();
    const screenshot = name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: "disabled" });
    const assertLayout = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Document must not overflow horizontally");
    const open = async (detail, mode = "future") => {
      active = fixture(mode, width); failReads = false;
      await page.goto(`${base}/clientes${detail ? "/customer-local" : ""}`);
      await page.getByRole("heading", { name: detail ? active.user.name : "Clientes", exact: true }).waitFor();
      await visibleText("E-mail confirmado").first().waitFor();
      await assertLayout();
    };
    const failBackgroundRead = async () => {
      failReads = true;
      const reply = page.waitForResponse(response => new URL(response.url()).pathname.startsWith("/api/admin/users") && response.status() === 503);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await reply;
      assert(deniedReads > 0, "The API must actually fail while stale data remains mounted");
    };
    try {
      await action({ page, visibleText, stat, open, failBackgroundRead, screenshot, assertLayout, deniedReads: () => deniedReads });
      checks.push({ name, width, passed: true }); console.log(`PASS ${name}`);
    } catch (error) {
      const evidence = `failure-${checks.length + 1}.png`;
      await screenshot(evidence).catch(() => {});
      checks.push({ name, width, passed: false, error: error.message, stack: error.stack, screenshot: evidence });
      console.log(`FAIL ${name}: ${error.message}`);
    } finally { await context.close(); report(); }
  }

  try {
    for (const width of [1280, 390]) {
      await check(`Lista revalida vigência sem API e preserva conta ativa em ${width}px`, width, async ({ page, visibleText, stat, open, failBackgroundRead, screenshot, assertLayout }) => {
        await open(false);
        await visibleText("Assinatura ativa").waitFor(); await visibleText("Ativa").waitFor();
        assert.equal(await stat("Plano vigente (página)").innerText(), "1");
        assert.equal(await stat("Contas ativas (página)").innerText(), "1");
        await failBackgroundRead();
        await page.clock.runFor(1999);
        assert(await visibleText("Assinatura ativa").isVisible(), "Paid period must last through the final millisecond, regardless of trial expiry/browser timezone");
        await page.clock.runFor(2);
        await visibleText("Assinatura expirada").waitFor(); await visibleText("Expirada").waitFor();
        assert.equal(await visibleText("Assinatura ativa").count(), 0);
        assert.equal(await visibleText("Ativa").count(), 0);
        assert.equal(await stat("Plano vigente (página)").innerText(), "0");
        assert.equal(await stat("Contas ativas (página)").innerText(), "1");
        await assertLayout(); await screenshot(`customers-expired-${width}.png`);
      });

      await check(`Detalhe perde ações de vigência sem API e preserva conta ativa em ${width}px`, width, async ({ page, visibleText, open, failBackgroundRead, screenshot, assertLayout }) => {
        await open(true); await visibleText("Assinatura ativa").first().waitFor();
        await page.getByRole("button", { name: "Assinatura", exact: true }).click();
        await visibleText("Ativa").waitFor();
        assert(await page.getByRole("button", { name: "Trocar plano", exact: true }).isVisible());
        assert(await page.getByRole("button", { name: "Estender vigência", exact: true }).isVisible());
        await failBackgroundRead(); await page.clock.runFor(1999);
        assert(await visibleText("Assinatura ativa").isVisible());
        await page.clock.runFor(2);
        await visibleText("Assinatura expirada").waitFor(); await visibleText("Expirada").waitFor();
        assert.equal(await visibleText("Assinatura ativa").count(), 0); assert.equal(await visibleText("Ativa").count(), 0);
        assert.equal(await page.getByRole("button", { name: /Estender|Trocar plano/ }).count(), 0);
        assert(await visibleText("Conta ativa").isVisible());
        assert(await page.getByRole("button", { name: "Conceder nova assinatura", exact: true }).isVisible());
        await assertLayout(); await screenshot(`customer-detail-expired-${width}.png`);
      });

      for (const detail of [false, true]) await check(`${detail ? "Detalhe" : "Lista"} rejeita vigência vencida ou nula desde abertura em ${width}px`, width, async ({ page, visibleText, stat, open, screenshot, assertLayout }) => {
        for (const mode of ["elapsed", "null"]) {
          await open(detail, mode);
          await visibleText("Assinatura expirada").first().waitFor();
          assert.equal(await visibleText("Assinatura ativa").count(), 0);
          if (detail) {
            await page.getByRole("button", { name: "Assinatura", exact: true }).click();
            assert(await visibleText("Conta ativa").isVisible());
            assert.equal(await page.getByRole("button", { name: /Estender|Trocar plano/ }).count(), 0);
          } else {
            assert.equal(await stat("Plano vigente (página)").innerText(), "0");
            assert.equal(await stat("Contas ativas (página)").innerText(), "1");
          }
          await visibleText("Expirada").waitFor(); assert.equal(await visibleText("Ativa").count(), 0);
          await assertLayout();
          if (mode === "null") await screenshot(`${detail ? "detail" : "customers"}-null-end-${width}.png`);
        }
      });
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  } finally { await browser.close(); report(); }
  if (checks.some(check => !check.passed) || errors.length || unexpected.length) process.exitCode = 1;
  console.log(`${checks.filter(check => check.passed).length}/${checks.length} checks; all API responses mocked, no real mutations.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
