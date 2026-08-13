import { PrismaClient, Client } from '@prisma/client';
import { sendWhatsAppMessage } from './whatsappService';
import { processMessageWithAI } from './aiService';

const prisma = new PrismaClient();

export const processIncomingMessage = async (fromPhone: string, text: string) => {
  try {
    // 1. Obtener la configuración general del Bot
    const config = await prisma.botConfig.findFirst();
    const botConfig = config || {
      greetingMessage: "¡Hola! Soy el asistente virtual.",
      awayMessage: "Estamos fuera de horario.",
      aiPersonalityPrompt: "Eres un asistente.",
      limitations: "",
      customRules: "[]"
    };

    // Parse custom rules
    const parsedRules = JSON.parse(botConfig.customRules);

    // 2. Buscar o crear al cliente en la base de datos
    let client = await prisma.client.findUnique({
      where: { phone: fromPhone }
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          phone: fromPhone,
          botStep: 'START'
        }
      });
      // Como es nuevo, siempre enviamos el mensaje de saludo configurado en el panel
      await sendWhatsAppMessage(fromPhone, botConfig.greetingMessage);
      return;
    }

    // 3. Manejo de la Máquina de Estados (BotStep)
    console.log(`[Bot Flow] Cliente ${fromPhone} en paso: ${client.botStep}`);

    switch (client.botStep) {
      case 'START':
      case 'CHAT':
        // Procesar el mensaje libremente con la IA
        const aiResponse = await processMessageWithAI(
          text, 
          botConfig.aiPersonalityPrompt, 
          botConfig.limitations,
          parsedRules
        );

        if (aiResponse.intent === 'QUOTE') {
          // Cambiamos el estado del cliente a proceso de cotización
          await updateClientStep(fromPhone, 'QUOTE_ORIGIN');
        } else {
          await updateClientStep(fromPhone, 'CHAT');
        }

        // Enviamos la respuesta generada por la IA
        await sendWhatsAppMessage(fromPhone, aiResponse.message);
        break;

      case 'QUOTE_ORIGIN':
        // Aquí asumiríamos que el texto es el Origen
        await sendWhatsAppMessage(fromPhone, "Excelente. Ahora dime, ¿cuál será la ciudad o dirección de destino?");
        await updateClientStep(fromPhone, 'QUOTE_DESTINATION');
        break;

      case 'QUOTE_DESTINATION':
        // Aquí asumiríamos que el texto es el Destino
        await sendWhatsAppMessage(fromPhone, "Perfecto. Finalmente, descríbeme un poco el volumen (¿Es una casa completa, un apartamento de 2 cuartos, o solo algunas cajas?). Si excede nuestro límite automático, te pasaré con un asesor.");
        await updateClientStep(fromPhone, 'QUOTE_VOLUME');
        break;
        
      case 'QUOTE_VOLUME':
        // Finalizamos el flujo base por ahora
        await sendWhatsAppMessage(fromPhone, "¡Gracias! He registrado tus datos. En unos minutos te enviaré el precio estimado o un agente se pondrá en contacto contigo para los detalles finales.");
        await updateClientStep(fromPhone, 'AGENT_HANDOFF'); // Lo pasamos a estado de revisión humana
        break;
        
      case 'AGENT_HANDOFF':
        // Si el usuario escribe y ya está asignado a humano, le decimos que espere
        await sendWhatsAppMessage(fromPhone, "Tu solicitud está siendo revisada por nuestro equipo. Un agente humano te responderá por este medio muy pronto.");
        break;

      default:
        await sendWhatsAppMessage(fromPhone, botConfig.greetingMessage);
        await updateClientStep(fromPhone, 'START');
        break;
    }

  } catch (error) {
    console.error('Error en el flujo de conversación:', error);
  }
};

const updateClientStep = async (phone: string, step: string) => {
  await prisma.client.update({
    where: { phone },
    data: { botStep: step }
  });
};
