import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { app } from '../src/app.js';
import { mountLookup } from '../public/lookup.js';

function fixture(request) {
  const elements = new Map();
  for (const id of ['lookup-form', 'order-number', 'lookup-message', 'order-result',
    'result-number', 'result-status', 'result-delivery']) {
    elements.set(`#${id}`, {
      textContent: '', value: '', hidden: id === 'order-result', attributes: {}, listeners: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, listener) { this.listeners[name] = listener; }
    });
  }
  const get = (id) => elements.get(`#${id}`);
  mountLookup({ querySelector: (selector) => elements.get(selector) }, request);
  return {
    get,
    async submit(value) {
      get('order-number').value = value;
      let prevented = false;
      const completion = get('lookup-form').listeners.submit({
        preventDefault() { prevented = true; }
      });
      assert.equal(prevented, true);
      await completion;
    }
  };
}

const order = { id: 'ORD-100231', status: 'Packed', estimatedDelivery: '2026-11-03' };
const response = (status, body) => ({ status, async json() { return body; } });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function assertCleared(ui) {
  assert.equal(ui.get('order-result').hidden, true);
  for (const id of ['result-number', 'result-status', 'result-delivery']) {
    assert.equal(ui.get(id).textContent, '');
  }
}

test('submission shows loading, then only the required order fields', async () => {
  const pending = deferred();
  const calls = [];
  const ui = fixture((...args) => { calls.push(args); return pending.promise; });
  const completion = ui.submit(' ord-100231 ');
  assertCleared(ui);
  assert.match(ui.get('lookup-message').textContent, /Looking up/);
  pending.resolve(response(200, { ...order, lastUpdated: '2026-11-02', customer: 'private', payment: 'private' }));
  await completion;
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/orders/ORD-100231');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].redirect, 'error');
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(ui.get('order-result').hidden, false);
  assert.equal(ui.get('result-number').textContent, order.id);
  assert.equal(ui.get('result-status').textContent, 'Packed');
  assert.equal(ui.get('result-status').className, 'od-badge od-badge--packed');
  assert.equal(ui.get('result-delivery').textContent, '3 November 2026');
  assert.equal(ui.get('lookup-message').textContent, 'Order found.');
});

test('missing delivery estimates are explicit', async () => {
  const ui = fixture(async () => response(200, { ...order, estimatedDelivery: null }));
  await ui.submit(order.id);
  assert.equal(ui.get('result-delivery').textContent, 'Estimated delivery date unavailable');
});

test('unknown orders clear previous results and provide correction guidance', async () => {
  let reply = response(200, order);
  const ui = fixture(async () => reply);
  await ui.submit(order.id);
  reply = response(404, { error: 'Not found' });
  await ui.submit('ORD-999999');
  assertCleared(ui);
  assert.equal(ui.get('lookup-message').textContent, 'Order not found. Check the order number and try again');
});

test('invalid and empty submissions reach the API; typing alone does not', async () => {
  const calls = [];
  const ui = fixture(async (url) => { calls.push(url); return response(400); });
  ui.get('order-number').value = 'mistyped';
  assert.equal(calls.length, 0);
  assert.deepEqual(Object.keys(ui.get('order-number').listeners), []);
  for (const value of ['', 'bad/input?#', '\uD800']) {
    await ui.submit(value);
    assertCleared(ui);
    assert.equal(ui.get('order-number').attributes['aria-invalid'], 'true');
    assert.match(ui.get('lookup-message').textContent, /order number|six digits/);
  }
  assert.deepEqual(calls, ['/api/orders/%20', '/api/orders/BAD%2FINPUT%3F%23', '/api/orders/%EF%BF%BD']);
  await ui.submit('');
  assert.equal(calls.length, 4);
});

test('empty and dot-segment submissions reach the invalid-input server path', async () => {
  const submitted = [];
  const auditApp = express();
  auditApp.get('/api/orders/:orderId', (req, res) => {
    submitted.push(req.params.orderId);
    res.status(400).json({ error: 'Invalid order number' });
  });
  const server = auditApp.listen(0);
  if (!server.listening) await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ui = fixture((url, options) => fetch(`${base}${url}`, options));
    for (const id of ['', '.', '..', '%2e%2e', 'bad/input?#']) {
      await ui.submit(id);
      assertCleared(ui);
      assert.match(ui.get('lookup-message').textContent, /order number|six digits/);
    }
    assert.deepEqual(submitted, [' ', ' .', ' ..', '%2E%2E', 'BAD/INPUT?#']);
  } finally {
    server.close();
  }
});

