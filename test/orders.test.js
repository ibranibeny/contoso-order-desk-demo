import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { app } from '../src/app.js';
import { isValidOrderId, findOrder } from '../src/orders.js';

const orders = JSON.parse(readFileSync(new URL('../data/orders.json', import.meta.url), 'utf8'));
const invalidIds = [
  '123456', 'XYZ-123456', 'ord-123456', 'ORD-12345', 'ORD-1234567',
  'ORD-12345A', 'ORD-\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16', 'XORD-123456', 'ORD-123456X',
  ' ORD-123456', 'ORD-123456 ', 'ORD-123456\n', 'ORD-123456\r',
  'ORD-123456\t', 'ORD-123456\r\n'
];

test('isValidOrderId accepts only ORD- followed by six ASCII digits', () => {
  assert.equal(isValidOrderId('ORD-000000'), true);
  assert.equal(isValidOrderId('ORD-999999'), true);
  for (const invalidId of [...invalidIds, '', null, undefined, 123456, {}, []]) {
    assert.equal(isValidOrderId(invalidId), false, JSON.stringify(invalidId));
  }
});

test('findOrder returns a fresh allow-listed object without changing source data', () => {
  const source = {
    id: 'ORD-123456',
    status: 'Shipped',
    lastUpdated: '2026-11-02T12:00:00Z',
    estimatedDelivery: '2026-11-05',
    customer: { email: 'agent@example.com', phone: '+1 555 0100' },
    payment: { method: 'Visa', last4: '1234' },
    shipping: { city: 'Seattle' },
    items: [],
    totals: { total: 100 },
    extraField: 'not for the API'
  };
  const original = structuredClone(source);
  const result = findOrder([source], source.id);
  assert.deepEqual(result, {
    id: source.id,
    status: source.status,
    lastUpdated: source.lastUpdated,
    estimatedDelivery: source.estimatedDelivery
  });
  assert.notEqual(result, source);
  result.status = 'Delivered';
  assert.deepEqual(source, original);
});

test('findOrder uses exact ID matching and returns undefined for unknown IDs', () => {
  assert.equal(findOrder(orders, orders[0].id.toLowerCase()), undefined);
  assert.equal(findOrder(orders, `${orders[0].id}X`), undefined);
  assert.equal(findOrder([], 'ORD-000000'), undefined);
});

test('GET /api/orders/:orderId returns safe JSON and validates before lookup', async (context) => {
  const server = app.listen(0);
  if (!server.listening) await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/orders/`;

  await context.test('known ID returns exactly the four source fields', async () => {
    const source = orders[0];
    const original = structuredClone(source);
    const response = await fetch(`${baseUrl}${source.id}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.deepEqual(await response.json(), {
      id: source.id,
      status: source.status,
      lastUpdated: source.lastUpdated,
      estimatedDelivery: source.estimatedDelivery
    });
    assert.deepEqual(source, original);
  });

  for (const invalidId of invalidIds) {
    await context.test(`invalid ID ${JSON.stringify(invalidId)} returns 400`, async () => {
      const response = await fetch(`${baseUrl}${encodeURIComponent(invalidId)}`);
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /^application\/json\b/);
      assert.deepEqual(await response.json(), { error: 'Order numbers look like ORD-123456' });
    });
  }

  await context.test('valid unknown ID returns 404', async () => {
    const knownIds = new Set(orders.map((order) => order.id));
    let candidate = 0;
    while (knownIds.has(`ORD-${String(candidate).padStart(6, '0')}`)) candidate += 1;
    const unknownId = `ORD-${String(candidate).padStart(6, '0')}`;
    assert.equal(isValidOrderId(unknownId), true);
    assert.equal(knownIds.has(unknownId), false);
    assert.equal(findOrder(orders, unknownId), undefined);
    const response = await fetch(`${baseUrl}${unknownId}`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.deepEqual(await response.json(), { error: 'Order not found' });
  });
});