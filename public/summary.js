import { statusClass } from './order-format.js';

export function validSummary(body) {
  return Boolean(body)
    && Number.isInteger(body.total)
    && Array.isArray(body.byStatus)
    && body.byStatus.every((row) => row && typeof row.status === 'string' && Number.isInteger(row.count));
}

export async function mountSummary(root, request = fetch) {
  const list = root.querySelector('#summary-list');
  const total = root.querySelector('#summary-total');
  const message = root.querySelector('#summary-message');

  function unavailable() {
    list.replaceChildren();
    total.textContent = '';
    message.textContent = 'Summary unavailable';
    message.className = 'od-alert od-alert--warn';
  }

  try {
    const response = await request('/api/summary', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
    if (response.status !== 200) return unavailable();
    const body = await response.json();
    if (!validSummary(body)) return unavailable();

    const items = body.byStatus.map((row) => {
      const item = root.createElement('li');
      item.className = 'summary-row';
      const badge = root.createElement('span');
      badge.className = statusClass(row.status);
      badge.textContent = row.status;
      const count = root.createElement('strong');
      count.textContent = String(row.count);
      item.append(badge, count);
      return item;
    });
    list.replaceChildren(...items);
    total.textContent = `Total orders: ${body.total}`;
    message.textContent = '';
    message.className = '';
  } catch {
    unavailable();
  }
}
