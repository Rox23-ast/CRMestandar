import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { getBotConfig, updateBotConfig } from './bot/controllers/configController';
import { verifyWebhook, receiveMessage } from './bot/controllers/webhookController';
import { receiveCotizadorEvent } from './integrations/cotizadorController';
import { crmRouter } from './crm/routes';
import { seedFromEnv } from './crm/services/credentialService';
import { requireCrmUser, requireCrmRole } from './core/auth/authMiddleware';

// Load environment variables.
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Trust proxy (required for rate-limiter behind Nginx).
app.set('trust proxy', 1);

// Security middleware.
app.use(helmet({
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  originAgentCluster: false,
})); // Protects response headers.

// CORS allowlist: same-origin requests are always allowed; cross-origin
// requests require an explicit entry in CORS_ORIGINS (comma-separated).
const corsExtraOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use((req: Request, res: Response, next) => {
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsExtraOrigins.includes(origin)) return callback(null, true);
      try {
        return callback(null, new URL(origin).host === req.headers.host);
      } catch {
        return callback(null, false);
      }
    }
  })(req, res, next);
});

app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
})); // Parses JSON and preserves webhook bytes for signature validation.

// WhatsApp webhook endpoints. Registered before the global rate limiter so
// Meta's legitimate traffic is never throttled; the POST is protected by the
// x-hub-signature-256 HMAC validation instead.
app.get('/api/bot/webhook', verifyWebhook);
app.post('/api/bot/webhook', receiveMessage);

// Cotizador callback endpoint. Same rationale as the Meta webhook: it sits
// before the global rate limiter and is protected by X-Mudanzas-Signature
// HMAC validation (timestamp anti-replay + event-id deduplication).
app.post('/api/integrations/cotizador/events', receiveCotizadorEvent);

// Rate limiter to reduce brute-force and request-flooding attacks.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter limiter for authentication endpoints to slow down brute-force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://httpstatuses.com/429',
    title: 'Too many authentication attempts',
    status: 429,
    detail: 'Too many attempts. Please try again later.'
  }
});
app.use('/api/crm/auth/login', authLimiter);
app.use('/api/crm/auth/bootstrap', authLimiter);

// Redirect the server root to the CRM panel, the main entry route.
app.get('/', (_req: Request, res: Response) => {
  res.redirect(301, '/crm/');
});

// Canonicalize /crm to its trailing-slash form so relative URLs stay consistent.
app.get(/^\/crm$/, (_req: Request, res: Response) => {
  res.redirect(301, '/crm/');
});

// Serve the Vite-built configuration panel under the /crm path.
app.use('/crm', express.static(path.join(__dirname, '../public')));

// Fallback to index.html for SPA routing on /crm
app.get(/^\/crm/, (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health-check endpoint.
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Mudanzas Chico API is running' });
});

// Bot configuration endpoints.
app.get('/api/bot/config', requireCrmUser, requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), getBotConfig);
app.put('/api/bot/config', requireCrmUser, requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateBotConfig);

// CRM inbox and real-time notification endpoints.
app.use('/api/crm', crmRouter);

// Start server.
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    await seedFromEnv();
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })();
}

export default app;
