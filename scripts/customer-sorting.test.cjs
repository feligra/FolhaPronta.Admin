const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/customerSorting.ts'), 'utf8');
const sandbox = { exports: {}, URLSearchParams };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { CUSTOMER_SORT_FIELDS, readCustomerSort, changeCustomerSort } = sandbox.exports;

test('Defaults and malformed bookmarks use a supported server sort', () => {
  for (const query of ['', 'sortBy=not-a-field', 'sortBy=name&sortDirection=invalid']) {
    const sort = readCustomerSort(new URLSearchParams(query));
    assert(CUSTOMER_SORT_FIELDS.some(field => field.value === sort.field));
    assert.equal(sort.direction, 'desc');
  }
  assert.equal(readCustomerSort(new URLSearchParams()).field, 'createdAt');
});

test('Every attribute toggles direction, resets pagination and retains filters', () => {
  for (const { value } of CUSTOMER_SORT_FIELDS) {
    const original = new URLSearchParams('search=Ana&role=User&isActive=true&page=4');
    const ascending = changeCustomerSort(original, value);
    assert.equal(ascending.get('page'), '1');
    assert.equal(ascending.get('search'), 'Ana'); assert.equal(ascending.get('role'), 'User'); assert.equal(ascending.get('isActive'), 'true');
    assert.equal(ascending.get('sortDirection'), 'asc');
    const descending = changeCustomerSort(ascending, value);
    assert.equal(descending.get('sortDirection'), 'desc');
    assert.equal(changeCustomerSort(descending, value).get('sortDirection'), 'asc');
    assert.equal(original.get('page'), '4');
  }
});
