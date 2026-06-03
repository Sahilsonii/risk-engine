import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { clerkAuthMiddleware } from './middleware/clerkAuth';
import { errorHandler } from './middleware/errorHandler';
import transactionRoutes from './routes/transactions';
import logger from './logger';

process.env.SERVICE_NAME = 'api';

const app  = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// ── Security middleware ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// ── Request logging middleware ────────────────────────────────
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// ── All routes are JWT-protected — no unauthenticated routes ─
app.use('/api', clerkAuthMiddleware, transactionRoutes);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started and listening');
});

export default app;
