/**
 * Servicio para interactuar con la Graph API de WhatsApp
 */

import { getRawCredentials } from '../../crm/services/credentialService';

export const sendWhatsAppMessage = async (to: string, message: string): Promise<boolean> => {
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
