import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { getBotConfig, updateBotConfig } from './bot/controllers/configController';
import { verifyWebhook, receiveMessage } from './bot/controllers/webhookController';
import { crmRouter } from './crm/routes';
import { seedFromEnv } from './crm/services/credentialService';

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
app.use(cors()); // Enables Cross-Origin Resource Sharing.
app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
})); // Parses JSON and preserves webhook bytes for signature validation.

// Rate limiter to reduce brute-force and request-flooding attacks.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

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
app.get('/api/bot/config', getBotConfig);
app.put('/api/bot/config', updateBotConfig);

// WhatsApp webhook endpoints.
app.get('/api/bot/webhook', verifyWebhook);
app.post('/api/bot/webhook', receiveMessage);

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
