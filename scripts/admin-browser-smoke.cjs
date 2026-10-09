const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3012";
const now = new Date().toISOString();
const end = new Date(Date.now() + 86400000 * 7).toISOString();
const longName = "Professora".repeat(18);
const longEmail = `${"professora".repeat(19)}@exemplo.com.br`;
const user = { id: "customer-1", name: longName, email: longEmail, role: "User", userType: 1, isActive: true, emailConfirmed: false, createdAt: now, lastLoginAt: now, planSlug: null, subscriptionStatus: null, isPaidPlan: false, isTrialActive: true, trialEndsAt: end, totalActivitiesGenerated: 1205, lastActivityGeneratedAt: now };
const plan = { id: "plan-1", name: longName, slug: "pro-anual", monthlyPrice: 240, billingFrequencyMonths: 12, isActive: true, includesWeeklyPlanner: true, allowedActivitiesCount: 0, sortOrder: 1, description: "Plano para docentes", hasActivityRestrictions: false, mercadoPagoPlanId: null, subscriptionCount: 1, allowedActivities: [], featuresJson: "[]" };
const subscription = { id: "sub-1", userId: user.id, userName: user.name, userEmail: user.email, planId: plan.id, planName: plan.name, planSlug: plan.slug, monthlyAmount: 240, billingFrequencyMonths: 12, status: "Active", currentPeriodStart: now, currentPeriodEnd: end, canceledAt: null, hasAccess: true, createdAt: now };
const paged = (items, pageSize = 20) => ({ items, page: 1, pageSize, totalCount: items.length, totalPages: 1 });
const detail = { user: { ...user, phone: null, cpf: null, address: null, trialStartedAt: now, trialEndsAt: end, trialPdfsGenerated: 4 }, currentSubscription: subscription, payments: [{ id: "payment-1", type: "Subscription", subscriptionId: subscription.id, status: "Rejected", amount: 240, currency: "BRL", description: "Tentativa de pagamento", paymentMethod: "visa", createdAt: now, paidAt: null, failureReason: "Cartão recusado pela instituição" }], totalActivitiesGenerated: 1205, activitiesByType: [{ type: "ConnectDots", count: 1205 }], classrooms: [{ id: "class-1", name: longName, studentCount: 28, createdAt: now, activeWeeklyPlanId: null }], recentActivities: [{ id: "activity-1", type: "ConnectDots", title: "Ligue os pontos — gato", createdAt: now, hasAnswerKey: true }] };
const metrics = { generatedAt: now, users: { total: 105, active: 100, withActiveTrial: 2, last7Days: 5, last30Days: 18 }, subscriptions: { byStatus: { Active: 20, PendingPayment: 3 }, mrr: 1050 }, payments: { approved30d: 8, rejected30d: 4, pending30d: 3, revenue30d: 420 }, activities: { totalGenerated: 1205, last7Days: 120, last30Days: 310, top5: [{ type: "ConnectDots", count: 1205 }] }, emails: { sent30d: 100, failed30d: 2, pending30d: 1, skippedDev30d: 0 } };
const logs = [{ id: "log-1", toEmail: longEmail, subject: "Cliente cadastrado " + longName, templateName: "CustomerRegistered", status: "Failed", errorMessage: "Erro simulado para validar visualização", createdAt: now, sentAt: null }];
const defaultRecipient = (id, email) => ({ id, email, enabled: true, customerRegistered: true, paymentApproved: true, activityReported: true, contactMessage: true, createdAt: now });

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 740 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem("fp_admin_access", "simulated-admin-token");
    localStorage.setItem("fp_admin_refresh", "simulated-refresh");
    localStorage.setItem("fp_admin_user", JSON.stringify({ id: "admin-1", name: "Administrador", email: "admin@example.com", role: "Admin", userType: 1 }));
  });
  let recipients = [defaultRecipient("owner", "dono@example.com"), defaultRecipient("partner", "socio@example.com")];
  let posts = 0; let puts = 0; let deletes = 0;
  let deliveryStatus = { smtpConfigured: false, pending: 5, retrying: 2, delivered: 15, cancelled: 1, oldestPendingAt: now };
  let failRecipients = false;
  let delayNextRecipients = false;
  let authMode = null;
  let refreshes = 0;
  let releaseRefresh;
  const oldRequestsUsingNewLogin = [];
  const unexpected = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.headers().authorization === "Bearer new-login-access" && pathname.includes("notification"))
      oldRequestsUsingNewLogin.push(pathname);
    if (pathname === "/api/auth/refresh") {
      refreshes++;
      const mode = authMode;
      if (mode?.startsWith("delayed-")) await new Promise((resolve) => { releaseRefresh = resolve; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (mode === "recover" || mode === "delayed-success") return route.fulfill({ status: 200, headers, json: { accessToken: "renewed-access", refreshToken: "renewed-refresh" } });
      return route.fulfill({ status: mode === "expired" || mode === "delayed-invalid" ? 401 : 503, headers, json: { error: { message: "Refresh indisponível" } } });
    }
    if (pathname === "/api/auth/logout") return route.fulfill({ status: 200, headers, json: {} });
    if (pathname === "/api/admin/auth/login") return route.fulfill({ status: 200, headers, json: { accessToken: "new-login-access", refreshToken: "new-login-refresh", userId: "new-admin", name: "Novo admin", email: "novo@example.com", role: "Admin", userType: 1 } });
    if (authMode && !["Bearer renewed-access", "Bearer new-login-access"].includes(request.headers().authorization))
      return route.fulfill({ status: 401, headers, json: { error: { message: "Sessão expirada" } } });
    let body;
    let status = 200;
    if (pathname.includes("/admin/notification-recipients")) {
      if (method === "GET") {
        if (failRecipients) { status = 503; body = { error: { message: "Falha temporária de consulta" } }; }
        else {
          body = structuredClone(recipients);
          if (delayNextRecipients) { delayNextRecipients = false; await new Promise((resolve) => setTimeout(resolve, 900)); }
        }
      }
      if (method === "POST") {
        posts++; const data = request.postDataJSON();
        if (recipients.some((item) => item.email.toLowerCase() === data.email.toLowerCase())) { status = 409; body = { success: false, error: { message: "Este e-mail já está cadastrado." } }; }
        else { const next = { ...data, id: `new-${posts}`, createdAt: now }; recipients.push(next); body = next; status = 201; }
      }
      if (method === "PUT") { puts++; const id = pathname.split("/").pop(); body = { ...request.postDataJSON(), id, createdAt: now }; recipients = recipients.map((item) => item.id === id ? body : item); }
      if (method === "DELETE") { deletes++; recipients = recipients.filter((item) => item.id !== pathname.split("/").pop()); body = {}; }
    } else if (pathname === "/api/admin/notification-status") body = deliveryStatus;
    else if (pathname === "/api/admin/users") {
      const query = new URL(request.url()).searchParams;
      if (query.get("search") === "primeiro") {
        await new Promise((resolve) => setTimeout(resolve, 900));
        body = paged([{ ...user, name: "Resultado antigo" }]);
      } else if (query.get("search") === "segundo") body = paged([{ ...user, name: "Resultado correto" }]);
      else body = { ...paged([user]), page: Number(query.get("page") || 1), totalPages: 4, totalCount: 80 };
    }
    else if (pathname.endsWith("/login-history")) body = { totalCount: 1, items: [{ id: "login-1", occurredAt: now, ipAddress: "127.0.0.1", userAgent: "Chrome Android", success: true }] };
    else if (pathname === "/api/admin/users/customer-1") body = detail;
    else if (pathname === "/api/admin/users/customer-slow") {
      await new Promise((resolve) => setTimeout(resolve, 900));
      body = { ...detail, user: { ...detail.user, id: "customer-slow", name: "Cliente anterior" } };
    }
    else if (pathname === "/api/admin/users/customer-fast") body = { ...detail, user: { ...detail.user, id: "customer-fast", name: "Cliente atual" } };
    else if (pathname === "/api/admin/subscriptions") body = paged([subscription]);
    else if (pathname === "/api/admin/plans") body = { items: [plan], totalActivityTypes: 29 };
    else if (pathname === "/api/admin/plans/plan-1") body = plan;
    else if (pathname === "/api/admin/activities") body = { items: [{ activityType: 1, name: "ConnectDots", label: "Ligue os pontos", disabled: false }, { activityType: 2, name: "NumberSequence", label: "Sequência de números", disabled: true }], total: 2, active: 1, disabled: 1 };
    else if (pathname === "/api/admin/metrics") body = metrics;
    else if (pathname === "/api/admin/email-logs") body = paged(logs, 50);
    else if (pathname === "/api/admin/health") body = { status: "ok", adminId: "admin-1", email: "admin@example.com", timestamp: now };
    else { unexpected.push(`${method} ${pathname}`); return route.fulfill({ status: 404, headers, json: { error: { message: "API mock não configurada" } } }); }
    return route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/api/")) return route.fallback();
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  fs.mkdirSync(path.resolve("dist/verification"), { recursive: true });
  let checks = 0;
  async function check(name, action) { await action(); checks++; process.stdout.write(`PASS ${name}\n`); }
  async function open(route, heading) { await page.goto(base + route); await page.getByRole("heading", { name: heading, exact: true }).waitFor(); await page.locator("main").getByText(/Carregando/).first().waitFor({ state: "hidden" }).catch(() => {}); }
  async function fits() {
    const bad = await page.evaluate(() => {
      const vw = window.innerWidth;
      const nodes = [...document.querySelectorAll("main .card,main header")];
      return nodes.filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && (rect.left < -1 || rect.right > vw + 1); }).map((node) => node.className);
    });
    assert.deepEqual(bad, [], "Cards e cabeçalhos devem caber na tela");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }

  try {
    await check("Menu mobile abre, segura foco e fecha com Escape", async () => {
      await open("/clientes", "Clientes");
      const menu = page.getByRole("button", { name: "Abrir menu" });
      await menu.click(); assert.equal(await menu.getAttribute("aria-expanded"), "true");
      assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Sair");
      await page.keyboard.press("Escape");
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      await menu.click(); await page.getByRole("link", { name: "Notificações", exact: true }).click();
      await page.getByRole("heading", { name: "Notificações", exact: true }).waitFor();
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
    });
    await check("Dois destinatários e preferências independentes", async () => {
      await page.getByRole("heading", { name: "dono@example.com" }).waitFor();
      await page.getByRole("heading", { name: "socio@example.com" }).waitFor();
      await page.getByRole("button", { name: "Adicionar e-mail", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("E-mail", { exact: true }).fill("professora@example.com");
      await dialog.getByLabel("Cliente cadastrado").uncheck();
      await dialog.getByRole("button", { name: "Salvar preferências" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(posts, 1); assert.equal(recipients.length, 3);
      assert.equal(recipients[2].customerRegistered, false); assert.equal(recipients[2].contactMessage, true);
      await page.getByRole("button", { name: "Editar socio@example.com", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Recebimento ativo").uncheck();
      await page.getByRole("dialog").getByRole("button", { name: "Salvar preferências" }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(puts, 1); assert.equal(recipients.find((item) => item.id === "owner").enabled, true); assert.equal(recipients.find((item) => item.id === "partner").enabled, false);
    });
    await check("SMTP ausente mostra fila e estado configurado atualiza sob demanda", async () => {
      const status = page.getByRole("region", { name: "Estado dos envios" });
      await status.getByText("Envio pausado — serviço de e-mail não configurado", { exact: true }).waitFor();
      assert.equal(await status.locator("dd").nth(0).textContent(), "5");
      assert.equal(await status.locator("dd").nth(1).textContent(), "2");
      deliveryStatus = { ...deliveryStatus, smtpConfigured: true, pending: 0, retrying: 0 };
      await page.getByRole("button", { name: "Atualizar", exact: true }).click();
      await status.getByText("Envio configurado", { exact: true }).waitFor();
      assert.equal(await status.locator("dd").nth(0).textContent(), "0");
    });
    await check("E-mail duplicado mostra erro e permite corrigir", async () => {
      await page.getByRole("button", { name: "Adicionar e-mail", exact: true }).click();
      await page.getByRole("dialog").getByLabel("E-mail", { exact: true }).fill("dono@example.com");
      await page.getByRole("dialog").getByRole("button", { name: "Salvar preferências" }).click();
      await page.getByRole("dialog").getByRole("alert").waitFor();
      assert(await page.getByRole("dialog").getByRole("button", { name: "Salvar preferências" }).isEnabled());
      await page.keyboard.press("Escape");
      assert.equal(recipients.length, 3);
    });
    await check("Remoção exige ação explícita no diálogo", async () => {
      await page.getByRole("button", { name: "Remover professora@example.com", exact: true }).click();
      assert.equal(deletes, 0);
      await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(deletes, 1); assert.equal(recipients.length, 2);
    });
    await check("Falha de consulta não é apresentada como lista vazia; atualizar recupera", async () => {
      failRecipients = true;
      await open("/notificacoes", "Notificações");
      await page.getByRole("alert").getByText("Falha temporária de consulta", { exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Nenhum destinatário cadastrado" }).count(), 0);
      failRecipients = false;
      await page.getByRole("button", { name: "Atualizar", exact: true }).click();
      await page.getByRole("heading", { name: "dono@example.com", exact: true }).waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
    });
    await check("Resposta lenta não restaura destinatário já removido", async () => {
      delayNextRecipients = true;
      const requested = page.waitForRequest((request) => request.url().includes("notification-recipients") && request.method() === "GET");
      const response = page.waitForResponse((reply) => reply.url().includes("notification-recipients") && reply.request().method() === "GET");
      await page.getByRole("button", { name: "Atualizar", exact: true }).click(); await requested;
      await page.getByRole("button", { name: "Remover socio@example.com", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await response; await page.waitForTimeout(100);
      assert.equal(await page.getByRole("heading", { name: "socio@example.com", exact: true }).count(), 0);
      assert(await page.getByRole("button", { name: "Atualizar", exact: true }).isEnabled());
    });
    await check("Ao trocar cliente, resposta antiga não sobrescreve o detalhe atual", async () => {
      const requested = page.waitForRequest((request) => request.url().includes("/users/customer-slow"));
      const response = page.waitForResponse((reply) => reply.url().includes("/users/customer-slow"));
      await page.goto(base + "/clientes/customer-slow"); await requested;
      await page.evaluate(() => { history.pushState({}, "", "/clientes/customer-fast"); window.dispatchEvent(new PopStateEvent("popstate")); });
      await page.getByRole("heading", { name: "Cliente atual", exact: true }).waitFor();
      await response; await page.waitForTimeout(100);
      assert(await page.getByRole("heading", { name: "Cliente atual", exact: true }).isVisible());
      assert.equal(await page.getByRole("heading", { name: "Cliente anterior", exact: true }).count(), 0);
    });
    const screens = [["/clientes", "Clientes"], ["/clientes/customer-1", longName], ["/assinaturas", "Assinaturas"], ["/planos", "Planos"], ["/licoes", "Lições"], ["/metricas", "Métricas do sistema"], ["/emails", "Logs de email"], ["/notificacoes", "Notificações"], ["/health", "Saúde do painel"]];
    for (const width of [320, 390, 768, 1280]) {
      await check(`Todas as 9 telas adaptam em ${width}px com conteúdo longo`, async () => {
        await page.setViewportSize({ width, height: 740 });
        for (const [route, title] of screens) { await open(route, title); await fits(); }
        await open("/clientes/customer-1", longName);
        for (const label of ["Assinatura", "Pagamentos", "Atividades", "Turmas", "Logins"]) {
          await page.getByRole("button", { name: label, exact: true }).click(); await fits();
        }
      });
    }
    await page.setViewportSize({ width: 390, height: 740 });
    await check("Cliente mostra contagem, geração recente e trial", async () => {
      await open("/clientes", "Clientes");
      await page.getByText("1205 atividade(s)", { exact: true }).waitFor();
      await page.getByText(/Teste grátis ativo até/).waitFor();
      await open("/clientes/customer-1", longName);
      await page.getByRole("button", { name: "Atividades", exact: true }).click();
      await page.getByText("Ligue os pontos — gato", { exact: true }).waitFor();
      await page.screenshot({ path: "dist/verification/admin-customer-mobile.png", fullPage: true });
    });
    await check("Página na URL é preservada e pesquisa lenta não substitui resultado novo", async () => {
      await open("/clientes?page=3", "Clientes");
      await page.waitForTimeout(400);
      assert.equal(new URL(page.url()).searchParams.get("page"), "3");
      const search = page.getByPlaceholder("Buscar por nome ou e-mail…");
      const firstRequested = page.waitForRequest((request) => request.url().includes("/admin/users") && request.url().includes("search=primeiro"));
      await search.fill("primeiro");
      await firstRequested;
      await search.fill("segundo");
      await page.getByText("Resultado correto", { exact: true }).last().waitFor();
      await page.waitForTimeout(1000);
      assert(await page.getByText("Resultado correto", { exact: true }).last().isVisible());
      assert.equal(await page.getByText("Resultado antigo", { exact: true }).count(), 0);
      await open("/clientes/customer-1", longName);
    });
    await check("Modais de cliente e plano mantêm ações acessíveis em altura pequena", async () => {
      await page.setViewportSize({ width: 320, height: 480 });
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      const dialog = page.getByRole("dialog");
      assert((await dialog.boundingBox()).height <= 456);
      await dialog.getByRole("button", { name: /Salvar/ }).scrollIntoViewIfNeeded();
      assert(await dialog.getByRole("button", { name: /Salvar/ }).isVisible());
      await page.keyboard.press("Escape");
      await open("/planos", "Planos");
      await page.getByRole("button", { name: "Novo plano", exact: true }).click();
      assert((await page.getByRole("dialog").boundingBox()).height <= 456);
      await page.getByRole("dialog").getByRole("button", { name: "Criar plano", exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    });
    await check("Notificações em 320px: formulário rolável e botão de salvar alcançável", async () => {
      await open("/notificacoes", "Notificações");
      await page.getByRole("button", { name: "Adicionar e-mail", exact: true }).click();
      const dialog = page.getByRole("dialog");
      assert((await dialog.boundingBox()).height <= 456);
      await dialog.getByRole("button", { name: "Salvar preferências" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "dist/verification/admin-notifications-dialog-mobile.png", fullPage: true });
      await page.keyboard.press("Escape");
    });
    await check("Falha temporária no refresh preserva sessão e permite recuperar os dados", async () => {
      authMode = "unavailable";
      await open("/notificacoes", "Notificações");
      await page.getByText("Sessão expirada", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_refresh")), "simulated-refresh");
      authMode = "recover";
      await page.getByRole("button", { name: "Atualizar", exact: true }).click();
      await page.getByRole("heading", { name: "dono@example.com", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_access")), "renewed-access");
    });
    await check("Consultas paralelas usam uma única renovação de sessão", async () => {
      refreshes = 0; authMode = "recover";
      await open("/notificacoes", "Notificações");
      await page.getByRole("heading", { name: "dono@example.com", exact: true }).waitFor();
      assert.equal(refreshes, 1);
    });
    await check("Sessão inválida abre login na mesma aba em vez de deixar painel sem dados", async () => {
      authMode = "expired";
      await page.goto(base + "/metricas");
      await page.waitForURL("**/login");
      await page.getByRole("heading", { name: "FolhaPronta · Admin", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_access")), null);
      assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_user")), null);
      authMode = null;
    });
    async function leaveDuringRefresh(mode) {
      authMode = mode;
      const request = page.waitForRequest((req) => req.url().includes("/auth/refresh"));
      await page.goto(base + "/notificacoes"); await request;
      await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await page.waitForURL("**/login");
    }
    await check("Refresh concluído após logout não restaura credenciais antigas", async () => {
      await leaveDuringRefresh("delayed-success");
      const response = page.waitForResponse((reply) => reply.url().includes("/auth/refresh"));
      releaseRefresh(); await response; await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_access")), null);
      assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_refresh")), null);
      assert.equal(new URL(page.url()).pathname, "/login");
    });
    for (const mode of ["delayed-success", "delayed-invalid"]) {
      await check(`Resposta de refresh anterior (${mode}) não altera um novo login`, async () => {
        await leaveDuringRefresh(mode);
        await page.locator('input[type="email"]').fill("novo@example.com");
        await page.locator('input[type="password"]').fill("senha-simulada");
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await page.waitForURL("**/health");
        const response = page.waitForResponse((reply) => reply.url().includes("/auth/refresh"));
        releaseRefresh(); await response; await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_access")), "new-login-access");
        assert.equal(await page.evaluate(() => localStorage.getItem("fp_admin_refresh")), "new-login-refresh");
        assert.equal(new URL(page.url()).pathname, "/health");
      });
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    assert.deepEqual(oldRequestsUsingNewLogin, [], "Requisições da sessão antiga não devem ser repetidas na conta nova");
    process.stdout.write(`PASS ${checks}/${checks} cenários; APIs simuladas, sem e-mails reais.\n`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
