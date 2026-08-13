import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getBotConfig = async (req: Request, res: Response) => {
  try {
    let config = await prisma.botConfig.findFirst();
    
    // If no config exists, return default empty state (it will be created on first PUT)
    if (!config) {
      config = {
        id: 'new',
        greetingMessage: '¡Hola! Soy el asistente virtual de Mudanzas Chico. ¿En qué te puedo ayudar hoy?',
        awayMessage: 'En este momento estamos fuera de horario de atención. Déjanos tu mensaje y te contactaremos pronto.',
        aiPersonalityPrompt: 'Eres un asistente formal y empático de una empresa de mudanzas llamada Mudanzas Chico.',
        limitations: 'No dar precios finales sin confirmación de volumen por un agente.',
        customRules: "[]",
        updatedAt: new Date()
      };
    }
    
    // Parse customRules to JSON array for frontend
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
  try {
    const { greetingMessage, awayMessage, aiPersonalityPrompt, limitations, customRules } = req.body;
    
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
          customRules: customRules ? JSON.stringify(customRules) : undefined
        }
      });
    } else {
      config = await prisma.botConfig.create({
        data: {
          greetingMessage,
          awayMessage,
          aiPersonalityPrompt,
          limitations,
          customRules: customRules ? JSON.stringify(customRules) : "[]"
        }
      });
    }
    
    // Convertir de vuelta a JSON para la respuesta HTTP
    res.json({
      ...config,
      customRules: JSON.parse(config.customRules)
    });
  } catch (error) {
    console.error('Error updating bot config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
