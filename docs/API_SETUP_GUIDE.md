# Guía de Configuración de APIs (Producción)

Para que el backend de Mudanzas Chico funcione, debes configurar las credenciales en el archivo `.env`.

## 1. OpenAI (Inteligencia Artificial)
Requisito: Una cuenta de desarrollador en OpenAI con saldo recargado (mínimo ~$5 USD). *Ojo: Pagar ChatGPT Plus no incluye acceso a la API.*

**Pasos:**
1. Ve a [platform.openai.com](https://platform.openai.com).
2. Entra a **Settings > Billing** y añade un método de pago.
3. Ve a la sección **API Keys** y haz clic en "Create new secret key".
4. Copia ese código (empieza con `sk-`) y pégalo en tu `.env`:
   `OPENAI_API_KEY="sk-..."`

## 2. API de WhatsApp (Meta for Developers)
Requisito: Una cuenta de Facebook y un Facebook Business Manager verificado (o en proceso).

**Pasos para obtener los datos:**
1. Ve a [developers.facebook.com](https://developers.facebook.com) y crea una App de tipo "Negocios" (Business).
2. Añade el producto **WhatsApp** a tu aplicación.
3. En el menú izquierdo, ve a **WhatsApp > Configuración de la API**.
4. Allí verás un **Token de acceso temporal** (dura 24h, ideal para pruebas). *Para producción, debes crear un "Usuario del Sistema" en tu Business Manager para obtener un token permanente.*
   -> Pégalo en tu `.env` como `WA_API_TOKEN`.
5. En esa misma pantalla, verás el **Identificador del número de teléfono** (Phone Number ID).
   -> Pégalo en tu `.env` como `WA_PHONE_NUMBER_ID`.
6. Copia también el **App Secret** de la aplicación y guárdalo como `WA_APP_SECRET`. El backend lo usa para validar `x-hub-signature-256` y rechazar peticiones falsificadas.

## 3. Inicialización del primer usuario CRM

Antes de usar las rutas CRM, configura en `.env` dos secretos distintos:

```env
JWT_SECRET="una_clave_larga_y_aleatoria_para_jwt"
CRM_BOOTSTRAP_TOKEN="otro_token_largo_y_aleatorio"
```

Con el backend iniciado, ejecuta una sola vez una petición a `POST /api/crm/auth/bootstrap`:

```json
{
  "name": "Administrador",
  "email": "admin@mudanzaschico.com",
  "password": "UnaClaveSeguraDe12Caracteres!",
  "bootstrapToken": "el_valor_de_CRM_BOOTSTRAP_TOKEN"
}
```

La respuesta contiene un JWT temporal para acceder al CRM. El endpoint se bloquea permanentemente después de crear el primer usuario.

## 4. Configuración del Webhook y el Verify Token
El Webhook es la forma en que WhatsApp le avisa a nuestro servidor que llegó un nuevo mensaje.

**El "Verify Token" (Token de Verificación):**
Este token **NO** te lo da Facebook. **Es una contraseña que TÚ te inventas** para asegurarte de que quien intenta conectar el webhook sea realmente Facebook.

**Pasos para conectarlo:**
1. Invéntate una contraseña segura sin espacios, por ejemplo: `MudanzasChicoSeguro2026`.
2. Escribe esa contraseña en tu archivo `.env`:
   `WA_VERIFY_TOKEN="MudanzasChicoSeguro2026"`
3. (Obligatorio) Reinicia tu servidor Node.js para que lea el nuevo `.env`.
4. Ve al portal de Meta for Developers > WhatsApp > Configuración.
5. Haz clic en **Configurar Webhook**. Te pedirá dos cosas:
   - **URL de devolución de llamada:** La dirección de tu servidor expuesta a internet (Ej. `https://api.mudanzaschico.com/api/bot/webhook`). *Si estás en local, debes usar Ngrok para crear una URL pública (ej. `https://tu-ngrok.app/api/bot/webhook`).*
   - **Token de Verificación:** Aquí pegas la contraseña que inventaste (`MudanzasChicoSeguro2026`).
6. Haz clic en "Verificar y Guardar". Meta enviará una petición a tu servidor, el servidor verá que las contraseñas coinciden, responderá "OK", y quedarán conectados.
7. Finalmente, en "Campos del Webhook", asegúrate de suscribirte al evento llamado **`messages`**.
