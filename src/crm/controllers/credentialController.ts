import { Request, Response } from 'express';
import { z } from 'zod';
import { getCredentials, saveCredentials } from '../services/credentialService';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';

const credentialsSchema = z.object({
  WA_API_TOKEN: z.string().max(500).optional(),
  WA_VERIFY_TOKEN: z.string().max(500).optional(),
  WA_PHONE_NUMBER_ID: z.string().max(100).optional(),
  WA_WABA_ID: z.string().max(100).optional(),
  WA_APP_SECRET: z.string().max(500).optional(),
  OPENAI_API_KEY: z.string().max(500).optional(),
  ANTHROPIC_API_KEY: z.string().max(500).optional(),
  GEMINI_API_KEY: z.string().max(500).optional(),
  CRM_WEBHOOK_URL: z.string().max(500).optional(),
  CRM_WEBHOOK_SECRET: z.string().max(200).optional(),
});

const problem = (res: Response, status: number, title: string) =>
  res.status(status).json({ type: `https://httpstatuses.com/${status}`, title, status });

export const getApiCredentials = async (req: Request, res: Response) => {
  try {
    const creds = await getCredentials();
    return res.json(creds);
  } catch (error) {
    console.error('Error fetching API credentials:', error);
    return problem(res, 500, 'Internal server error');
  }
};

export const updateApiCredentials = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Invalid credentials data');

  try {
    await saveCredentials(parsed.data);
    const creds = await getCredentials();
    return res.json(creds);
  } catch (error) {
    console.error('Error updating API credentials:', error);
    return problem(res, 500, 'Internal server error');
  }
};