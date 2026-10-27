const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(file) {
  const sandbox = { exports: {}, Date, require: name => {
    if (name === './format') return load('format');
    throw new Error(`Unexpected import: ${name}`);
  } };
  const source = fs.readFileSync(path.join(__dirname, `../src/utils/${file}.ts`), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  return sandbox.exports;
}
const { getSubscriptionStatus, canCancelSubscription, canExtendSubscription, hasSubscriptionAccess, isRenewalCancellation, subscriptionPeriodEnd } = load('billing');
const now = Date.parse('2026-10-27T15:00:00Z');
const subscription = overrides => ({ status: 'Active', hasAccess: true, provider: 'Manual',
  currentPeriodEnd: '2026-10-28T15:00:00Z', ...overrides });

test('Active stops granting displayed access and extension at the exact expiry, even with stale API flags', () => {
  for (const end of ['2026-10-27T14:59:59Z', '2026-10-27T15:00:00Z', '2026-10-27T15:00:00', null, 'invalid']) {
    const sub = subscription({ currentPeriodEnd: end, canExtend: true, canCancel: true });
    assert.equal(getSubscriptionStatus(sub, now), 'Expired');
    assert.equal(hasSubscriptionAccess(sub, now), false);
    assert.equal(canExtendSubscription(sub, now), false);
    assert.equal(canCancelSubscription(sub, now), false);
  }
  assert.equal(getSubscriptionStatus(subscription({ currentPeriodEnd: '2026-10-27T12:00:01-03:00' }), now), 'Active');
});

test('Trial uses trialEndsAt rather than an unrelated billing period and never allows courtesy extension', () => {
  const trial = subscription({ status: 'Trialing', trialEndsAt: '2026-10-27T15:00:00Z' });
  assert.equal(getSubscriptionStatus(trial, now), 'Expired');
  assert.equal(hasSubscriptionAccess(trial, now), false);
  assert.equal(canExtendSubscription(trial, now), false);
  assert.equal(subscriptionPeriodEnd({ ...trial, rawStatus: 'Trialing', status: 'Expired' }), trial.trialEndsAt);
  const live = { ...trial, trialEndsAt: '2026-10-27T15:00:01Z' };
  assert.equal(getSubscriptionStatus(live, now), 'Trialing');
  assert.equal(hasSubscriptionAccess(live, now), true);
  assert.equal(canExtendSubscription(live, now), false);
  const noTrialEnd = { ...live, trialEndsAt: null };
  assert.equal(subscriptionPeriodEnd(noTrialEnd), null);
  assert.equal(getSubscriptionStatus(noTrialEnd, now), 'Expired');
  assert.equal(subscriptionPeriodEnd({ ...noTrialEnd, status: 'Expired', rawStatus: 'Trialing' }), null);
  // Legacy responses omitted trialEndsAt entirely; only those may use the old field.
  assert.equal(subscriptionPeriodEnd(subscription({ status: 'Trialing' })), '2026-10-28T15:00:00Z');
});

test('Cancelled keeps its history while actions reflect remaining access', () => {
  const cancelled = subscription({ status: 'Cancelled' });
  assert.equal(getSubscriptionStatus(cancelled, now), 'Cancelled');
  assert.equal(canExtendSubscription(cancelled, now), true);
  assert.equal(canCancelSubscription(cancelled, now), true);
  const ended = { ...cancelled, currentPeriodEnd: '2026-10-26T15:00:00Z' };
  assert.equal(getSubscriptionStatus(ended, now), 'Cancelled');
  assert.equal(canExtendSubscription(ended, now), false);
  assert.equal(canCancelSubscription(ended, now), false);
});

test('Expired remote agreements can be closed without restoring access; confirmed cancellation hides actions', () => {
  const remote = subscription({ status: 'Expired', rawStatus: 'Active', hasAccess: false,
    provider: 'Stripe', canCancel: true, canExtend: false, canCancelRenewal: true });
  assert.equal(canCancelSubscription(remote, now), true);
  assert.equal(isRenewalCancellation(remote, now), true);
  assert.equal(canExtendSubscription(remote, now), false);
  const closed = { ...remote, canCancel: false, canCancelRenewal: false };
  assert.equal(canCancelSubscription(closed, now), false);
  assert.equal(isRenewalCancellation(closed, now), false);
});

test('Pending checkout and past due remain distinct from expired active access', () => {
  for (const status of ['PendingPayment', 'PastDue', 'Paused']) {
    const sub = subscription({ status, hasAccess: false, currentPeriodEnd: null });
    assert.equal(getSubscriptionStatus(sub, now), status);
    assert.equal(canExtendSubscription(sub, now), false);
  }
  assert.equal(canExtendSubscription(subscription({ canExtend: false }), now), false);
  assert.equal(canCancelSubscription(subscription({ canCancel: false }), now), false);
});
