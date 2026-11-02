export function isValidOrderId(orderId) {
  return typeof orderId === 'string'
    && orderId.length === 10
    && /^ORD-[0-9]{6}$/.test(orderId);
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