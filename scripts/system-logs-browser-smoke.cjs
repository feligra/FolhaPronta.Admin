const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3191';
const port = Number(process.env.TEST_API_PORT || 5997);
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '../output/system-logs/admin');
const checks = [], pageErrors = [], unexpected = [];
const item = (id, extra = {}) => ({ id, timestamp: '2026-10-20T15:30:00Z', level: 'Information',
  source: 'FolhaPronta.API.Checkout', message: `Registro sintético ${id}`, exceptionType: null,
  properties: { Operation: 'Checkout', RequestId: `synthetic-${id}` }, ...extra });
const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => item(start + index));
async function until(test, message = 'condition', timeout = 15000) {
  const end = Date.now() + timeout;
  while (!test()) { if (Date.now() > end) throw new Error(`Timeout: ${message}`); await new Promise(resolve => setTimeout(resolve, 20)); }
}

class FakeLogs {
  constructor() {
    this.items = range(1, 150); this.calls = []; this.pending = []; this.held = [];
    this.instanceId = '11111111-1111-1111-1111-111111111111';
    this.liveErrors = []; this.listErrors = []; this.holdList = false; this.persistenceAvailable = true;
    this.resetRequired = false; this.aborted = 0; this.refreshes = 0; this.expectedToken = 'synthetic-admin-logs';
    this.hangNextLive = false;
    this.authExpired = false; this.refreshFails = false;
  }
  metadata() { return { instanceId: this.instanceId, capacity: 5000, retentionDays: 7,
    oldestAvailableAt: this.items[0]?.timestamp || null, droppedCount: 0, persistenceAvailable: this.persistenceAvailable }; }
  matching(url) {
    const search = (url.searchParams.get('search') || '').toLowerCase(), level = url.searchParams.get('level');
    return this.items.filter(entry => (!level || entry.level === level)
      && [entry.source, entry.message, entry.exceptionType || '', ...Object.keys(entry.properties), ...Object.values(entry.properties)]
        .join(' ').toLowerCase().includes(search));
  }
  payload(url, live = false) {
    const limit = Number(url.searchParams.get('limit') || 100), highwater = Math.max(0, ...this.items.map(entry => entry.id));
    let candidates = this.matching(url);
    if (live) {
      candidates = candidates.filter(entry => entry.id > Number(url.searchParams.get('after') || 0)).sort((a,b) => a.id-b.id);
      const items = candidates.slice(0, limit), hasMore = candidates.length > limit;
      return { ...this.metadata(), items, nextBefore: null, cursor: hasMore ? items.at(-1).id : highwater, hasMore, resetRequired: this.resetRequired };
    }
    if (url.searchParams.has('before')) candidates = candidates.filter(entry => entry.id < Number(url.searchParams.get('before')));
    candidates.sort((a,b) => b.id-a.id);
    const items = candidates.slice(0, limit);
    return { ...this.metadata(), items, nextBefore: candidates.length > limit ? items.at(-1).id : null, cursor: highwater };
  }
  append(items) { this.items.push(...items); this.flush(); }
  flush(force = false) {
    for (const pending of [...this.pending]) {
      const body = this.payload(pending.url, true);
      if (force || body.items.length || body.resetRequired || body.instanceId !== pending.instanceId) pending.send(body);
    }
  }
  replyLive(body, status = 200) {
    assert(this.pending.length, 'Expected pending long poll');
    this.pending[0].send(body || this.payload(this.pending[0].url, true), status);
  }
  handle(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Access-Control-Allow-Origin', new URL(base).origin);
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const send = (body, status = 200) => { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/api/auth/refresh') {
      this.refreshes++;
      if (this.refreshFails) return send({ error: { message: 'synthetic-secret-must-not-render' } }, 401);
      this.expectedToken = 'synthetic-refreshed'; this.authExpired = false;
      return send({ accessToken: this.expectedToken, refreshToken: 'synthetic-refresh-new' });
    }
    if (url.pathname === '/api/admin/plans') return send({ items: [], totalActivityTypes: 0 });
    if (url.pathname === '/api/admin/billing/health') return send({ newCheckoutProvider: 'Stripe', stripeConfigured: true,
      stripeNewCheckoutEnabled: true, stripeWebhookConfigured: true, liveMode: false, stripeConfigurationError: null });
    if (!['/api/admin/logs', '/api/admin/logs/live'].includes(url.pathname)) {
      unexpected.push(`${req.method} ${url.pathname}`); return send({}, 404);
    }
    this.calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), token: req.headers.authorization, time: Date.now() });
    assert(!url.href.includes('synthetic-admin') && !url.searchParams.has('token') && !url.searchParams.has('access_token'));
    assert.equal(req.headers.authorization, `Bearer ${this.expectedToken}`);
    if (this.authExpired) return send({ error: { message: 'expired' } }, 401);
    const live = url.pathname.endsWith('/live'), errors = live ? this.liveErrors : this.listErrors;
    if (errors.length) return send({ error: { message: 'synthetic-secret-must-not-render' } }, errors.shift());
    const body = this.payload(url, live);
    if (!live && this.holdList) { this.holdList = false; this.held.push(() => send(body)); return; }
    if (!live || body.items.length || body.resetRequired) return send(body);
    const pending = { url, instanceId: this.instanceId, send: null };
    let finished = false;
    const remove = () => { this.pending = this.pending.filter(entry => entry !== pending); clearTimeout(timer); };
    pending.send = (data, status = 200) => { finished = true; remove(); send(data, status); };
    const timer = this.hangNextLive ? null : setTimeout(() => pending.send(this.payload(url, true)), 20000);
    this.hangNextLive = false;
    res.on('close', () => { if (!finished) this.aborted++; remove(); });
    this.pending.push(pending);
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  let fixture = new FakeLogs();
  const server = http.createServer((req, res) => fixture.handle(req, res));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  let context, page;
  const rows = () => page.locator('[data-log-id]');
  const waitCount = count => page.waitForFunction(expected => document.querySelectorAll('[data-log-id]').length === expected, count);
  const waitPoll = () => until(() => fixture.pending.length === 1, 'pending long poll');
  const connection = value => page.locator(`[data-log-connection="${value}"]`).waitFor();
  const pause = async () => { await page.getByRole('button', { name: 'Pausar ao vivo', exact: true }).click(); await connection('paused'); await until(() => fixture.pending.length === 0, 'aborted pause'); };
  const resume = async () => { await page.getByRole('button', { name: 'Retomar ao vivo', exact: true }).click(); await waitPoll(); };
  const lists = () => fixture.calls.filter(call => call.path === '/api/admin/logs');
  const lives = () => fixture.calls.filter(call => call.path.endsWith('/live'));
  const open = async (setup = () => {}, auth = true) => {
    if (context) await context.close();
    fixture = new FakeLogs(); setup(fixture);
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Tokyo' });
    await context.addInitScript(authenticated => {
      if (authenticated) {
        localStorage.setItem('fp_admin_access', 'synthetic-admin-logs'); localStorage.setItem('fp_admin_refresh', 'synthetic-refresh');
        localStorage.setItem('fp_admin_user', JSON.stringify({ id: 'logs-admin', name: 'Admin teste', email: 'admin@example.test', role: 'Admin', userType: 1 }));
      }
      window.__xhrStats = { active: 0, max: 0, timeouts: [] };
      const activeRequests = new Set();
      const originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...args) { this.__logs = String(url).includes('/api/admin/logs'); return originalOpen.call(this, method, url, ...args); };
      XMLHttpRequest.prototype.send = function(...args) {
        if (this.__logs) {
          for (const request of activeRequests) if (request.readyState === 0 || request.readyState === 4) activeRequests.delete(request);
          activeRequests.add(this);
          const stats = window.__xhrStats; stats.active = activeRequests.size; stats.max = Math.max(stats.max, stats.active); stats.timeouts.push(this.timeout);
          this.addEventListener('loadend', () => { activeRequests.delete(this); stats.active = activeRequests.size; }, { once: true });
        }
        return originalSend.apply(this, args);
      };
    }, auth);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(base + '/logs');
    if (auth) await page.getByRole('heading', { name: 'Logs do sistema', exact: true }).waitFor();
  };
  const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  try {
    await check('Latest logs, explicit Brasilia time, auth headers and 30-second timeout', async () => {
      await open(); await waitCount(100); await waitPoll();
      assert.equal(await rows().first().getAttribute('data-log-id'), '150');
      assert((await rows().first().locator('time').innerText()).includes('12:30:00'));
      await page.getByText('Horários de Brasília (America/Sao_Paulo).', { exact: false }).waitFor();
      assert.equal(lives()[0].params.after, '150'); assert.equal(lives()[0].params.waitSeconds, '20');
      assert.equal(lives()[0].params.limit, '100');
      const stats = await page.evaluate(() => window.__xhrStats);
      assert(stats.timeouts.every(value => value === 30000)); assert.equal(stats.max, 1);
      assert.equal(new URL(page.url()).search, '');
      await page.screenshot({ path: path.join(output, 'logs-desktop.png'), fullPage: false });
    });
    await check('Debounced phrase search, case insensitive backend filtering and level', async () => {
      await open(f => f.items.push(item(151, { message: 'Pagamento RECUSADO pelo emissor', level: 'Error' })));
      await waitPoll(); const before = lists().length;
      await page.getByRole('searchbox').fill('Pagamento');
      await page.getByRole('searchbox').fill('pAgAmEnTo rEcUsAdO');
      await waitCount(1); await waitPoll(); assert.equal(lists().length, before + 1);
      assert.equal(lists().at(-1).params.search, 'pAgAmEnTo rEcUsAdO');
      await page.getByRole('combobox').selectOption('Error'); await waitCount(1); await waitPoll();
      assert.equal(lists().at(-1).params.level, 'Error');
      assert(!page.url().includes('rEcUsAdO'));
      assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('rEcUsAdO'));
    });
    await check('Stale filter response is cancelled and cannot overwrite a newer search', async () => {
      await open(f => { f.items = [item(1, { message: 'Alpha antigo' }), item(2, { message: 'Beta atual' })]; });
      await waitPoll(); fixture.holdList = true;
      await page.getByRole('searchbox').fill('Alpha'); await until(() => fixture.held.length === 1, 'held search');
      await page.getByRole('searchbox').fill('Beta'); await waitCount(1); await waitPoll();
      fixture.held.shift()();
      assert.equal(await rows().first().getAttribute('data-log-id'), '2');
      assert(!(await rows().innerText()).includes('Alpha'));
      assert.equal((await page.evaluate(() => window.__xhrStats)).max, 1);
    });
    await check('Incremental batches, delivered cursor, deduplication and preserved history cursor', async () => {
      await open(); await waitPoll(); fixture.append(range(151, 370)); await waitCount(320); await waitPoll();
      assert.deepEqual(lives().slice(-3).map(call => call.params.after), ['250', '350', '370']);
      assert.equal(await rows().first().getAttribute('data-log-id'), '370');
      fixture.items.push(item(371));
      fixture.replyLive({ ...fixture.payload(fixture.pending[0].url, true), items: [item(370), item(371)] });
      await waitCount(321); await waitPoll();
      await page.getByRole('button', { name: 'Carregar anteriores', exact: true }).click(); await waitCount(371); await waitPoll();
      assert.equal(lists().at(-1).params.before, '51'); assert.equal(lives().at(-1).params.after, '371');
      assert.equal(await rows().last().getAttribute('data-log-id'), '1');
      assert.equal((await page.evaluate(() => window.__xhrStats)).max, 1);
    });
    await check('Pause preserves the window and resume catches up without another snapshot', async () => {
      await open(); await waitPoll(); const count = lists().length; await pause();
      fixture.append(range(151, 255)); assert.equal(await rows().count(), 100);
      await resume(); await waitCount(205); assert.equal(lists().length, count);
      assert.equal(lives().at(-2).params.after, '250'); assert.equal(await rows().first().getAttribute('data-log-id'), '255');
    });
    await check('Hidden tab aborts the poll and visibility resumes from the same cursor', async () => {
      await open(); await waitPoll();
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
      await connection('hidden'); await until(() => fixture.pending.length === 0, 'hidden abort');
      fixture.append([item(151)]); assert.equal(await rows().count(), 100);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
      await waitCount(101); await waitPoll(); assert.equal(lives().at(-2).params.after, '150');
    });
    await check('Reset required reloads retained history and removes the old window', async () => {
      await open(); await waitPoll(); fixture.items = [item(500, { message: 'Após retenção' })]; fixture.resetRequired = true;
      fixture.flush(); fixture.resetRequired = false;
      await waitCount(1); await waitPoll(); assert.equal(await rows().first().getAttribute('data-log-id'), '500');
      await page.getByText('A janela de registros mudou.', { exact: false }).waitFor();
      assert.equal(lists().length, 2);
    });
    await check('Changed instance resets reused IDs even when cursor remains in range', async () => {
      await open(); await waitPoll(); fixture.instanceId = '22222222-2222-2222-2222-222222222222';
      fixture.items = [item(150, { message: 'Registro de outro processo' })]; fixture.flush(true);
      await waitCount(1); await waitPoll(); assert((await rows().innerText()).includes('outro processo')); assert.equal(lists().length, 2);
    });
    await check('Historical error is safe and retry does not move the live cursor', async () => {
      await open(); await waitPoll(); await pause(); fixture.listErrors.push(503);
      await page.getByRole('button', { name: 'Carregar anteriores', exact: true }).click();
      await page.getByRole('alert').getByText('Não foi possível carregar os registros anteriores.', { exact: false }).waitFor();
      assert.equal(await rows().count(), 100); assert(!(await page.locator('body').innerText()).includes('synthetic-secret'));
      await page.getByRole('button', { name: 'Carregar anteriores', exact: true }).click(); await waitCount(150);
      await resume(); assert.equal(lives().at(-1).params.after, '150');
    });
    await check('Process restart during history retrieval discards reused IDs', async () => {
      await open(); await waitPoll(); await pause();
      fixture.instanceId = '33333333-3333-3333-3333-333333333333'; fixture.items = [item(10, { message: 'Nova instância no histórico' })];
      await page.getByRole('button', { name: 'Carregar anteriores', exact: true }).click();
      await waitCount(1); await connection('paused');
      assert.equal(await rows().first().getAttribute('data-log-id'), '10'); assert.equal(lists().length, 3);
    });
    await check('429 and server failures back off up to 30 seconds without concurrent requests', async () => {
      await open(); await waitPoll(); await page.clock.install();
      fixture.liveErrors.push(503, 429, 503, 503, 503, 503);
      fixture.replyLive({ error: { message: 'synthetic-secret-must-not-render' } }, 429);
      for (const seconds of [1, 2, 4, 8, 16, 30, 30]) {
        await page.getByText(`nova tentativa em até ${seconds}s`, { exact: false }).waitFor();
        assert.equal(await rows().count(), 100);
        assert(!(await page.locator('body').innerText()).includes('synthetic-secret'));
        await page.clock.fastForward(seconds * 1000);
      }
      await waitPoll(); fixture.flush(true); await connection('live');
      assert.equal((await page.evaluate(() => window.__xhrStats)).max, 1);
      assert.equal(await page.getByRole('alert').count(), 0);
    });
    await check('Invalid API shape fails safely and manual reload recovers', async () => {
      await open(); await waitPoll(); fixture.replyLive({ items: [] });
      await connection('reconnecting'); assert.equal(await rows().count(), 100);
      await page.getByRole('button', { name: 'Recarregar', exact: true }).click(); await waitPoll(); await connection('live');
      assert.equal(lists().length, 2);
    });
    await check('An actual 30-second transport timeout preserves logs and reconnects', async () => {
      await open(f => { f.hangNextLive = true; }); await waitPoll();
      await page.locator('[data-log-connection="reconnecting"]').waitFor({ timeout: 35000 });
      assert.equal(await rows().count(), 100); assert(fixture.aborted > 0);
      await until(() => lives().length === 2, 'retry after timeout'); await waitPoll(); fixture.flush(true); await connection('live');
    });
    await check('UI caps at 2000 newest rows and explains omitted older records', async () => {
      await open(); await waitPoll(); fixture.append(range(151, 2300));
      await waitCount(2000); await until(() => lives().at(-1)?.params.after === '2300', 'all batches consumed');
      assert.equal(await rows().first().getAttribute('data-log-id'), '2300'); assert.equal(await rows().last().getAttribute('data-log-id'), '301');
      await page.getByText('250 registros mais antigos foram omitidos da tela.', { exact: false }).waitFor();
      assert(await page.getByRole('button', { name: 'Carregar anteriores', exact: true }).isDisabled());
      assert.equal((await page.evaluate(() => window.__xhrStats)).max, 1);
    });
    await check('Exact UI capacity is explained and paused filters and reload remain usable', async () => {
      await open(); await waitPoll(); fixture.append(range(151, 2050)); await waitCount(2000); await waitPoll();
      await page.getByText('A tela atingiu o limite de 2.000 registros.', { exact: false }).waitFor();
      assert(await page.getByRole('button', { name: 'Carregar anteriores', exact: true }).isDisabled());
      await pause(); const polls = lives().length;
      await page.getByRole('searchbox').fill('Registro sintético 2050'); await waitCount(1); await connection('paused');
      assert.equal(lives().length, polls); assert.equal(await rows().first().getAttribute('data-log-id'), '2050');
      const snapshots = lists().length;
      await page.getByRole('button', { name: 'Recarregar', exact: true }).click();
      await until(() => lists().length === snapshots + 1, 'paused reload'); await waitCount(1); await connection('paused');
      assert.equal(lives().length, polls);
    });
    await check('Untrusted text is escaped in messages and details, with mobile layout', async () => {
      const unsafe = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
      await open(f => { f.items = [item(1, { source: 'X'.repeat(300), message: unsafe,
        exceptionType: unsafe, properties: { [unsafe]: unsafe + 'Y'.repeat(400) } })]; f.persistenceAvailable = false; });
      await waitCount(1); await waitPoll();
      await page.getByText('Detalhes do registro #1', { exact: true }).click();
      assert.equal(await rows().locator('img,script').count(), 0); assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert((await rows().innerText()).includes(unsafe));
      await page.getByText('Persistência em disco indisponível.', { exact: false }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'logs-mobile-details.png'), fullPage: true });
    });
    await check('Shared auth refresh renews bearer and preserves the window', async () => {
      await open(); await waitPoll(); fixture.authExpired = true;
      fixture.replyLive({ error: { message: 'expired' } }, 401);
      await until(() => fixture.refreshes === 1, 'shared refresh'); await waitPoll();
      assert.equal(lives().at(-1).token, 'Bearer synthetic-refreshed'); assert.equal(await rows().count(), 100);
      fixture.append([item(151)]); await waitCount(101);
    });
    await check('Expired session redirects to login and stops polling', async () => {
      await open(); await waitPoll(); fixture.refreshFails = true;
      fixture.replyLive({ error: { message: 'expired' } }, 401);
      await page.waitForURL('**/login'); await until(() => fixture.pending.length === 0, 'auth abort');
      assert.equal(await page.evaluate(() => localStorage.getItem('fp_admin_access')), null);
    });
    await check('Protected route does not fetch logs without a session', async () => {
      await open(() => {}, false); await page.waitForURL('**/login'); assert.equal(fixture.calls.length, 0);
    });
    await check('Leaving the page aborts the outstanding long poll', async () => {
      await open(); await waitPoll();
      await page.getByRole('link', { name: 'Planos', exact: true }).click();
      await page.waitForURL('**/planos'); await until(() => fixture.pending.length === 0, 'unmount abort'); assert(fixture.aborted > 0);
    });
    assert.deepEqual(pageErrors, []); assert.deepEqual(unexpected, []);
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ passed: checks.length, checks, pageErrors, unexpected,
      api: 'Loopback-only synthetic HTTP server; no production requests', timestamp: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, output }));
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: false }).catch(() => {});
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ passed: checks.length, checks, pageErrors, unexpected, failure: String(error.stack || error) }, null, 2));
    throw error;
  } finally {
    await context?.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