test('service, audit, network, and unexpected-response errors are retryable and never disclose details', async (t) => {
  for (const [name, failure] of [
    ['service', () => response(503, { ...order })],
    ['audit', () => response(500, { error: 'Audit write failed', ...order })],
    ['network', () => { throw new Error('Connection failed'); }],
    ['timeout', () => { throw new DOMException('Timed out', 'TimeoutError'); }],
    ['unexpected status', () => response(429)],
    ['invalid JSON', () => ({ status: 200, json() { throw new Error('Invalid JSON'); } })],
    ['mismatched order', () => response(200, { ...order, id: 'ORD-100232' })],
    ['invalid body', () => response(200, null)]
  ]) {
    await t.test(name, async () => {
      let reply = () => response(200, order);
      const ui = fixture(async () => reply());
      await ui.submit(order.id);
      reply = failure;
      await ui.submit(order.id);
      assertCleared(ui);
      assert.equal(ui.get('lookup-message').textContent, 'Order lookup is temporarily unavailable. Please try again.');
      assert.match(ui.get('lookup-message').className, /danger/);
    });
  }
});

test('access-denied responses override validation and cannot render order payloads', async () => {
  for (const code of [401, 403]) {
    let reply = response(200, order);
    const ui = fixture(async () => reply);
    await ui.submit(order.id);
    reply = response(code, order);
    await ui.submit('');
    assertCleared(ui);
    assert.match(ui.get('lookup-message').textContent, /Access denied/);
  }
});

test('server validation is actionable and service failures override local validation', async () => {
  const ui = fixture(async () => response(400));
  await ui.submit(order.id);
  assert.match(ui.get('lookup-message').textContent, /six digits/);
  assert.equal(ui.get('order-number').attributes['aria-invalid'], 'true');
  const failed = fixture(async () => response(500));
  await failed.submit('');
  assert.match(failed.get('lookup-message').textContent, /temporarily unavailable/);
});

test('only the latest submission can render, including delayed JSON and stale errors', async (t) => {
  for (const scenario of ['response', 'body', 'error']) {
    await t.test(scenario, async () => {
      const pending = deferred();
      let calls = 0;
      const ui = fixture(async () => {
        if (++calls === 1) {
          return scenario === 'body' ? { status: 200, json: () => pending.promise } : pending.promise;
        }
        return response(200, { ...order, id: 'ORD-100232', status: 'Delivered' });
      });
      const first = ui.submit(order.id);
      await Promise.resolve();
      await ui.submit('ORD-100232');
      if (scenario === 'error') pending.reject(new Error('Stale failure'));
      else pending.resolve(scenario === 'body' ? order : response(200, order));
      await first;
      assert.equal(ui.get('result-number').textContent, 'ORD-100232');
      assert.equal(ui.get('result-status').textContent, 'Delivered');
      assert.equal(ui.get('lookup-message').textContent, 'Order found.');
    });
  }
});

test('a new invalid submission clears details and supersedes an in-flight success', async () => {
  const pending = deferred();
  let calls = 0;
  const ui = fixture(async () => ++calls === 1 ? pending.promise : response(400));
  const first = ui.submit(order.id);
  await ui.submit('');
  pending.resolve(response(200, order));
  await first;
  assertCleared(ui);
  assert.match(ui.get('lookup-message').textContent, /Enter an order number/);
});

test('the served page has a labeled native submit form and a persistent live region', async () => {
  const server = app.listen(0);
  if (!server.listening) await once(server, 'listening');
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<label for="order-number">Order number<\/label>/);
    assert.match(html, /<form id="lookup-form" novalidate>/);
    assert.match(html, /type="submit">Look up order<\/button>/);
    assert.match(html, /id="lookup-output" aria-live="polite" aria-atomic="true"/);
    assert.match(html, /id="order-result" class="od-card" hidden/);
    assert.match(html, /<script type="module" src="app.js"><\/script>/);
  } finally {
    server.close();
  }
});
