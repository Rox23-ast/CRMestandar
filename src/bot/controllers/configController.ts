import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { listWhatsAppTemplates } from '../services/whatsappService';

const customRuleSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(120),
  keywords: z.string().trim().max(500),
  response: z.string().trim().min(1).max(2000)
});

const botConfigSchema = z.object({
  greetingMessage: z.string().trim().min(1).max(500),
  awayMessage: z.string().trim().min(1).max(500),
  aiPersonalityPrompt: z.string().trim().min(1).max(5000),
  limitations: z.string().trim().max(5000),
  customRules: z.array(customRuleSchema),
  botEnabled: z.boolean().optional(),
  outreachTemplateName: z.string().trim().max(200).nullable().optional(),
  outreachTemplateLanguage: z.string().trim().max(10).optional(),
  outreachTemplateVariables: z.number().int().min(1).max(20).optional()
});

const problem = (res: Response, status: number, title: string) =>
  res.status(status).json({ type: `https://httpstatuses.com/${status}`, title, status });

export const getBotConfig = async (req: Request, res: Response) => {
  try {
    let config = await prisma.botConfig.findFirst();
    
    // Return defaults until the first configuration is persisted.
    if (!config) {
      config = {
        id: 'new',
        greetingMessage: '¡Hola! Soy el asistente virtual de Mudanzas Chico. ¿En qué te puedo ayudar hoy?',
        awayMessage: 'En este momento estamos fuera de horario de atención. Déjanos tu mensaje y te contactaremos pronto.',
        aiPersonalityPrompt: 'Eres un asistente formal y empático de una empresa de mudanzas llamada Mudanzas Chico.',
        limitations: 'No dar precios finales sin confirmación de volumen por un agente.',
        customRules: "[]",
        botEnabled: true,
        outreachTemplateName: null,
        outreachTemplateLanguage: 'es',
        outreachTemplateVariables: 1,
        updatedAt: new Date()
      };
    }
    
    // Serialize custom rules as an array for the frontend.
    res.json({
      ...config,
      customRules: JSON.parse(config.customRules)
    });
  } catch (error) {
    console.error('Error fetching bot config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateBotConfig = async (req: Request, res: Response) => {
  const parsed = botConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return problem(res, 400, 'Configuration data is invalid');
  }

  try {
    const {
      greetingMessage,
      awayMessage,
      aiPersonalityPrompt,
      limitations,
      customRules,
      botEnabled,
      outreachTemplateName,
      outreachTemplateLanguage,
      outreachTemplateVariables
    } = parsed.data;

    const existingConfig = await prisma.botConfig.findFirst();

    let config;
    if (existingConfig) {
      config = await prisma.botConfig.update({
        where: { id: existingConfig.id },
        data: {
          greetingMessage,
          awayMessage,
          aiPersonalityPrompt,
          limitations,
          customRules: customRules ? JSON.stringify(customRules) : undefined,
          botEnabled: botEnabled === undefined ? undefined : botEnabled,
          outreachTemplateName: outreachTemplateName === undefined ? undefined : outreachTemplateName,
          outreachTemplateLanguage: outreachTemplateLanguage === undefined ? undefined : outreachTemplateLanguage,
          outreachTemplateVariables: outreachTemplateVariables === undefined ? undefined : outreachTemplateVariables
        }
      });
    } else {
      config = await prisma.botConfig.create({
        data: {
          greetingMessage,
          awayMessage,
          aiPersonalityPrompt,
          limitations,
          customRules: customRules ? JSON.stringify(customRules) : "[]",
          botEnabled: botEnabled ?? true,
          outreachTemplateName: outreachTemplateName ?? null,
          outreachTemplateLanguage: outreachTemplateLanguage ?? 'es',
          outreachTemplateVariables: outreachTemplateVariables ?? 1
        }
      });
    }
    
    // Serialize custom rules as an array for the HTTP response.
    res.json({
      ...config,
      customRules: JSON.parse(config.customRules)
    });
  } catch (error) {
    console.error('Error updating bot config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/bot/templates
 * Lista las plantillas aprobadas/pendientes de la cuenta de WhatsApp Business
 * para poder elegir cuál usar al iniciar contacto con números nuevos.
 */
export const listTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await listWhatsAppTemplates();
    // Sin cache HTTP: el botón "Cargar plantillas" siempre consulta a Meta.
    res.set('Cache-Control', 'no-store');
    return res.json(templates);
  } catch (error) {
    console.error('Error listing WhatsApp templates:', error);
    return res.status(502).json({ error: 'No fue posible consultar las plantillas de WhatsApp' });
  }
};
