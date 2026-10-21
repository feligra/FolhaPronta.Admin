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
  const validHealth = { newCheckoutProvider: 'Stripe', stripeNewCheckoutEnabled: true,
    stripeConfigured: true, stripeWebhookConfigured: true, liveMode: true, stripeConfigurationError: null };
  const validCredentials = { expectedEnvironment: 'live', secretKeyType: 'secret', secretKeyEnvironment: 'live',
    publishableKeyEnvironment: 'live', secretKeyHasOuterWhitespace: false, publishableKeyHasOuterWhitespace: false };
  let billingHealth = { ...validHealth };
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
    if (request.method() === 'GET' && url.pathname === '/api/admin/billing/health') return reply(billingHealth);
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
  const plans = async health => {
    billingHealth = health;
    await page.goto(`${base}/planos`);
    await page.getByRole('heading', { name: 'Mensal', exact: true }).waitFor();
  };
  const diagnosis = () => page.getByRole('alert', { name: 'Diagnóstico de pagamentos', exact: true });
  try {
    await check('Planos distingue chave secreta ausente na API e orienta alias existente', async () => {
      await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: 'Stripe secret key is missing.',
        stripeCredentialDiagnostics: { ...validCredentials, secretKeyType: 'missing', secretKeyEnvironment: 'unknown' } });
      await diagnosis().waitFor();
      const body = await diagnosis().innerText();
      assert(body.includes('A API não recebeu a chave secreta.')); assert(body.includes('Ausente na API'));
      assert(body.includes('STRIPE_SECRET do GitHub Actions')); assert(body.includes('ao contêiner da API'));
      assert(body.includes('Credenciais recebidas pela API')); assert(body.includes('Produção')); assert(body.includes('Não identificado'));
      assert(await page.getByRole('button', { name: 'Novo plano', exact: true }).isEnabled());
    });
    await check('Planos mostra ambientes esperado e recebido sem expor valores ou extras de credenciais', async () => {
      await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: 'Stripe secret key must match the configured environment.',
        stripeCredentialDiagnostics: { ...validCredentials, secretKeyEnvironment: 'test', unsafeValue: 'sk_test_must_never_render' } });
      await diagnosis().waitFor();
      const credentials = diagnosis().locator('[data-stripe-credentials]');
      assert((await credentials.innerText()).includes('Ambiente esperado')); assert((await credentials.innerText()).includes('Produção'));
      assert((await credentials.innerText()).includes('Teste')); assert((await credentials.innerText()).includes('chave secreta padrão'));
      assert(!(await page.locator('body').innerText()).includes('sk_test_must_never_render'));
      await page.screenshot({ path: path.join(output, 'stripe-credential-diagnostics-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'stripe-credential-diagnostics-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await check('Formato inválido é explicado separadamente de chave ausente e ambiente diferente', async () => {
      await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: 'Stripe secret key has an invalid format.',
        stripeCredentialDiagnostics: { ...validCredentials, secretKeyType: 'invalid', secretKeyEnvironment: 'unknown' } });
      await diagnosis().waitFor();
      const body = await diagnosis().innerText();
      assert(body.includes('A API recebeu uma chave secreta em formato inválido.'));
      assert(body.includes('Presente · formato inválido')); assert(body.includes('sk_ ou restrita rk_'));
      assert(!body.includes('A chave recebida pela API pertence a outro ambiente.'));
    });
    await check('Chave restrita compatível e espaços externos normalizados permanecem visíveis sem alerta de falha', async () => {
      await plans({ ...validHealth, stripeCredentialDiagnostics: { ...validCredentials, secretKeyType: 'restricted',
        secretKeyHasOuterWhitespace: true, publishableKeyHasOuterWhitespace: true } });
      const status = page.getByRole('status', { name: 'Diagnóstico de pagamentos', exact: true }); await status.waitFor();
      const body = await status.innerText();
      assert(body.includes('Presente · chave restrita')); assert(body.includes('A API removeu esses espaços externos'));
      assert(body.includes('não confirma conexão com a Stripe')); assert.equal(await diagnosis().count(), 0);
    });
    await check('Chave pública ausente ou inválida recebe orientação precisa para STRIPE_PUBLIC', async () => {
      for (const [error, expected] of [
        ['Stripe publishable key is missing.', 'Ausente na API'],
        ['Stripe publishable key has an invalid format.', 'Presente · formato inválido'],
      ]) {
        await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: error,
          stripeCredentialDiagnostics: { ...validCredentials, publishableKeyEnvironment: 'unknown' } });
        await diagnosis().waitFor(); const body = await diagnosis().innerText();
        assert(body.includes(expected)); assert(body.includes('STRIPE_PUBLIC'));
        assert(body.includes('STRIPE_PUBLISHABLE_KEY também é aceito'));
      }
    });
    await check('Ambiente público desconhecido não é apresentado como chave ausente sem evidência', async () => {
      await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: 'Stripe secret key is missing.',
        stripeCredentialDiagnostics: { ...validCredentials, secretKeyType: 'missing', secretKeyEnvironment: 'unknown', publishableKeyEnvironment: 'unknown' } });
      await diagnosis().waitFor();
      assert((await diagnosis().innerText()).includes('Presença ou formato não identificado'));
    });
    await check('Resposta de API antiga sem diagnóstico de credenciais continua compatível', async () => {
      await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: 'Stripe billing currency must be BRL.' });
      await diagnosis().waitFor(); assert((await diagnosis().innerText()).includes('Stripe__Currency=brl'));
      assert.equal(await page.locator('[data-stripe-credentials]').count(), 0);
      for (const error of ['Stripe secret key must match the configured environment.', 'Stripe publishable key must match the configured environment.']) {
        await plans({ ...validHealth, stripeConfigured: false, stripeConfigurationError: error });
        await diagnosis().waitFor(); const body = await diagnosis().innerText();
        assert(body.includes('não distingue chave ausente, formato inválido e ambiente incompatível'));
        assert(body.includes('Publique a versão atualizada da API'));
        assert(!body.includes('A chave recebida pela API pertence a outro ambiente.'));
      }
      await plans(validHealth); await page.getByRole('button', { name: 'Novo plano', exact: true }).waitFor();
      assert.equal(await page.locator('[data-stripe-credentials]').count(), 0); assert.equal(await diagnosis().count(), 0);
    });
    await check('Payload de credenciais inválido falha sem refletir valores e mantém catálogo utilizável', async () => {
      for (const invalid of [
        { ...validCredentials, secretKeyType: '<img src=x onerror="window.__diagXss=1">' },
        { ...validCredentials, expectedEnvironment: 'sk_live_must_never_render' },
        { ...validCredentials, publishableKeyHasOuterWhitespace: 'true' },
        [],
      ]) {
        await plans({ ...validHealth, stripeCredentialDiagnostics: invalid });
        await page.getByText('Diagnóstico de pagamentos indisponível', { exact: true }).waitFor();
        assert(await page.getByRole('button', { name: 'Novo plano', exact: true }).isEnabled());
        assert(!(await page.locator('body').innerText()).includes('sk_live_must_never_render'));
        assert.equal(await page.evaluate(() => window.__diagXss), undefined);
      }
      await plans({ ...validHealth, stripeCredentialDiagnostics: validCredentials });
      await page.getByText('Configuração local de pagamentos', { exact: true }).waitFor();
    });
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
