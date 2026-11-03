import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/app.js';

test('GET /orders/lookup returns only the order summary fields', async () => {
  const server = app.listen(0);
  if (!server.listening) await once(server, 'listening');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/orders/lookup?id=ORD-100200`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['estimatedDelivery', 'id', 'lastUpdated', 'status']);
    assert.equal(body.id, 'ORD-100200');
  } finally {
    server.close();
  }
});

test('GET /orders/lookup rejects missing, repeated, and malformed IDs with JSON 400 errors', async () => {
  const server = app.listen(0);
  if (!server.listening) await once(server, 'listening');
  try {
    const { port } = server.address();
    for (const query of ['', '?id=ORD-100001&id=ORD-100002', '?id=%3Cscript%3E']) {
      const res = await fetch(`http://127.0.0.1:${port}/orders/lookup${query}`);
      assert.equal(res.status, 400);
      assert.match(res.headers.get('content-type'), /application\/json/);
      assert.deepEqual(await res.json(), { error: 'Invalid order ID' });
    }
  } finally {
    server.close();
  }
});

test('GET /orders/lookup returns a JSON 404 for an unknown valid ID', async () => {
  const server = app.listen(0);
  if (!server.listening) await once(server, 'listening');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/orders/lookup?id=ORD-000000`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await res.json(), { error: 'Order not found' });
  } finally {
    server.close();
  }
});
