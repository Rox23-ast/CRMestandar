/**
 * Servicio para interactuar con la Graph API de WhatsApp
 */

export const sendWhatsAppMessage = async (to: string, message: string): Promise<boolean> => {
  const token = process.env.WA_API_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("Faltan las credenciales de WhatsApp en el archivo .env (WA_API_TOKEN o WA_PHONE_NUMBER_ID)");
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
