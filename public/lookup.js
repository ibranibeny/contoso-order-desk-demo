import { normalizeOrderId, validateOrderId, formatDelivery, statusClass } from './order-format.js';

export function mountLookup(root, request = fetch) {
  const form = root.querySelector('#lookup-form');
  const input = root.querySelector('#order-number');
  const message = root.querySelector('#lookup-message');
  const result = root.querySelector('#order-result');
  const number = root.querySelector('#result-number');
  const status = root.querySelector('#result-status');
  const delivery = root.querySelector('#result-delivery');
  let latest = 0;

  function announce(text, kind = 'info') {
    message.className = `od-alert od-alert--${kind}`;
    message.textContent = text;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submission = ++latest;
    const id = normalizeOrderId(input.value);
    const validation = validateOrderId(id);
    input.setAttribute('aria-invalid', String(Boolean(validation)));
    result.hidden = true;
    number.textContent = '';
    status.textContent = '';
    delivery.textContent = '';
    announce(validation ? `${validation} Checking submitted order number…` : 'Looking up order…');

    try {
      // Send even invalid submissions so the API can record each attempt.
      const reference = id === '.' || id === '..' ? ` ${id}` : id || ' ';
      const response = await request(`/api/orders/${encodeURIComponent(reference)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
      });
      if (submission !== latest) return;
      if (response.status === 401 || response.status === 403) {
        announce('Access denied. Sign in with an authorized agent account and try again.', 'danger');
      } else if (response.status >= 500) {
        announce('Order lookup is temporarily unavailable. Please try again.', 'danger');
      } else if (validation || response.status === 400) {
        input.setAttribute('aria-invalid', 'true');
        announce(validation || 'Check the order number. Use ORD- followed by six digits, for example ORD-100231.', 'warn');
      } else if (response.status === 404) {
        announce('Order not found. Check the order number and try again', 'warn');
      } else if (response.status === 200) {
        const order = await response.json();
        if (submission !== latest) return;
        if (!order || order.id !== id || typeof order.status !== 'string' || !order.status.trim()) {
          throw new Error('Invalid lookup response');
        }
        number.textContent = order.id;
        status.textContent = order.status;
        status.className = statusClass(order.status);
        delivery.textContent = formatDelivery(order.estimatedDelivery);
        result.hidden = false;
        announce('Order found.');
      } else {
        announce('Order lookup is temporarily unavailable. Please try again.', 'danger');
      }
    } catch {
      if (submission !== latest) return;
      announce('Order lookup is temporarily unavailable. Please try again.', 'danger');
    }
  });
}
