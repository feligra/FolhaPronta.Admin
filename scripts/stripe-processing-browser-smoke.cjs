const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3192';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || 'dist/verification/stripe-processing');
const now = new Date().toISOString();
const progress = { subscriptionId: 'checkout-new', planName: 'Premium mensal', amount: 29.9,
  currency: 'BRL', status: 'AwaitingConfirmation', completedAt: now, canCancel: false };
const subscription = { id: 'checkout-new', userId: 'customer', userName: 'Cliente de teste',
  userEmail: 'cliente@example.test', planId: 'premium', planName: 'Premium mensal', planSlug: 'premium',
  monthlyAmount: 29.9, provider: 'Stripe', hasProviderAgreement: true,
  stripeCheckoutSessionId: 'cs_test_verified', status: 'PendingPayment', hasAccess: false,
  currentPeriodStart: null, currentPeriodEnd: null, canceledAt: null, createdAt: now };
const payment = { id: 'payment-real', subscriptionId: subscription.id, type: 'Subscription',
  status: 'InProcess', amount: 29.9, currency: 'BRL', provider: 'Stripe',
  stripeInvoiceId: 'in_verified', stripePaymentIntentId: 'pi_verified',
  description: 'Assinatura Premium mensal', createdAt: now, paidAt: null };
let detail = { user: { id: 'customer', name: 'Cliente de teste', email: 'cliente@example.test',
  role: 'User', userType: 1, isActive: true, emailConfirmed: true, createdAt: now,
  subscriptionStatus: 'PendingPayment', isPaidPlan: false, trialStatus: 'Expired', trialPdfsGenerated: 0 },
  currentSubscription: subscription, checkoutProgress: progress, payments: [],
  totalActivitiesGenerated: 0, activitiesByType: [], recentActivities: [], classrooms: [] };
