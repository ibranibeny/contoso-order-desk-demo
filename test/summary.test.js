import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { summarizeOrders, STATUS_ORDER } from '../src/orders.js';
import { mountSummary } from '../public/summary.js';

test('summarizeOrders counts per status in fixed order with zeros', () => {
  const summary = summarizeOrders([
    { id: 'ORD-100001', status: 'Shipped', customer: { email: 'a@example.com' } },
    { id: 'ORD-100002', status: 'Shipped' },
    { id: 'ORD-100003', status: 'Cancelled' },
    { id: 'ORD-100004', status: 'Unknown' }
  ]);
  assert.deepEqual(summary, {
    total: 3,
    byStatus: [
      { status: 'Payment pending', count: 0 },
      { status: 'Packed', count: 0 },
      { status: 'Shipped', count: 2 },
      { status: 'Out for delivery', count: 0 },
      { status: 'Delivered', count: 0 },
      { status: 'Cancelled', count: 1 }
    ]
  });
  assert.deepEqual(summarizeOrders([]).byStatus.map((row) => row.status), STATUS_ORDER);
});

async function get(path) {
  const server = app.listen(0);
  if (!server.listening) await once(server, 'listening');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test('GET /api/summary returns counts only', async () => {
  const { status, body } = await get('/api/summary');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['byStatus', 'total']);
  assert.deepEqual(body.byStatus.map((row) => row.status), STATUS_ORDER);
  for (const row of body.byStatus) assert.deepEqual(Object.keys(row).sort(), ['count', 'status']);
  assert.equal(body.total, body.byStatus.reduce((sum, row) => sum + row.count, 0));
  assert.doesNotMatch(JSON.stringify(body), /ORD-|@|email|phone|shipping|customer|card|tracking/i);
});

test('GET /api/summary ignores query input and unknown sub-paths return 404', async () => {
  assert.equal((await get('/api/summary?status=Packed')).status, 200);
  const missing = await get('/api/summary/ORD-100231');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Not found' });
});

function fixture(request) {
  const nodes = {
    '#summary-list': { children: [], replaceChildren(...items) { this.children = items; } },
    '#summary-total': { textContent: '' },
    '#summary-message': { textContent: '', className: '' }
  };
  const root = {
    querySelector: (selector) => nodes[selector],
    createElement: () => ({
      textContent: '', className: '', children: [],
      append(...c) { this.children.push(...c); }
    })
  };
  return { nodes, run: () => mountSummary(root, request) };
}

test('mountSummary renders a row per status and the total', async () => {
  const body = { total: 3, byStatus: [{ status: 'Packed', count: 1 }, { status: 'Shipped', count: 2 }] };
  const f = fixture(async () => ({ status: 200, json: async () => body }));
  await f.run();
  const rows = f.nodes['#summary-list'].children;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].children[0].textContent, 'Shipped');
  assert.equal(rows[1].children[0].className, 'od-badge od-badge--shipped');
  assert.equal(rows[1].children[1].textContent, '2');
  assert.equal(f.nodes['#summary-total'].textContent, 'Total orders: 3');
  assert.equal(f.nodes['#summary-message'].textContent, '');
});

test('mountSummary shows Summary unavailable on failures', async () => {
  const cases = [
    async () => ({ status: 500, json: async () => ({}) }),
    async () => ({ status: 200, json: async () => ({ total: 'x' }) }),
    async () => { throw new Error('network'); }
  ];
  for (const request of cases) {
    const f = fixture(request);
    await f.run();
    assert.equal(f.nodes['#summary-message'].textContent, 'Summary unavailable');
    assert.equal(f.nodes['#summary-list'].children.length, 0);
  }
});
