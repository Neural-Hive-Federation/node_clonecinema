# 🚀 GUÍA PASO A PASO: CREAR PROYECTO INDEPENDIENTE DE SUPABASE PARA CLONECINEMA

Esta guía te permite crear y configurar un nuevo proyecto de Supabase en menos de 5 minutos, garantizando **1 GB de almacenamiento exclusivo y limpio** para los renders, keyframes 9:16 y audios de **CloneCinema**.

---

## 📌 ¿Por qué un proyecto nuevo e independiente?
1. **1 GB de Almacenamiento 100% Libre:** No compartes cuota con el Portal Neural Nexus, ni con los videos antiguos de agosto/septiembre, ni con los bots de WhatsApp.
2. **5 GB de Tráfico (Egress) Limpio:** Carga ultra-rápida de imágenes y videos en celulares y web sin advertencias de cuota ni riesgo de error 402.
3. **Aislamiento de Seguridad:** Cada nodo federado tiene sus propias credenciales y bases de datos aisladas.

---

## 🛠️ PASO 1: Crear el Proyecto en Supabase
1. Ingresa a **[https://supabase.com](https://supabase.com)** (puedes usar una cuenta nueva o crear una nueva organización en tu cuenta).
2. Haz clic en el botón verde **"New project"**.
3. Configura los campos:
   * **Name:** `node-clonecinema` (o `CloneCinema-Studio`)
   * **Database Password:** Escribe o genera una contraseña segura (guárdala en tu gestor de notas).
   * **Region:** Selecciona `East US (North Virginia - us-east-1)` (óptima para sincronizar con los servidores de Vercel y Kaggle con mínima latencia).
   * **Pricing Plan:** `Free tier` ($0/mes — incluye 1 GB Storage, 500 MB Postgres, 5 GB Egress).
4. Haz clic en **"Create new project"** y espera ~1 minuto a que termine de aprovisionarse.

---

## ⚡ PASO 2: Ejecutar la Migración SQL (1 Clic)
Una vez que el proyecto esté listo en la pantalla principal:
1. En el menú lateral izquierdo, haz clic en el icono de **SQL Editor** (parece una terminal con corchetes `>_`).
2. Haz clic en **"New query"**.
3. Abre el archivo de migración que te dejé preparado en el repositorio:
   📁 [`supabase/migrations/0002_clonecinema_full_setup.sql`](file:///c:/Users/Usuario/Documents/CloneCinema/supabase/migrations/0002_clonecinema_full_setup.sql)
4. Copia todo su contenido, pégalo en el editor de Supabase y presiona el botón verde **"Run"** (o `Ctrl + Enter`).
5. Verás el mensaje **`Success. No rows returned`**.
   * ✅ Se habrán creado las tablas: `profiles`, `user_credits`, `transactions`, `ai_jobs` y `projects`.
   * ✅ Se habrán creado los 3 Storage Buckets públicos: `keyframes`, `videos` y `audio`.
   * ✅ Se habrán activado las reglas RLS y triggers de seguridad.

---

## 🔑 PASO 3: Copiar las Claves API del Proyecto
1. En el menú lateral izquierdo, ve al engranaje abajo del todo: **Project Settings** ⚙️.
2. En el submenú de configuración, haz clic en **API**.
3. Copia estos 3 valores clave:
   * **Project URL:** (ejemplo: `https://abcdefghijklm.supabase.co`)
   * **anon public key:** (clave larga que empieza por `eyJ...`)
   * **service_role secret:** (haz clic en *Reveal* para copiar esta clave secreta que empieza por `eyJ...`)

---

## 🔗 PASO 4: Conectar las Claves a CloneCinema

### A. En tu Entorno Local (PC):
Abre tu archivo `.env` en `CloneCinema/.env` y añade las 3 líneas:
```env
SUPABASE_URL="https://tu-proyecto.supabase.co"
SUPABASE_ANON_KEY="eyJ-tu-clave-anonima..."
SUPABASE_SERVICE_ROLE_KEY="eyJ-tu-clave-service-role..."
```

### B. En el Despliegue de Vercel (Celular y Web):
1. Ve al panel de Vercel de tu proyecto:
   👉 **[https://vercel.com/willy-devs-projects/node-clonecinema/settings/environment-variables](https://vercel.com/willy-devs-projects/node-clonecinema/settings/environment-variables)**
2. Agrega las 3 variables con sus valores:
   * `SUPABASE_URL`
   * `SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY`
   *(Asegúrate de marcar los entornos: **Production**, **Preview** y **Development**).*
3. Haz clic en **Save** y despliega de nuevo (o indícamelo y yo misma lo promuevo con un comando).

---

## ✨ ¡LISTO!
Desde ese instante, cada imagen 9:16 generada, cada audio y cada video se guardará en tu nuevo bucket de Supabase con URLs públicas de alta velocidad y sincronización bidireccional en tiempo real entre tu computador y tu teléfono móvil.
