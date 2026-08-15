import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { getBotConfig, updateBotConfig } from './bot/controllers/configController';
import { verifyWebhook, receiveMessage } from './bot/controllers/webhookController';
import { crmRouter } from './crm/routes';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet()); // Protects headers
app.use(cors()); // Enables Cross-Origin Resource Sharing
app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
})); // Parses incoming JSON requests and preserves webhook bytes for signature validation

// Rate Limiter to prevent brute-force/DDoS attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Mudanzas Chico API is running' });
});

// Bot Config Endpoints
app.get('/api/bot/config', getBotConfig);
app.put('/api/bot/config', updateBotConfig);

// WhatsApp Webhook Endpoints
app.get('/api/bot/webhook', verifyWebhook);
app.post('/api/bot/webhook', receiveMessage);

// CRM inbox and real-time notification endpoints
app.use('/api/crm', crmRouter);

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

export default app;
