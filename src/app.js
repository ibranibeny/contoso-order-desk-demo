import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isValidOrderId, findOrder, summarizeOrders } from './orders.js';

const dataFile = fileURLToPath(new URL('../data/orders.json', import.meta.url));
const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const orders = JSON.parse(readFileSync(dataFile, 'utf8'));

export const app = express();
app.disable('x-powered-by');
app.use(express.static(publicDir));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', orders: orders.length });
});

app.get('/api/summary', (req, res) => {
  return res.json(summarizeOrders(orders));
});

app.get('/api/orders/', (req, res) => {
  return res.status(400).json({ error: 'Order numbers look like ORD-123456' });
});

app.get('/api/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  if (!isValidOrderId(orderId)) {
    return res.status(400).json({ error: 'Order numbers look like ORD-123456' });
  }

  const order = findOrder(orders, orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(order);
});

app.use('/api', (error, req, res, next) => {
  if (error instanceof URIError) {
    return res.status(400).json({ error: 'Order numbers look like ORD-123456' });
  }
  return next(error);
});

app.use('/api', (req, res) => {
  return res.status(404).json({ error: 'Not found' });
});
