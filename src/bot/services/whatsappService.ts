/**
 * Servicio para interactuar con la Graph API de WhatsApp
 */

import { getRawCredentials } from '../../crm/services/credentialService';

/**
 * Envía un mensaje de texto por WhatsApp.
 * Si se pasa contextMessageId (externalId del mensaje al que se responde),
 * Meta lo muestra como cita/reply en el chat del cliente.
 */
export const sendWhatsAppMessage = async (to: string, message: string, contextMessageId?: string): Promise<boolean> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;
  const phoneNumberId = creds.WA_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("Faltan las credenciales de WhatsApp (WA_API_TOKEN o WA_PHONE_NUMBER_ID)");
    return false;
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message },
    ...(contextMessageId ? { context: { message_id: contextMessageId } } : {})
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error enviando mensaje a WhatsApp:', JSON.stringify(errorData));
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error de red al intentar enviar mensaje a WhatsApp:', error);
    return false;
  }
};

/**
 * Envía un documento PDF por WhatsApp. Meta descarga el archivo desde una URL
 * pública (GET sin headers de auth); la URL debe terminar en .pdf.
 * Fuera de la ventana de 24h Meta rechaza el envío (error 131047) y devuelve false.
 */
export const sendWhatsAppDocument = async (to: string, pdfUrl: string, caption?: string): Promise<boolean> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;
  const phoneNumberId = creds.WA_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("Faltan las credenciales de WhatsApp (WA_API_TOKEN o WA_PHONE_NUMBER_ID)");
    return false;
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'document',
    document: {
      link: pdfUrl,
      filename: 'cotizacion.pdf',
      ...(caption ? { caption } : {})
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error enviando documento a WhatsApp:', JSON.stringify(errorData));
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error de red al intentar enviar documento a WhatsApp:', error);
    return false;
  }
};

export type WhatsAppMediaType = 'image' | 'audio' | 'video' | 'document';

/**
 * Envía un mensaje usando una plantilla de WhatsApp Business aprobada.
 * Requerido para contactar números que nunca han escrito al negocio
 * (la ventana de 24h exige plantilla para el primer mensaje saliente).
 * `parameters` rellena las variables del cuerpo en orden ({{1}}, {{2}}, …).
 */
export const sendWhatsAppTemplate = async (
  to: string,
  templateName: string,
  language: string,
  parameters: string[]
): Promise<boolean> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;
  const phoneNumberId = creds.WA_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error('Faltan las credenciales de WhatsApp (WA_API_TOKEN o WA_PHONE_NUMBER_ID)');
    return false;
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(parameters.length > 0
        ? {
            components: [
              {
                type: 'body',
                parameters: parameters.map((value) => ({ type: 'text', text: value }))
              }
            ]
          }
        : {})
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error enviando plantilla de WhatsApp:', JSON.stringify(errorData));
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error de red al enviar plantilla de WhatsApp:', error);
    return false;
  }
};

/**
 * Lista las plantillas de la cuenta de WhatsApp Business (WABA) vía Graph API.
 * Devuelve nombre, idioma, estado, categoría y cantidad de variables del cuerpo.
 */
export const listWhatsAppTemplates = async (): Promise<
  { name: string; language: string; status: string; category: string; variableCount: number }[]
> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;
  const wabaId = creds.WA_WABA_ID;

  if (!token || !wabaId) {
    console.error('Faltan credenciales para listar plantillas (WA_API_TOKEN o WA_WABA_ID)');
    return [];
  }

  const url = `https://graph.facebook.com/v17.0/${wabaId}/message_templates?fields=name,status,category,language,components`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error listando plantillas de WhatsApp:', errorText.slice(0, 300));
      return [];
    }

    const payload = await response.json() as {
      data?: {
        name: string;
        status: string;
        category: string;
        language: string;
        components?: { type: string; text?: string }[];
      }[]
    };

    return (payload.data ?? []).map((template) => {
      const body = template.components?.find((component) => component.type === 'BODY')?.text ?? '';
      const variableCount = (body.match(/\{\{\d+\}\}/g) ?? []).length;
      return {
        name: template.name,
        language: template.language,
        status: template.status,
        category: template.category,
        variableCount
      };
    });
  } catch (error) {
    console.error('Error de red listando plantillas de WhatsApp:', error);
    return [];
  }
};

/**
 * Sube un archivo a la Media API de Meta y devuelve el media id.
 * El contenido debe ser binario (multipart) con su MIME correcto;
 * Meta rechaza formatos no soportados (p. ej. audio/webm).
 */
export const uploadWhatsAppMedia = async (
  buffer: Buffer,
  contentType: string,
  filename: string
): Promise<{ id: string | null; error?: string }> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;
  const phoneNumberId = creds.WA_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("Faltan las credenciales de WhatsApp (WA_API_TOKEN o WA_PHONE_NUMBER_ID)");
    return { id: null, error: 'WhatsApp credentials not configured' };
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/media`;

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: contentType }), filename);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error subiendo media a WhatsApp:', errorText);
      return { id: null, error: errorText.slice(0, 300) };
    }

    const data = await response.json() as { id?: string };
    return { id: data?.id ?? null };
  } catch (error) {
    console.error('Error de red al subir media a WhatsApp:', error);
    return { id: null, error: 'Network error uploading media' };
  }
};

/**
 * Envía un archivo ya subido a la Media API (por media id) como imagen,
 * audio, video o documento. caption aplica a imagen/video/documento.
 */
export const sendWhatsAppMedia = async (
  to: string,
  type: WhatsAppMediaType,
  mediaId: string,
  caption?: string,
  filename?: string
): Promise<boolean> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;
  const phoneNumberId = creds.WA_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("Faltan las credenciales de WhatsApp (WA_API_TOKEN o WA_PHONE_NUMBER_ID)");
    return false;
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

  const media: Record<string, unknown> = { id: mediaId };
  if (caption && type !== 'audio') media.caption = caption;
  if (type === 'document' && filename) media.filename = filename;

  const data = {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: media
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error enviando media a WhatsApp:', JSON.stringify(errorData));
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error de red al intentar enviar media a WhatsApp:', error);
    return false;
  }
};

/**
 * Resuelve un media id de WhatsApp a su URL temporal de descarga y MIME.
 */
export const getWhatsAppMedia = async (
  mediaId: string
): Promise<{ url: string; mimeType: string } | null> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;

  if (!token) {
    console.error("Faltan las credenciales de WhatsApp (WA_API_TOKEN)");
    return null;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      console.error('Error resolviendo media de WhatsApp:', response.status);
      return null;
    }

    const data = await response.json() as { url?: string; mime_type?: string };
    if (!data.url) return null;
    return { url: data.url, mimeType: data.mime_type ?? 'application/octet-stream' };
  } catch (error) {
    console.error('Error de red resolviendo media de WhatsApp:', error);
    return null;
  }
};

/**
 * Descarga el binario de una URL de media de WhatsApp (requiere el token).
 */
export const downloadWhatsAppMedia = async (url: string): Promise<Buffer | null> => {
  const creds = await getRawCredentials();
  const token = creds.WA_API_TOKEN;

  if (!token) {
    console.error("Faltan las credenciales de WhatsApp (WA_API_TOKEN)");
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      console.error('Error descargando media de WhatsApp:', response.status);
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error('Error de red descargando media de WhatsApp:', error);
    return null;
  }
};