let items = [{ ...subscription, checkoutProgress: progress }];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('fp_admin_access', 'mock-admin');
    localStorage.setItem('fp_admin_refresh', 'mock-refresh');
    localStorage.setItem('fp_admin_user', JSON.stringify({ id: 'admin', role: 'Admin', name: 'Admin', email: 'admin@example.test' }));
  });
  const errors = [], unexpected = [], checks = [];
  let detailReads = 0;
  let holdDetail = false, releaseDetail, notifyDetailHeld;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.origin === base ? route.continue() : route.abort();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (request.method() === 'GET' && url.pathname === '/api/admin/users/customer') {
      detailReads++;
      const response = detail;
      if (holdDetail) {
        holdDetail = false;
        await new Promise(resolve => { releaseDetail = resolve; notifyDetailHeld(); });
      }
      return route.fulfill({ headers, json: response });
    }
    if (request.method() === 'GET' && url.pathname === '/api/admin/subscriptions')
      return route.fulfill({ headers, json: { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 } });
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, headers, json: {} });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  const history = () => page.getByRole('heading', { name: 'Pagamentos (1)', exact: true }).locator('..');
  const tick = async () => { await page.clock.runFor(3_100); };
  async function check(name, run) { await run(); checks.push({ name, passed: true }); process.stdout.write(`PASS ${name}\n`); }
  try {
    await check('Checkout verificado aparece no histórico antes de a fatura chegar', async () => {
      await page.goto(`${base}/clientes/customer`);
      await page.getByText('Pagamento em processamento', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Pagamentos', exact: true }).click();
      await history().locator('[data-processing-checkout]').waitFor();
      assert.equal(await history().locator('li').count(), 1);
      assert((await history().innerText()).includes('R$ 29,90'));
      assert.equal(await history().getByText('Aprovado', { exact: true }).count(), 0);
      await page.clock.runFor(250);
      await page.screenshot({ path: path.join(output, 'processing-desktop.png'), fullPage: true });
    });
    await check('Aba Assinatura também identifica checkout concluído como em processamento', async () => {
      await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
      const section = page.getByRole('heading', { name: 'Assinatura corrente', exact: true }).locator('..');
      assert.equal(await section.getByText('Em processamento', { exact: true }).count(), 1);
      assert.equal(await section.getByText('Pagamento pendente', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Cancelar tentativa', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Pagamentos', exact: true }).click();
    });
    await check('Fatura real substitui tentativa sem duplicar a transação', async () => {
      detail = { ...detail, payments: [{ ...payment, status: 'Pending' }] };
      await tick();
      await history().getByText('in_verified', { exact: true }).waitFor();
      assert.equal(await history().locator('[data-processing-checkout]').count(), 0);
      assert.equal(await history().locator('li').count(), 1);
      assert.equal(await history().getByText('Em processamento', { exact: true }).count(), 1);
    });
    await check('Confirmação atualiza histórico automaticamente sem recarregar ou trocar aba', async () => {
      detail = { ...detail, checkoutProgress: null,
        currentSubscription: { ...subscription, status: 'Active', hasAccess: true },
        payments: [{ ...payment, status: 'Approved', paidAt: now }] };
      await tick();
      await history().getByText('Aprovado', { exact: true }).waitFor();
      assert.equal(await page.getByText('Pagamento em processamento', { exact: true }).count(), 0);
      assert.equal(await history().locator('li').count(), 1);
    });
    await check('Falha verificada substitui processamento sem inventar aprovação', async () => {
      detail = { ...detail, checkoutProgress: { ...progress, status: 'PaymentFailed' },
        currentSubscription: subscription,
        payments: [{ ...payment, status: 'Rejected', failureReason: 'Pagamento não confirmado pela Stripe.' }] };
      await tick();
      await page.getByText('Pagamento não confirmado', { exact: true }).waitFor();
      assert.equal(await history().locator('[data-processing-checkout]').count(), 0);
      assert.equal(await history().locator('li').count(), 1);
      assert.equal(await history().getByText('Em processamento', { exact: true }).count(), 0);
      assert.equal(await history().getByText('Aprovado', { exact: true }).count(), 0);
    });
    await check('Aba Assinatura distingue pagamento não confirmado de processamento', async () => {
      await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
      const section = page.getByRole('heading', { name: 'Assinatura corrente', exact: true }).locator('..');
      assert.equal(await section.getByText('Pagamento não confirmado', { exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Pagamentos', exact: true }).click();
    });
    await check('Nova contratação em processamento preserva assinatura vigente', async () => {
      const old = { ...subscription, id: 'paid-old', planName: 'Plano vigente', status: 'Active', hasAccess: true };
      detail = { ...detail, currentSubscription: old, checkoutProgress: progress, payments: [] };
      await tick();
      await page.getByText('Pagamento em processamento', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
      await page.getByText('Plano vigente', { exact: true }).waitFor();
      assert.equal(detail.currentSubscription.hasAccess, true);
      items = [{ ...old, checkoutProgress: progress }];
      await page.goto(`${base}/assinaturas`);
      await page.getByText('Nova contratação em processamento: Premium mensal', { exact: true }).filter({ visible: true }).waitFor();
    });
    await check('Consulta em andamento não troca a assinatura alvo de um modal administrativo', async () => {
      await page.goto(`${base}/clientes/customer`);
      await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
      await page.getByText('Plano vigente', { exact: true }).waitFor();
      const previousDetail = detail;
      detail = { ...detail, currentSubscription: { ...subscription, status: 'Active', hasAccess: true }, checkoutProgress: null };
      const detailHeld = new Promise(resolve => { notifyDetailHeld = resolve; });
      holdDetail = true;
      await tick();
      await detailHeld;
      assert.equal(typeof releaseDetail, 'function');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      releaseDetail();
      await page.clock.runFor(100);
      const reads = detailReads;
      await tick();
      assert.equal(detailReads, reads);
      assert.equal(await page.getByText('Plano vigente', { exact: true }).count(), 1);
      await page.getByRole('dialog').getByRole('button', { name: 'Voltar', exact: true }).click();
      await tick();
      await page.getByText('Premium mensal', { exact: true }).waitFor();
      detail = previousDetail;
      await page.goto(`${base}/assinaturas`);
      await page.getByText('Nova contratação em processamento: Premium mensal', { exact: true }).filter({ visible: true }).waitFor();
    });
    await check('Lista de assinaturas acompanha o desfecho automaticamente', async () => {
      items = [{ ...subscription, status: 'Active', hasAccess: true, checkoutProgress: null }];
      await tick();
      await page.getByText('Premium mensal', { exact: true }).filter({ visible: true }).waitFor();
      assert.equal(await page.getByText('Nova contratação em processamento: Premium mensal', { exact: true }).count(), 0);
    });
    await check('Processamento cabe no celular e pausa consultas na aba oculta', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/clientes/customer`);
      await page.getByRole('button', { name: 'Pagamentos', exact: true }).click();
      await history().locator('[data-processing-checkout]').waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.clock.runFor(250);
      await page.screenshot({ path: path.join(output, 'processing-mobile.png'), fullPage: true });
      await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
      const reads = detailReads;
      await tick();
      assert.equal(detailReads, reads);
    });
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors, unexpected }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
