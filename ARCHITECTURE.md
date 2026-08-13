# Arquitectura de Mudanzas Chico

Este documento describe la arquitectura, estructura y decisiones de diseño del proyecto backend "Mudanzas Chico". Es un **documento vivo** que debe ser actualizado continuamente a medida que el proyecto evolucione y se implementen nuevas características.

## 1. Visión General

El proyecto es una solución completa para "Mudanzas Chico", dividida en:
- **Backend (API RESTful):** Node.js, Express y TypeScript.
- **Frontend (Panel de Admin):** React (Vite) + TypeScript y Tailwind CSS.

Actúa como el sistema unificado para tres módulos principales:
- **Bot:** Gestión de integraciones y webhooks para WhatsApp, y su panel de configuración de IA.
- **CRM:** Panel de administración, gestión de clientes y seguimiento.
- **Cotizador:** Motor de cálculo de precios de mudanzas.

La persistencia de datos se maneja mediante **SQLite** y se gestiona con el ORM **Prisma**. Todo el sistema está diseñado para ser seguro, robusto y preparado para ser desplegado mediante Docker en DigitalOcean, persistiendo los datos de SQLite a través de un volumen de Docker seguro.

## 2. Estructura de Directorios (Domain-Driven Structure)

```text
/
├── /frontend           # SPA React (Vite) para el panel de administración
│   ├── /src
│   │   ├── App.tsx     # Layout principal y sistema de pestañas de configuración
│   │   └── index.css   # Estilos base y tipografías (Tailwind)
│   └── tailwind.config.js # Design System (Colores corporativos y fuentes)
│
├── /src                # Backend Node.js
│   ├── /bot            # Módulo del Chatbot (WhatsApp)
│   │   ├── /controllers# Webhook de Meta y Endpoints del Panel.
│   │   ├── /services   # Lógica (whatsappService, aiService, conversationFlow)
│   │   └── /templates  # Plantillas
│   ├── /crm            # Módulo del CRM
│   ├── /cotizador      # Módulo de Cotización
│   ├── /core           # Núcleo de la aplicación (Seguridad y Configuración)
│   └── index.ts        # Entrypoint
```

## 4. Evolución del Bot y Machine State

- **Flujos de Conversación:** Se implementó una "Máquina de Estados" para el Bot (mediante la columna `botStep` en la tabla de Clientes). Esto permite que el chatbot recuerde la fase del cliente (Ej. `START`, `QUOTE_ORIGIN`, `QUOTE_DESTINATION`, `AGENT_HANDOFF`) sin perder contexto.
- **Abstracción de IA (OpenAI):** Se integró el SDK oficial de OpenAI (`openai`) en `aiService.ts`. El chatbot utiliza el modelo `gpt-4o-mini` configurado con `response_format: { type: "json_object" }` para asegurar que las respuestas sean estructuradas. Esto permite que el LLM redacte respuestas naturales y extraiga la intención (`intent`) en una sola llamada a la API, optimizando costos y velocidad.

- **Seguridad en Capa HTTP:** Se utiliza `helmet` para proteger cabeceras y `express-rate-limit` para evitar abusos en los endpoints.
- **Validación de Webhooks (Meta/WhatsApp):** Se implementó una verificación de firma en el GET de `/api/bot/webhook` asegurando que solo peticiones auténticas desde Meta interactúen con el bot. Se responde instantáneamente con status 200 en el POST antes de procesar el mensaje para evitar que WhatsApp reintente peticiones.
- **Interfaz Gráfica (Frontend):** Se eligió React con Tailwind CSS para mapear de forma exacta la identidad visual.
- **Validación de Datos:** Todos los *inputs* deben ser validados utilizando `zod` antes de llegar a los servicios.
- **Autenticación:** Las rutas privadas (CRM/Cotizador administrativo) se protegen mediante JWT (JSON Web Tokens).
- **Tipado Estricto:** TypeScript se utiliza en modo estricto para evitar errores en tiempo de ejecución.
- **Testing:** Se utiliza `jest` (y `ts-jest`) para pruebas unitarias. Cada nueva funcionalidad en el `core` y módulos críticos debe estar cubierta por tests.

---
*Nota para los Agentes IA: Este documento debe actualizarse cada vez que se cree un nuevo módulo, tabla en la base de datos o se cambie la lógica de negocio fundamental.*
