import OpenAI from 'openai';
import { getRawCredentials } from '../../crm/services/credentialService';

/**
 * Servicio encargado de gestionar la integración de IA.
 * Soporta OpenAI, Anthropic (Claude) y Google Gemini. Se usa el primer
 * proveedor configurado que devuelva una respuesta válida (cadena de
 * fallback), para que el bot siga funcionando si uno de ellos falla.
 */

export type BotIntent = 'QUOTE' | 'GREETING' | 'SUPPORT' | 'UNKNOWN';

export interface AIResponse {
  message: string;
  intent: BotIntent;
}

interface QuickResponseRule {
  id?: string;
  title?: string;
  keywords?: string;
  response?: string;
}

const INTENTS: BotIntent[] = ['QUOTE', 'GREETING', 'SUPPORT', 'UNKNOWN'];

const OPENAI_MODEL = 'gpt-4o-mini';
const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
const GEMINI_MODEL = 'gemini-2.0-flash';

const buildSystemPrompt = (systemPrompt: string, limitations: string, customRules: QuickResponseRule[] = []): string => {
  // Format custom rules into a string for the prompt
  let customRulesText = '';
  if (customRules.length > 0) {
    customRulesText = "REGLAS DE RESPUESTAS ESPECÍFICAS (Respuestas predefinidas por el administrador):\n" + 
      customRules.map(rule => `- Si el usuario dice algo relacionado con: [${rule.keywords}]. DEBES RESPONDER EXACTAMENTE ESTO: "${rule.response}"`).join('\n') + 
      "\n\n";
  }

  return `
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
  `;
};

// Parses the JSON the providers return. Tolerates markdown fences that some
// models add around the JSON block.
const parseAIResponse = (raw: string): AIResponse | null => {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as AIResponse;
    if (typeof parsed.message === 'string' && parsed.message && INTENTS.includes(parsed.intent)) {
      return { message: parsed.message, intent: parsed.intent };
    }
    return null;
  } catch {
    return null;
  }
};

const callOpenAI = async (
  apiKey: string,
  prompt: string,
  userMessage: string
): Promise<AIResponse | null> => {
  try {
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' }, // Obliga a OpenAI a devolver JSON puro
      temperature: 0.5, // Equilibrio entre creatividad (personalidad) y rigor (formato JSON)
    });

    const resultText = completion.choices[0]?.message?.content;
    return resultText ? parseAIResponse(resultText) : null;
  } catch (error) {
    console.error('[AI Engine] Error procesando con OpenAI:', error);
    return null;
  }
};

const callAnthropic = async (
  apiKey: string,
  prompt: string,
  userMessage: string
): Promise<AIResponse | null> => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        temperature: 0.5,
        system: prompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error('[AI Engine] Error procesando con Anthropic:', response.status, await response.text());
      return null;
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = Array.isArray(data.content)
      ? data.content.map((block) => block.text ?? '').join('')
      : '';
    return text ? parseAIResponse(text) : null;
  } catch (error) {
    console.error('[AI Engine] Error procesando con Anthropic:', error);
    return null;
  }
};

const callGemini = async (
  apiKey: string,
  prompt: string,
  userMessage: string
): Promise<AIResponse | null> => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.5,
        },
      }),
    });

    if (!response.ok) {
      console.error('[AI Engine] Error procesando con Gemini:', response.status, await response.text());
      return null;
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return text ? parseAIResponse(text) : null;
  } catch (error) {
    console.error('[AI Engine] Error procesando con Gemini:', error);
    return null;
  }
};

export const processMessageWithAI = async (
  userMessage: string, 
  systemPrompt: string, 
  limitations: string,
  customRules: any = []
): Promise<AIResponse> => {
  
  console.log(`[AI Engine] Analizando mensaje con personalidad: "${systemPrompt.substring(0, 30)}..."`);

  const prompt = buildSystemPrompt(systemPrompt, limitations, Array.isArray(customRules) ? customRules : []);

  const creds = await getRawCredentials();

  // Cadena de proveedores en orden de preferencia: solo los configurados.
  const providers: Array<{ name: string; call: () => Promise<AIResponse | null> }> = [];
  if (creds.OPENAI_API_KEY) {
    providers.push({ name: 'OpenAI', call: () => callOpenAI(creds.OPENAI_API_KEY, prompt, userMessage) });
  }
  if (creds.ANTHROPIC_API_KEY) {
    providers.push({ name: 'Anthropic', call: () => callAnthropic(creds.ANTHROPIC_API_KEY, prompt, userMessage) });
  }
  if (creds.GEMINI_API_KEY) {
    providers.push({ name: 'Gemini', call: () => callGemini(creds.GEMINI_API_KEY, prompt, userMessage) });
  }

  if (providers.length === 0) {
    console.warn("⚠️ [AI Engine] No se encontró ninguna API key de IA (OpenAI, Anthropic o Gemini). Usando fallback Mock NLP.");
    return mockNLP(userMessage);
  }

  for (const provider of providers) {
    const result = await provider.call();
    if (result) return result;
    console.warn(`[AI Engine] ${provider.name} no devolvió una respuesta válida; probando el siguiente proveedor.`);
  }

  // Fallback si todos los proveedores fallan o agotan el timeout
  return {
    message: "En este momento estoy experimentando algunas demoras de conexión. ¿Te gustaría cotizar una mudanza o prefieres hablar con un agente humano?",
    intent: 'UNKNOWN'
  };
};

/**
 * Mock rudimentario si no hay ninguna API Key configurada.
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
