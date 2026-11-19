# 🚀 GUÍA PASO A PASO: PROYECTO INDEPENDIENTE DE SUPABASE PARA CLONECINEMA

Esta guía documenta la creación, configuración y despliegue del proyecto de Supabase para **CloneCinema**, garantizando **1 GB de almacenamiento exclusivo y limpio** para los renders, keyframes 9:16 y audios sin riesgo de agotar cuota.

---

## 📌 ¿Por qué un proyecto nuevo e independiente?
1. **1 GB de Almacenamiento 100% Libre:** No compartes cuota con el Portal Neural Nexus, ni con los videos pesados de otros proyectos, ni con bots de WhatsApp.
2. **5 GB de Tráfico (Egress) Limpio:** Carga ultra-rápida de imágenes y videos en celulares y web sin advertencias de cuota ni riesgo de error 402.
3. **Aislamiento de Seguridad:** Cada nodo federado tiene sus propias credenciales, buckets y bases de datos aisladas.

---

## 🛠️ PASO 1: Crear el Proyecto en Supabase
1. Ingresa a **[https://supabase.com](https://supabase.com)**.
2. Haz clic en **"New project"**.
3. Configuración recomendada:
   * **Organization:** `Quantum Ops` (o tu organización dedicada).
   * **Project name:** `CloneCinema-Studio`.
   * **Database Password:** `Be****************` (consultar valor en `credenciales.md`).
   * **Region:** `Americas` (`East US - Ohio / us-east-2` o `East US - us-east-1`).
   * **Pricing Plan:** `Free tier` ($0/mes — incluye 1 GB Storage, 500 MB Postgres, 5 GB Egress).
4. Espera ~1 minuto mientras se aprovisiona la infraestructura.

---

## ⚡ PASO 2: Ejecutar la Migración SQL
Una vez que el proyecto esté listo:
1. En el menú lateral izquierdo, entra al **SQL Editor** (icono `>_`).
2. Haz clic en **"New query"**.
3. Abre el archivo de migración:
   📁 [`supabase/migrations/0002_clonecinema_full_setup.sql`](file:///c:/Users/Usuario/Documents/CloneCinema/supabase/migrations/0002_clonecinema_full_setup.sql)
4. Copia su contenido completo, pégalo en el editor y presiona **Run** (`Ctrl + Enter`).
5. Aparecerá el mensaje: **`Success. No rows returned`**.

> [!NOTE]
> **Detalle técnico de Postgres:** La columna `"references"` en la tabla `projects` debe ir entre comillas dobles porque `REFERENCES` es palabra reservada en SQL. El script ya incluye esta corrección.

Objetos creados automáticamente:
* ✅ **Tablas:** `profiles`, `user_credits`, `transactions`, `ai_jobs` y `projects`.
* ✅ **Storage Buckets públicos:** `keyframes` (25 MB máx), `videos` (100 MB máx), `audio` (50 MB máx).
* ✅ **Seguridad RLS y Triggers:** Creación automática de perfiles con 10 créditos de bienvenida.

---

## 🔑 PASO 3: Nueva Arquitectura de Claves de Supabase (2026)
Supabase modernizó los nombres de sus credenciales:

| Clave Antigua | Nueva Clave (2026) | Prefijo | Uso y Nivel de Seguridad |
| :--- | :--- | :--- | :--- |
| **`anon key`** | **`Publishable key`** | `sb_publishable_...` | **Pública**. Se usa en el frontend (navegador y móvil). Protegida por RLS. |
| **`service_role secret`** | **`Secret key`** | `sb_secret_...` | **Privada**. Se usa en el backend / servidor para operaciones administrativas y Kaggle. |

Para consultarlas:
1. Entra a **Project Settings** ⚙️ > **API Keys** (o haz clic en el botón superior **"Connect"**).
2. Obtienes:
   * **Project URL:** `https://<project-id>.supabase.co`
   * **Publishable key:** `sb_publishable_...`
   * **Secret key:** `sb_secret_...`

---

## 🔗 PASO 4: Conectar las Claves a CloneCinema

### A. En tu Entorno Local (PC) — ¡YA APLICADO POR BEATRIZ! ✅
Tu archivo local [`CloneCinema/.env`](file:///c:/Users/Usuario/Documents/CloneCinema/.env) (blindado e ignorado por `.gitignore`) ya contiene todas las variables activas:
```env
# Supabase Cloud — CloneCinema-Studio
SUPABASE_URL="https://micj****************.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_q9********************"
SUPABASE_ANON_KEY="sb_publishable_q9********************"
SUPABASE_SECRET_KEY="sb_secret_1O********************"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_1O********************"
SUPABASE_JWKS_URL="https://micj****************.supabase.co/auth/v1/.well-known/jwks.json"

VITE_SUPABASE_URL="https://micj****************.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_q9********************"
```
*(Las claves reales y completas permanecen blindadas en tu archivo local privado `credenciales.md`).*

### B. En el Despliegue de Vercel (Producción Web & Móvil) — ¡YA APLICADO POR BEATRIZ! ✅
> [!IMPORTANT]
> **Wily, NO necesitas meter manualmente las variables en la web de Vercel.**  
> Beatriz ya las inyectó directamente mediante el CLI de Vercel (`vercel env add`) y re-desplegó la versión final de producción.

Si en el futuro deseas inspeccionarlas en el panel de Vercel, están en:
👉 **[https://vercel.com/willy-devs-projects/node-clonecinema/settings/environment-variables](https://vercel.com/willy-devs-projects/node-clonecinema/settings/environment-variables)**

Variables configuradas en Producción:
* `SUPABASE_URL`
* `SUPABASE_ANON_KEY`
* `SUPABASE_PUBLISHABLE_KEY`
* `SUPABASE_SERVICE_ROLE_KEY`
* `SUPABASE_SECRET_KEY`
* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_ANON_KEY`
* `GEMINI_API_KEY`
* `KAGGLE_USERNAME`
* `KAGGLE_KEY`
* `ALLOW_ANONYMOUS_GENERATION`

---

## 🌐 URLs Oficiales del Nodo CloneCinema
* 🚀 **Despliegue Vercel:** [node-clonecinema.vercel.app](https://node-clonecinema.vercel.app)
* 🐙 **Repositorio GitHub:** [Neural-Hive-Federation/node_clonecinema](https://github.com/Neural-Hive-Federation/node_clonecinema)
* ⚡ **Dashboard Supabase:** [Panel Supabase](https://supabase.com/dashboard) (Proyecto `CloneCinema-Studio`)
