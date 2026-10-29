/* Read-only customer children smoke. Every API request uses local fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Felipe/Desktop/repos/.task-tools/browser-tools/node_modules/playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3193';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '../output/admin-children-2026-10-29');
const initialChildren = [{ id: 'child-A1', fullName: 'Maria Oliveira', nickname: 'Mari' }, { id: 'child-A2', fullName: 'João Oliveira', nickname: null }];
function detail(id, options = {}) {
  const result = { user: { id, name: `Cliente ${id}`, email: `${id}@example.invalid`, role: 'User', userType: options.userType ?? 0,
    isActive: options.active ?? true, emailConfirmed: true, createdAt: '2026-10-01T12:00:00Z', trialStatus: 'Expired', trialEndsAt: null,
    trialPdfsGenerated: 0, isPaidPlan: false, isTrialActive: false }, currentSubscription: null, payments: [], classrooms: [],
    activitiesByType: [], totalActivitiesGenerated: 0, recentActivities: [] };
  if (!options.legacy) result.children = options.children ?? structuredClone(initialChildren);
  return result;
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || 'C:/Users/Felipe/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe' });
  const checks = [], errors = [], unexpected = [], mutations = [];
  async function check(name, options, run) {
    const context = await browser.newContext({ viewport: { width: options.width || 1440, height: 900 } });
    const state = { customers: { A: detail('A', options), B: detail('B', { children: [{ id: 'child-B', fullName: 'Carolina Souza', nickname: 'Carol' }] }) }, delayB: false, releaseB: null, startedB: null, delayA: false, releaseA: null, startedA: null };
    await context.addInitScript(() => {
      localStorage.setItem('fp_admin_access', 'local-admin'); localStorage.setItem('fp_admin_refresh', 'local-refresh');
      localStorage.setItem('fp_admin_user', JSON.stringify({ id: 'admin', role: 'Admin', name: 'Admin', email: 'admin@example.invalid' }));
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return url.origin === base ? route.continue() : route.abort();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() !== 'GET') mutations.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === '/api/admin/users') return route.fulfill({ headers, json: { items: Object.values(state.customers).map(item => ({ ...item.user, subscriptionStatus: null, subscriptionEndsAt: null, totalActivitiesGenerated: 0 })), page: 1, pageSize: 20, totalCount: 2, totalPages: 1 } });
      const match = url.pathname.match(/^\/api\/admin\/users\/([AB])$/);
      if (match) {
        if (match[1] === 'A' && state.delayA) { state.startedA?.(); await new Promise(resolve => { state.releaseA = resolve; }); }
        if (match[1] === 'B' && state.delayB) { state.startedB?.(); await new Promise(resolve => { state.releaseB = resolve; }); }
        return route.fulfill({ headers, json: state.customers[match[1]] });
      }
      unexpected.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 404, headers, json: {} });
    });
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    const result = { name, passed: false, evidence: {} };
    try {
      await page.goto(base + '/clientes/A'); await page.getByRole('heading', { name: 'Cliente A', exact: true }).waitFor();
      const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Filhos cadastrados', exact: true }) });
      await run({ page, section, state }, result.evidence); result.passed = true; console.log(`PASS ${name}`);
    } catch (error) { result.error = error.message; console.log(`FAIL ${name}: ${error.message}`); }
    finally {
      result.screenshot = `case-${checks.length + 1}.png`;
      await page.screenshot({ path: path.join(output, result.screenshot), fullPage: true }).catch(() => {});
      state.releaseA?.(); state.releaseB?.(); await context.close(); checks.push(result);
    }
  }
  try {
    await check('Pai com dois filhos mostra nomes completos, apelido e contador', {}, async ({ page, section }, evidence) => {
      await section.getByText('Maria Oliveira', { exact: true }).waitFor();
      await section.getByText('Apelido: Mari', { exact: true }).waitFor();
      await section.getByText('João Oliveira', { exact: true }).waitFor();
      assert.equal(await section.locator('li').count(), 2);
      assert.equal(await section.locator('button,a,input').count(), 0);
      await section.getByText('2 crianças cadastradas neste cliente.', { exact: true }).waitFor();
      const summary = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Resumo de uso', exact: true }) });
      const count = summary.getByText('Filhos cadastrados', { exact: true }).locator('..');
      assert.equal(await count.locator('p').last().textContent(), '2'); evidence.text = await section.textContent();
    });
    await check('Pai sem filhos exibe estado vazio', { children: [] }, async ({ section }) => {
      await section.getByText('Este cliente ainda não cadastrou filhos.', { exact: true }).waitFor(); assert.equal(await section.locator('li').count(), 0);
    });
    await check('Professor sem cadastro familiar não mostra seção', { userType: 1, children: [] }, async ({ section }) => assert.equal(await section.count(), 0));
    await check('Professor com cadastro familiar legado mostra os filhos', { userType: 1 }, async ({ section }) => {
      await section.getByText('Maria Oliveira', { exact: true }).waitFor(); assert.equal(await section.locator('li').count(), 2);
    });
    await check('Conta de responsável desativada mantém filhos legíveis para admin', { active: false }, async ({ page, section }) => {
      await page.locator('main header').getByText('Conta desativada', { exact: true }).first().waitFor(); await section.getByText('Maria Oliveira', { exact: true }).waitFor();
    });
    await check('Payload antigo sem children continua compatível', { legacy: true }, async ({ section }) => {
      await section.getByText('Este cliente ainda não cadastrou filhos.', { exact: true }).waitFor();
    });
    for (const width of [320, 390, 1440]) {
      const children = [{ id: 'long', fullName: 'NomeMuitoLongoSemEspacos'.repeat(8), nickname: 'Apelido'.repeat(8) }];
      await check(`Nomes longos em${width}px respeitam os limites do layout`, { width, children }, async ({ page, section }, evidence) => {
        await section.getByText(children[0].fullName, { exact: true }).waitFor();
        await section.scrollIntoViewIfNeeded();
        evidence.geometry = await section.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
          items: Array.from(el.querySelectorAll('li,li p')).map(item => ({ width: item.clientWidth, scrollWidth: item.scrollWidth })) }));
        assert(evidence.geometry.documentWidth <= width + 1); assert(evidence.geometry.scrollWidth <= evidence.geometry.width + 1);
        assert(evidence.geometry.items.every(item => item.scrollWidth <= item.width + 1));
        assert.equal(await section.locator('li').count(), 1);
      });
    }
    await check('Troca de cliente não mantém nomes do responsável anterior', {}, async ({ page, section, state }, evidence) => {
      await section.getByText('Maria Oliveira', { exact: true }).waitFor();
      await page.locator('main').getByRole('link', { name: 'Clientes', exact: true }).click();
      state.delayB = true;
      const started = new Promise(resolve => { state.startedB = resolve; });
      await page.getByText('Cliente B', { exact: true }).filter({ visible: true }).click(); await started;
      assert.equal(await page.getByText('Maria Oliveira', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Apelido: Mari', { exact: true }).count(), 0);
      state.releaseB(); state.releaseB = null;
      await page.getByRole('heading', { name: 'Cliente B', exact: true }).waitFor();
      await section.getByText('Carolina Souza', { exact: true }).waitFor();
      assert.equal(await page.getByText('Maria Oliveira', { exact: true }).count(), 0);
      assert.equal(await section.locator('li').count(), 1); evidence.text = await section.textContent();
    });
    await check('Atualização ao voltar para a aba reflete renomeação e remoção dos filhos', {}, async ({ page, section, state }) => {
      await page.clock.install();
      await page.clock.fastForward(600);
      state.customers.A.children = [{ id: 'child-A1', fullName: 'Mariana Oliveira', nickname: 'Nana' }];
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await section.getByText('Mariana Oliveira', { exact: true }).waitFor();
      await section.getByText('Apelido: Nana', { exact: true }).waitFor();
      await section.getByText('1 criança cadastrada neste cliente.', { exact: true }).waitFor();
      assert.equal(await section.getByText('Maria Oliveira', { exact: true }).count(), 0);
      assert.equal(await section.getByText('João Oliveira', { exact: true }).count(), 0);
      state.customers.A.children = [];
      await page.clock.fastForward(600);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await section.getByText('Este cliente ainda não cadastrou filhos.', { exact: true }).waitFor();
      const summary = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Resumo de uso', exact: true }) });
      assert.equal(await summary.getByText('Filhos cadastrados', { exact: true }).locator('..').locator('p').last().textContent(), '0');
    });
    await check('Resposta antiga de atualização não substitui os filhos de outro cliente', {}, async ({ page, section, state }) => {
      await page.clock.install(); await page.clock.fastForward(600);
      state.delayA = true;
      const started = new Promise(resolve => { state.startedA = resolve; });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('Background refresh did not start')), 5000))]);
      await page.locator('main').getByRole('link', { name: 'Clientes', exact: true }).click();
      await page.getByText('Cliente B', { exact: true }).filter({ visible: true }).click();
      await section.getByText('Carolina Souza', { exact: true }).waitFor();
      const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/users/A');
      state.releaseA(); state.releaseA = null; await oldResponse; await page.waitForTimeout(100);
      assert.equal(await section.getByText('Maria Oliveira', { exact: true }).count(), 0);
      assert.equal(await section.getByText('Carolina Souza', { exact: true }).count(), 1);
    });
    const literalName = '<img src=x onerror=window.childNameExecuted=true>';
    await check('Nome e apelido são exibidos como texto, sem interpretar HTML', { children: [{ id: 'literal', fullName: literalName, nickname: '<script>teste</script>' }] }, async ({ page, section }) => {
      await section.getByText(literalName, { exact: true }).waitFor();
      await section.getByText('Apelido: <script>teste</script>', { exact: true }).waitFor();
      assert.equal(await section.locator('img,script').count(), 0);
      assert.equal(await page.evaluate(() => window.childNameExecuted), undefined);
    });
  } finally {
    await browser.close();
    const sourceHashes = Object.fromEntries(['src/pages/CustomerDetailPage.tsx', 'src/types/index.ts'].map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: checks.filter(check => check.passed).length, total: checks.length, checks, errors, unexpected, mutations, realApiRequests: 0, sourceHashes }, null, 2));
  }
  if (checks.some(check => !check.passed) || errors.length || unexpected.length || mutations.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
