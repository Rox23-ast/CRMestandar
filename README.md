# DevGlobalConfig: Configuraciones de Desarrollo Reutilizables

Este directorio contiene plantillas y configuraciones listas para usar en tus próximos proyectos de software. Ha sido diseñado para automatizar las mejores prácticas, asegurar la calidad del código mediante automatizaciones locales (Git Hooks) y optimizar la interacción con agentes de Inteligencia Artificial (IA).

---

## Contenido y Cómo Usarlo

### 1. Reglas de Agentes de IA (`/AI-Agent-Rules`)
Optimiza la forma en que los asistentes de IA interactúan con tus proyectos, ahorrando tiempo y evitando respuestas incorrectas.

* **`CLAUDE.md`**: Cópialo en la raíz de tu proyecto. Define cómo debe estructurar las respuestas la IA, la concisión deseada, reglas de idiomas (por ejemplo, código en inglés e interfaz en español) y reglas de aprobación antes de realizar cambios de archivos.
* **`context-rules-template.md`**: Plantilla de guía para crear un archivo `AGENTS.md` en tu repositorio. Úsala para documentar las tecnologías, comandos, estructura de carpetas y estándares de tu proyecto para que la IA los comprenda perfectamente desde el primer instante.

### 2. Automatizaciones de Git (`/Git-Hooks`)
Garantiza que ningún commit con errores o advertencias críticas de compilación llegue a tu repositorio de Git.

* **`verify-commit.ps1`**: Script que compila el código y ejecuta las pruebas unitarias. Si algo falla, impide el commit.
  * *Cómo usar:* Coloca este archivo dentro de una carpeta llamada `scripts/` en la raíz de tu proyecto.
* **`install-hooks.ps1`**: Instalador del hook pre-commit de Git.
  * *Cómo usar:* Ejecuta este script desde PowerShell en la raíz de tu repositorio Git para activar automáticamente `verify-commit.ps1`.

### 3. Reglas de Git Ignore (`/Git-Ignore`)
* **`.gitignore`**: Plantilla unificada y súper completa para proyectos de software (.NET, Node.js, Python), editores modernos (VS Code, Rider, Visual Studio) y archivos temporales de los sistemas operativos (Windows Thumbs.db, macOS .DS_Store).
  * *Cómo usar:* Cópialo en la raíz de tu nuevo repositorio Git y renombralo como `.gitignore`.

### 4. Estilo de Código (`/Editor-Config`)
* **`.editorconfig`**: Archivo de configuración global que estandariza las tabulaciones, espacios, saltos de línea y formateo de código en cualquier editor (VS Code, Rider, Visual Studio, Sublime, etc.).
  * *Cómo usar:* Cópialo en la raíz de tu repositorio. Tu editor preferido leerá este archivo automáticamente y formateará tu código bajo las mismas reglas siempre.

---

## Guía Rápida para un Nuevo Proyecto

Cuando inicies un nuevo proyecto, simplemente realiza los siguientes pasos:

1. Copia `.gitignore` y `.editorconfig` a la raíz de tu nuevo repositorio.
2. Crea la carpeta `scripts/` en la raíz y copia `verify-commit.ps1` dentro de ella.
3. Ejecuta `install-hooks.ps1` desde PowerShell en tu raíz para registrar el hook de Git.
4. Copia `CLAUDE.md` a la raíz del repositorio y crea un archivo `AGENTS.md` adaptado a las tecnologías del nuevo proyecto usando la plantilla de `context-rules-template.md`.

¡Y listo! Tu nuevo proyecto estará completamente blindado, estandarizado y listo para trabajar de la mano con programadores humanos y agentes de IA de forma óptima.
