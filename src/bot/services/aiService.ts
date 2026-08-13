import OpenAI from 'openai';

/**
 * Servicio encargado de gestionar la integración con OpenAI.
 */

interface AIResponse {
  message: string;
  intent: 'QUOTE' | 'GREETING' | 'SUPPORT' | 'UNKNOWN';
}

export const processMessageWithAI = async (
  userMessage: string, 
  systemPrompt: string, 
  limitations: string,
  customRules: any = []
): Promise<AIResponse> => {
  
  console.log(`[AI Engine] Analizando mensaje con personalidad: "${systemPrompt.substring(0, 30)}..."`);
  
  // Format custom rules into a string for the prompt
  let customRulesText = '';
  if (Array.isArray(customRules) && customRules.length > 0) {
    customRulesText = "REGLAS DE RESPUESTAS ESPECÍFICAS (Respuestas predefinidas por el administrador):\n" + 
      customRules.map(rule => `- Si el usuario dice algo relacionado con: [${rule.keywords}]. DEBES RESPONDER EXACTAMENTE ESTO: "${rule.response}"`).join('\n') + 
      "\n\n";
  }
  
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️ [AI Engine] No se encontró OPENAI_API_KEY. Usando fallback Mock NLP.");
    return mockNLP(userMessage);
  }

  try {
    // Inicializar OpenAI (usa process.env.OPENAI_API_KEY por defecto)
    const openai = new OpenAI();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Utilizamos gpt-4o-mini por ser más rápido y económico para este tipo de tareas
      messages: [
        {
          role: "system",
          content: `
            ${systemPrompt}
            
            ${customRulesText}
            REGLAS Y LIMITACIONES ESTRICTAS QUE NO DEBES ROMPER:
            ${limitations}

            Tu objetivo es responder al usuario de forma natural siguiendo tu personalidad y, además, detectar la intención real de su mensaje.
            
            DEBES RESPONDER EXCLUSIVAMENTE EN FORMATO JSON válido con la siguiente estructura exacta:
            {
              "message": "Tu respuesta redactada en lenguaje natural para el usuario, respetando tu personalidad.",
              "intent": "QUOTE"
            }

            La clave "intent" debe ser ESTRICTAMENTE uno de los siguientes valores en mayúsculas:
            - "QUOTE": Si el usuario menciona cotizar, precios, costos, mudanzas, trasteos o envíos.
            - "GREETING": Si es solo un saludo inicial sin una petición explícita.
            - "SUPPORT": Si el usuario tiene un problema, reclamo o necesita ayuda general con un servicio activo.
            - "UNKNOWN": Para cualquier otra cosa, preguntas fuera de contexto o si no estás seguro.
          `
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      response_format: { type: "json_object" }, // Obliga a OpenAI a devolver JSON puro
      temperature: 0.5, // Equilibrio entre creatividad (personalidad) y rigor (formato JSON)
    });

    const resultText = completion.choices[0]?.message?.content;
    
    if (resultText) {
      const parsedResult = JSON.parse(resultText) as AIResponse;
      return parsedResult;
    }
  } catch (error) {
    console.error('[AI Engine] Error procesando con OpenAI:', error);
  }

  // Fallback si la API de OpenAI falla o agota el timeout
  return {
    message: "En este momento estoy experimentando algunas demoras de conexión. ¿Te gustaría cotizar una mudanza o prefieres hablar con un agente humano?",
    intent: 'UNKNOWN'
  };
};

/**
 * Mock rudimentario si no hay API Key configurada.
 */
const mockNLP = (userMessage: string): AIResponse => {
  const lowerMsg = userMessage.toLowerCase();
  
  if (lowerMsg.includes('cotizar') || lowerMsg.includes('precio') || lowerMsg.includes('costo') || lowerMsg.includes('mudanza')) {
    return {
      message: "[MOCK] ¡Claro! Puedo ayudarte con una cotización aproximada. ¿De qué ciudad a qué ciudad sería la mudanza?",
      intent: 'QUOTE'
    };
  }

  if (lowerMsg.includes('hola') || lowerMsg.includes('buenos dias') || lowerMsg.includes('buenas')) {
    return {
      message: "[MOCK] ¡Hola! Qué gusto saludarte.",
      intent: 'GREETING'
    };
  }

  return {
    message: "[MOCK] Entiendo. ¿Te gustaría cotizar una mudanza o prefieres hablar con un agente humano?",
    intent: 'UNKNOWN'
  };
};
