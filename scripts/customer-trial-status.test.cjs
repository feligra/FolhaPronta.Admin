const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, "../src/utils", file + ".ts"), "utf8");
  const sandbox = { exports: {}, require: (id) => {
    assert.equal(id, "./format");
    return load("format");
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  return sandbox.exports;
}
const { getCustomerTrialStatus: status } = load("customerTrial");
const end = "2026-10-27T15:00:00Z";
const boundary = Date.parse(end);
const active = { isActive: true, emailConfirmed: true, trialStatus: "Active", isTrialActive: true, trialEndsAt: end };

test("trial is active immediately before expiry and expires at the exact boundary", () => {
  assert.equal(status(active, boundary - 1), "Active");
  assert.equal(status(active, boundary), "Expired");
  assert.equal(status(active, boundary + 1), "Expired");
});
test("stale Active status and boolean cannot extend a past trial", () => {
  assert.equal(status(active, boundary + 7 * 86400000), "Expired");
  assert.equal(status({ ...active, trialStatus: undefined }, boundary), "Expired");
});
test("legacy boolean has the same boundary and never grants access from dates alone", () => {
  const legacy = { ...active, trialStatus: undefined };
  assert.equal(status(legacy, boundary - 1), "Active");
  assert.equal(status({ ...legacy, isTrialActive: false }, boundary - 1), undefined);
  assert.equal(status({ ...legacy, isTrialActive: false }, boundary), "Expired");
});
test("UTC without Z and equivalent offsets expire at the same instant", () => {
  for (const trialEndsAt of ["2026-10-27T15:00:00", "2026-10-27T12:00:00-03:00", "2026-10-28T00:00:00+09:00", " 2026-10-27T15:00:00Z "]) {
    assert.equal(status({ ...active, trialEndsAt }, boundary - 1), "Active");
    assert.equal(status({ ...active, trialEndsAt }, boundary), "Expired");
  }
});
test("missing or invalid expiry cannot be shown as active", () => {
  for (const trialEndsAt of [null, "", " ", "invalid-date", "2026-13-27T15:00:00Z"]) {
    assert.equal(status({ ...active, trialEndsAt }, boundary), undefined);
    assert.equal(status({ ...active, trialStatus: undefined, trialEndsAt }, boundary), undefined);
  }
});
test("backend denial remains authoritative even with a future expiry and stale true boolean", () => {
  for (const trialStatus of ["Expired", "NotStarted", "WaitingForEmail", "Inactive"]) {
    assert.equal(status({ ...active, trialStatus }, boundary - 1), trialStatus);
  }
});
test("deactivated accounts are not confused with active trials or subscriptions", () => {
  assert.equal(status({ ...active, isActive: false }, boundary - 1), "Inactive");
  assert.equal(status({ ...active, isActive: false, trialStatus: "Subscribed" }, boundary - 1), "Inactive");
});
test("unconfirmed accounts cannot display an active trial", () => {
  assert.equal(status({ ...active, emailConfirmed: false }, boundary - 1), "WaitingForEmail");
  assert.equal(status({ ...active, emailConfirmed: false, trialStatus: undefined }, boundary + 1), "WaitingForEmail");
});
test("a subscription remains distinct from an expired trial and is never inferred from dates", () => {
  assert.equal(status({ ...active, trialStatus: "Subscribed" }, boundary + 1), "Subscribed");
  assert.equal(status({ ...active, trialStatus: "Subscribed", emailConfirmed: false }, boundary + 1), "Subscribed");
  assert.equal(status({ isTrialActive: false, trialEndsAt: null }, boundary), undefined);
});
test("active account flag does not mean its trial is active", () => {
  assert.equal(status({ ...active, isActive: true }, boundary), "Expired");
  assert.equal(status({ ...active, isActive: true, trialStatus: "NotStarted", isTrialActive: false, trialEndsAt: null }, boundary), "NotStarted");
});

test("paid subscription badge uses its own expiry, independently of the free trial", () => {
  const subscribed = { ...active, trialStatus: "Subscribed", trialEndsAt: "2020-01-01T00:00:00Z", subscriptionEndsAt: end };
  assert.equal(status(subscribed, boundary - 1), "Subscribed");
  assert.equal(status(subscribed, boundary), "SubscriptionExpired");
  assert.equal(status({ ...subscribed, trialEndsAt: "2030-01-01T00:00:00Z" }, boundary), "SubscriptionExpired");
  assert.equal(status({ ...subscribed, subscriptionEndsAt: null }, boundary), "SubscriptionExpired");
  assert.equal(status({ ...subscribed, subscriptionEndsAt: undefined }, boundary), "Subscribed");
});
