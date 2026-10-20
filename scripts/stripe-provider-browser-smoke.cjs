const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3191';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || 'dist/verification/stripe-provider');
const now = new Date().toISOString();
const end = new Date(Date.now() + 30 * 86400000).toISOString();
const fixtures = [
  ['stripe-active', 'Stripe', 'Active', true, 'sub_active'],
  ['stripe-expired', 'Stripe', 'Expired', false, 'sub_expired'],
  ['stripe-cancelled', 'Stripe', 'Cancelled', false, 'sub_cancelled'],
  ['stripe-pending', 'Stripe', 'PendingPayment', false, null],
  ['mercado-pago', 'MercadoPago', 'Active', true, 'mp_legacy'],
  ['manual-expired', 'Manual', 'Expired', false, null],
].map(([id, provider, status, hasAccess, reference]) => ({
  id, userId: id, userName: `Cliente ${id}`, userEmail: `${id}@example.test`,
  planId: 'plan', planName: 'Mensal', planSlug: 'mensal', monthlyAmount: 29.9, billingFrequencyMonths: 1,
  provider, status, hasAccess, hasProviderAgreement: provider !== 'Manual',
  providerSubscriptionId: reference, stripeSubscriptionId: provider === 'Stripe' ? reference : null,
  mercadoPagoSubscriptionId: provider === 'MercadoPago' ? reference : null,
  stripeCheckoutSessionId: id === 'stripe-pending' ? 'cs_test_pending' : null,
  stripeCustomerId: provider === 'Stripe' ? 'cus_public_reference' : null,
  stripePriceId: provider === 'Stripe' ? 'price_public_reference' : null,
  currentPeriodStart: hasAccess ? now : null, currentPeriodEnd: hasAccess ? end : null,
  canceledAt: status === 'Cancelled' ? now : null, createdAt: now,
}));

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('fp_admin_access', 'mock-admin');
    localStorage.setItem('fp_admin_refresh', 'mock-refresh');
    localStorage.setItem('fp_admin_user', JSON.stringify({ id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'Admin', userType: 1 }));
  });
  const writes = [], unexpected = [], errors = [], checks = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === base) return route.continue();
      return route.abort();
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const reply = json => route.fulfill({ headers, json });
    if (request.method() === 'GET' && url.pathname === '/api/admin/subscriptions') {
      const search = url.searchParams.get('search') || '';
      const items = fixtures.filter(item => item.userEmail.includes(search));
      return reply({ items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 });
    }
    const detail = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (detail && request.method() === 'GET') {
      const subscription = fixtures.find(item => item.userId === detail[1]);
      assert(subscription);
      return reply({ user: { id: subscription.userId, name: subscription.userName, email: subscription.userEmail,
        role: 'User', userType: 1, isActive: true, emailConfirmed: true, createdAt: now, lastLoginAt: now,
        planSlug: 'mensal', subscriptionStatus: subscription.status, isPaidPlan: subscription.hasAccess,
        isTrialActive: false, trialStatus: 'Expired', trialPdfsGenerated: 0 },
        currentSubscription: subscription, totalActivitiesGenerated: 0, activitiesByType: [], classrooms: [], recentActivities: [],
        payments: [{ id: 'payment-stripe', type: 'Subscription', description: 'Pagamento Stripe', provider: 'Stripe',
          stripeInvoiceId: 'in_verified_public', stripePaymentIntentId: 'pi_verified_public', amount: 29.9,
          status: 'Approved', paidAt: now, createdAt: now },
        { id: 'payment-mp', type: 'Subscription', description: 'Pagamento legado', provider: 'MercadoPago',
          mercadoPagoPaymentId: 'mp_payment_public', amount: 29.9, status: 'Approved', paidAt: now, createdAt: now }] });
    }
    if (request.method() === 'POST' && /^\/api\/admin\/subscriptions\/[^/]+\/(cancel|extend)$/.test(url.pathname)) {
      writes.push({ path: url.pathname, body: request.postDataJSON() });
      return reply({});
    }
    if (request.method() === 'GET' && url.pathname === '/api/admin/plans')
      return reply({ items: [{ id: 'plan', name: 'Mensal', slug: 'mensal', monthlyPrice: 29.9, isActive: true }] });
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, headers, json: {} });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync(output, { recursive: true });
  const visible = text => page.locator('main').getByText(text, { exact: true }).filter({ visible: true });
  const list = async (id = '') => {
    await page.goto(`${base}/assinaturas${id ? '?search=' + encodeURIComponent(id + '@example.test') : ''}`);
    await page.getByRole('button', { name: 'Página anterior', exact: true }).waitFor();
  };
  const detail = async id => {
    await page.goto(`${base}/clientes/${id}`);
    await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
    await page.getByRole('heading', { name: 'Assinatura corrente', exact: true }).waitFor();
  };
  const cancel = async (id, expectedImmediate, trigger) => {
    await trigger.click();
    const dialog = page.getByRole('dialog');
    if (expectedImmediate) assert.equal(await dialog.getByRole('checkbox').count(), 0);
    else assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    await dialog.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(writes.at(-1).path, `/api/admin/subscriptions/${id}/cancel`);
    assert.equal(writes.at(-1).body.immediate, expectedImmediate);
  };
  async function check(name, run) { await run(); checks.push({ name, passed: true }); process.stdout.write(`PASS ${name}\n`); }
  try {
    await check('Desktop identifica Stripe, Mercado Pago e administrativo com referências públicas', async () => {
      await list();
      for (const text of ['Stripe', 'Mercado Pago', 'Administrativo', 'sub_active', 'mp_legacy', 'cs_test_pending'])
        assert(await visible(text).first().isVisible());
      await page.screenshot({ path: path.join(output, 'admin-providers-desktop.png'), fullPage: true });
    });
    await check('Stripe expirada e cancelada sem acesso permitem encerramento imediato na tabela', async () => {
      for (const id of ['stripe-expired', 'stripe-cancelled', 'stripe-pending']) {
        await list(id);
        await cancel(id, true, page.getByRole('button', { name: 'Cancelar assinatura', exact: true }));
      }
      await list('manual-expired');
      assert(await page.getByRole('button', { name: 'Sem ação aplicável', exact: true }).isDisabled());
    });
    await check('Plano ativo Stripe e Mercado Pago preservam cancelamento ao fim do período', async () => {
      for (const id of ['stripe-active', 'mercado-pago']) {
        await list(id);
        await cancel(id, false, page.getByRole('button', { name: 'Cancelar assinatura', exact: true }));
      }
    });
    await check('Detalhe conserva concessão e permite encerrar Stripe expirada ou cancelada', async () => {
      for (const id of ['stripe-expired', 'stripe-cancelled']) {
        await detail(id);
        assert(await visible('Stripe').isVisible());
        assert(await visible('cus_public_reference').isVisible());
        assert(await page.getByRole('button', { name: 'Conceder nova assinatura', exact: true }).isVisible());
        await cancel(id, true, page.getByRole('button', { name: 'Encerrar assinatura', exact: true }));
      }
    });
    await check('Detalhe conserva troca, cortesia e identificadores de pagamentos dos dois provedores', async () => {
      await detail('stripe-active');
      for (const name of ['Trocar plano', 'Estender vigência', 'Cancelar'])
        assert(await page.getByRole('button', { name, exact: true }).isVisible());
      await page.getByRole('button', { name: 'Pagamentos', exact: true }).click();
      for (const text of ['Stripe', 'Mercado Pago', 'in_verified_public', 'mp_payment_public', 'Payment Intent: pi_verified_public'])
        assert(await visible(text).isVisible());
      await page.screenshot({ path: path.join(output, 'admin-payment-providers.png'), fullPage: true });
    });
    await check('Celular mostra referências e cancela contrato pendente sem alterar a concessão', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await list();
      for (const text of ['Mercado Pago', 'sub_expired', 'cs_test_pending']) assert(await visible(text).isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'admin-providers-mobile.png'), fullPage: true });
      await list('stripe-pending');
      await cancel('stripe-pending', true, page.getByRole('button', { name: 'Cancelar', exact: true }).filter({ visible: true }));
      await detail('stripe-cancelled');
      assert(await page.getByRole('button', { name: 'Conceder nova assinatura', exact: true }).isVisible());
      await cancel('stripe-cancelled', true, page.getByRole('button', { name: 'Encerrar assinatura', exact: true }));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    fs.writeFileSync(path.join(output, 'admin-stripe-provider-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mockedApi: true, checks, writes }, null, 2));
    process.stdout.write(`PASS ${checks.length}/${checks.length} cenários; API simulada.\n`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
