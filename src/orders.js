export function isValidOrderId(orderId) {
  return typeof orderId === 'string'
    && orderId.length === 10
    && /^ORD-[0-9]{6}$/.test(orderId);
}

export const STATUS_ORDER = [
  'Payment pending',
  'Packed',
  'Shipped',
  'Out for delivery',
  'Delivered',
  'Cancelled'
];

export function summarizeOrders(orders) {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  for (const order of orders) {
    if (counts.has(order.status)) counts.set(order.status, counts.get(order.status) + 1);
  }
  return {
    total: [...counts.values()].reduce((sum, count) => sum + count, 0),
    byStatus: STATUS_ORDER.map((status) => ({ status, count: counts.get(status) }))
  };
}

export function findOrder(orders, orderId) {
  const order = orders.find((candidate) => candidate.id === orderId);
  if (!order) return undefined;

  return {
    id: order.id,
    status: order.status,
    lastUpdated: order.lastUpdated,
    estimatedDelivery: order.estimatedDelivery
  };
}