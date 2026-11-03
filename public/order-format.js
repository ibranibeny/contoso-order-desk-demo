export function normalizeOrderId(value) {
  return value.toWellFormed().trim().toUpperCase();
}

export function validateOrderId(id) {
  if (!id) return 'Enter an order number, for example ORD-100231.';
  if (!/^ORD-\d{6}$/.test(id)) return 'Use ORD- followed by six digits, for example ORD-100231.';
  return '';
}

export function formatDelivery(value) {
  const unavailable = 'Estimated delivery date unavailable';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return unavailable;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date);
}

export function statusClass(status) {
  const classes = new Map([
    ['Payment pending', 'pending'],
    ['Packed', 'packed'],
    ['Shipped', 'shipped'],
    ['Out for delivery', 'out'],
    ['Delivered', 'delivered'],
    ['Cancelled', 'cancelled']
  ]);
  return classes.has(status) ? `od-badge od-badge--${classes.get(status)}` : 'od-badge';
}
