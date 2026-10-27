/* Local-only: delayed administrative actions must not mutate another detail/modal. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3193';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '../output/admin-subscriptions-2026-10-27/double-check/detail-action-race');
const now = new Date().toISOString(), end = new Date(Date.now() + 86400000).toISOString();
function detail(id) {
  return { user: { id, name: `Cliente ${id}`, email: `${id}@example.invalid`, role: 'User', userType: 1,
    isActive: true, emailConfirmed: true, createdAt: now, trialStatus: 'Subscribed', trialEndsAt: null,
    trialPdfsGenerated: 0, isPaidPlan: true, isTrialActive: false },
    currentSubscription: { id: `sub-${id}`, planId: 'p1', planName: 'Mensal', planSlug: 'mensal', monthlyAmount: 29.9,
      provider: 'Manual', status: 'Active', rawStatus: 'Active', canExtend: true, canCancel: true, canCancelRenewal: false,
      hasAccess: true, currentPeriodStart: now, currentPeriodEnd: end, createdAt: now },
    payments: [], classrooms: [], activitiesByType: [], totalActivitiesGenerated: 0, recentActivities: [] };
}
const plans = ['p1', 'p2'].map((id, i) => ({ id, name: i ? 'Anual' : 'Mensal', slug: id,
  monthlyPrice: 29.9, isActive: true, billingFrequencyMonths: 1 }));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const results = [], errors = [], unexpected = [];
  try {
    for (const kind of ['cancel', 'extend', 'change', 'grant', 'same-user-new-modal', 'normal-completion'].filter(x => !process.env.TEST_CASE || x === process.env.TEST_CASE)) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
      await context.addInitScript(() => {
        localStorage.setItem('fp_admin_access', 'mock-admin'); localStorage.setItem('fp_admin_refresh', 'mock-refresh');
        localStorage.setItem('fp_admin_user', JSON.stringify({ id: 'admin', role: 'Admin', name: 'Admin', email: 'admin@example.invalid' }));
      });
      let release, heldPath, mutations = 0, readPaths = [];
      await context.route('**/*', async route => {
        const r = route.request(), u = new URL(r.url());
        if (!u.pathname.startsWith('/api/')) return u.origin === base ? route.continue() : route.abort();
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
        if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (r.method() === 'POST' && /\/(cancel|extend|change-plan|grant-subscription)$/.test(u.pathname)) {
          mutations++; heldPath = u.pathname;
          await new Promise(resolve => { release = resolve; });
          return route.fulfill({ status: kind === 'grant' ? 200 : 204, headers,
            ...(kind === 'grant' ? { json: { subscriptionId: 'grant-A', currentPeriodEnd: end, emailStatus: 'not_requested' } } : {}) });
        }
        if (r.method() === 'GET' && u.pathname === '/api/admin/users')
          return route.fulfill({ headers, json: { items: ['A','B'].map(id => ({ ...detail(id).user, subscriptionStatus: 'Active', subscriptionEndsAt: end, totalActivitiesGenerated: 0 })), page: 1, pageSize: 20, totalCount: 2, totalPages: 1 } });
        if (r.method() === 'GET' && /^\/api\/admin\/users\/[AB]$/.test(u.pathname)) {
          readPaths.push(u.pathname);
          const body = detail(u.pathname.at(-1));
          if (kind === 'grant' && body.user.id === 'A') { body.currentSubscription = null; body.user.isPaidPlan = false; body.user.trialStatus = 'Expired'; }
          return route.fulfill({ headers, json: body });
        }
        if (r.method() === 'GET' && u.pathname === '/api/admin/plans') return route.fulfill({ headers, json: { items: plans } });
        unexpected.push(`${r.method()} ${u.pathname}`); return route.fulfill({ status: 404, headers, json: {} });
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      page.setDefaultTimeout(5000);
      try {
        await page.goto(base + '/clientes/B'); await page.getByRole('heading', { name: 'Cliente B', exact: true }).waitFor();
        await page.locator('main').getByRole('link', { name: 'Clientes', exact: true }).click();
        await page.getByText('Cliente A', { exact: true }).filter({ visible: true }).click();
        await page.getByRole('heading', { name: 'Cliente A', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
        const action = ['same-user-new-modal', 'normal-completion'].includes(kind) ? 'extend' : kind;
        const names = { cancel: 'Cancelar', extend: 'Estender vigência', change: 'Trocar plano', grant: 'Conceder assinatura' };
        await page.getByRole('button', { name: names[action], exact: true }).click();
        const modal = page.getByRole('dialog'); await modal.waitFor();
        if (action === 'grant' || action === 'change') await modal.locator('select').selectOption(action === 'grant' ? 'p1' : 'p2');
        await modal.getByRole('button', { name: action === 'grant' ? 'Conceder por 30d' : action === 'extend' ? 'Estender por 30d' : action === 'change' ? 'Trocar plano' : 'Confirmar cancelamento', exact: true }).click();
        await page.waitForFunction(() => true); // allow the request interception to run
        for (let n = 0; n < 100 && !release; n++) await new Promise(resolve => setTimeout(resolve, 10));
        assert(release, 'Mutation did not reach the mocked API'); assert.equal(mutations, 1);
        const completed = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === heldPath);
        if (kind === 'normal-completion') {
          const reads = readPaths.length; release(); release = null;
          await completed;
          await modal.waitFor({ state: 'hidden' });
          await page.waitForTimeout(150); assert(readPaths.length > reads, 'Current action should refresh its own detail');
        } else {
          if (kind === 'same-user-new-modal') await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
          else { await page.evaluate(() => history.go(-2)); await page.getByRole('heading', { name: 'Cliente B', exact: true }).waitFor(); }
          await page.getByRole('button', { name: 'Assinatura', exact: true }).click();
          await page.getByRole('button', { name: 'Estender vigência', exact: true }).click();
          const nextModal = page.getByRole('dialog'); await nextModal.waitFor();
          await nextModal.locator('textarea').fill('Manter esta ação aberta');
          const reads = readPaths.length;
          release(); release = null; await completed; await page.waitForTimeout(250);
          assert.equal(await nextModal.count(), 1, 'Late action must not close the new modal');
          assert.equal(await nextModal.locator('textarea').inputValue(), 'Manter esta ação aberta');
          assert.equal(readPaths.length, reads, 'Late action must not fetch the old customer or replace current detail');
          assert.equal(await page.getByText('Assinatura concedida até', { exact: false }).count(), 0, 'No grant notice from previous customer');
        }
        results.push({ kind, passed: true, heldPath });
        console.log('PASS ' + kind);
      } catch (e) {
        results.push({ kind, passed: false, error: e.message, heldPath });
        console.log('FAIL ' + kind + ': ' + e.message);
        await page.screenshot({ path: path.join(output, kind + '-failure.png'), fullPage: true });
      } finally { release?.(); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ results, errors, unexpected }, null, 2)); }
  console.log(JSON.stringify({ passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, errors, unexpected }));
  if (results.some(x => !x.passed) || errors.length || unexpected.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
