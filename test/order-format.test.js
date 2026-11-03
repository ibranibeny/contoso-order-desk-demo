import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrderId, validateOrderId, formatDelivery, statusClass } from '../public/order-format.js';

test('order numbers are normalized and validated with actionable feedback', () => {
  assert.equal(normalizeOrderId(' ord-100231 '), 'ORD-100231');
  assert.equal(validateOrderId('ORD-100231'), '');
  assert.match(validateOrderId(''), /Enter an order number/);
  for (const id of ['ORD-12345', 'ORD-1234567', '100231', 'ORD-abcdef', 'ORD-123456\n']) {
    assert.match(validateOrderId(id), /six digits/);
  }
  assert.doesNotThrow(() => encodeURIComponent(normalizeOrderId('\uD800')));
});

test('delivery formatting uses a friendly day, abbreviated month and year', () => {
  assert.equal(formatDelivery('2026-11-05'), '5 Nov 2026');
});

test('delivery formatting is deterministic and does not invent missing or invalid dates', () => {
  assert.equal(formatDelivery('2026-11-03'), '3 Nov 2026');
  assert.equal(formatDelivery('2026-11-03T00:00:00Z'), '3 Nov 2026');
  assert.equal(formatDelivery('2024-02-29'), '29 Feb 2024');
  for (const value of [null, undefined, '', 0, 'invalid', '2026-02-30', '2026-13-01', '2026-1-3']) {
    assert.equal(formatDelivery(value), 'Estimated delivery date unavailable');
  }
});

test('badge classes come only from the design-system allowlist', () => {
  for (const [status, suffix] of [
    ['Payment pending', 'pending'], ['Packed', 'packed'], ['Shipped', 'shipped'],
    ['Out for delivery', 'out'], ['Delivered', 'delivered'], ['Cancelled', 'cancelled']
  ]) {
    assert.equal(statusClass(status), `od-badge od-badge--${suffix}`);
  }
  assert.equal(statusClass('<img src=x onerror=alert(1)>'), 'od-badge');
});
