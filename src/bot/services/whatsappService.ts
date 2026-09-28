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
