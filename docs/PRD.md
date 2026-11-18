# PRD & System Architecture — CloneCinema SaaS MVP

**Proyecto:** SaaS AI Media Generator (Frutinovelas / CloneCinema MVP)
**Versión:** 2.0
**Estrategia:** Monolito Node/React + Supabase (Postgres, Auth, Storage) + Kaggle GPU + Wompi (COP)

---

## 1. Visión general

CloneCinema es un estudio creativo conversacional que produce video vertical para Shorts, TikTok y Reels, con dos públicos:

- **Creadores / canales automáticos:** consumo recurrente por créditos o planes mensuales.
- **Anunciantes / negocios locales:** video publicitario puntual, pago por uso.

El producto ya existía como estudio de escritorio con Gemini (chat director, plan, storyboard, reparto, audio, render). Esta versión añade la capa SaaS: cuentas, saldo de créditos, cómputo de IA gratuito en Kaggle y cobro en pesos colombianos.

## 2. Arquitectura

```
[ React + Vite ]  <-->  [ Express (Node) ]  <-->  [ Supabase Postgres + Auth + Storage ]
                              |                              ^
                              |                              |
                              +--> [ Kaggle Kernels T4 ]     +--> [ Wompi Checkout / Webhook ]
                                   Flux.1-schnell
                                   Wan 2.1 I2V
```

- **Frontend:** React 19 + Vite + Tailwind 4. La sesión la gestiona `@supabase/supabase-js` en el navegador (email/password y Google OAuth); el token viaja al backend en `Authorization: Bearer`.
- **Backend:** Express. Verifica el JWT con la service role (`auth.getUser`), cobra créditos, orquesta Kaggle, sube artefactos a Storage y valida el webhook de Wompi.
- **Base de datos:** Supabase. RLS activo; solo la service role escribe saldo y transacciones.
- **Cómputo IA:** dos kernels privados en Kaggle con GPU T4. El backend inyecta el payload en el código del kernel, hace `kaggle kernels push`, sondea el estado, descarga el artefacto y lo publica en Storage.
- **Pagos:** Wompi (Nequi, PSE, Bancolombia, tarjetas) con firma de integridad SHA-256 y webhook con checksum.

### Flujo de una generación

1. El usuario pulsa *Keyframe* (1 crédito) o *Render* (5 créditos).
2. `POST /api/generate/image` o `/api/generate/video` pasa por `checkCredits`.
3. El middleware descuenta con la función SQL `debit_credits` (atómica, `balance >= cost`).
4. Se encola un job y se hace push del kernel con el prompt embebido.
5. El frontend consulta `GET /api/jobs/:id`; el backend avanza el estado consultando Kaggle.
6. Al terminar, descarga el output, lo sube a `keyframes` o `videos` y devuelve la URL pública.
7. Si el job falla, los créditos se devuelven con `refund_credits` y el job queda en `error`.

## 3. Módulos implementados

### 3.1 Supabase

| Elemento | Estado |
| --- | --- |
| `profiles` ligada a `auth.users` | `supabase/migrations/0001_saas_mvp.sql` |
| `user_credits` con trigger de 10 créditos de bienvenida | ídem |
| `transactions` (referencia única, monto en centavos, créditos) | ídem |
| `ai_jobs` (estado de orquestación, recuperable) | ídem |
| Buckets `keyframes` y `videos` | ídem |
| Cliente en cliente y servidor | `src/lib/supabase.ts`, `server/lib/supabase.ts` |
| Auth email/password + Google | `src/context/SessionContext.tsx` |

### 3.2 Créditos

Coste: **1 crédito por imagen, 5 por clip de video**.

Middleware `server/middleware/checkCredits.ts`:

- 401 si falta el token y Supabase está configurado.
- 402 `Payment Required` con `{ required, balance }` si no alcanza.
- Sin Supabase configurado y con `ALLOW_ANONYMOUS_GENERATION` (por defecto en desarrollo) deja pasar y no cobra, para no bloquear el estudio local.

### 3.3 Kaggle

`server/lib/kaggle.ts`:

- Renderiza la plantilla de `kaggle/flux_image` o `kaggle/wan_i2v` con el payload del job.
- `kaggle kernels push -p <dir>` (una versión nueva por trabajo).
- `kaggle kernels status <user>/<slug>` para el sondeo.
- `kaggle kernels output <user>/<slug> -p <dir>` para descargar `output_image.png` / `output_video.mp4`.
- Sube el artefacto a Supabase Storage (o a `data/generated` en local).

**Corrección técnica al documento original:** `Wan2.1-I2V-1.3B-Diffusers` no existe. Wan 2.1 publica T2V 1.3B (`Wan-AI/Wan2.1-T2V-1.3B-Diffusers`) e I2V a partir de 14B (`Wan-AI/Wan2.1-I2V-14B-480P-Diffusers`). El notebook usa el I2V 14B 480p con `enable_model_cpu_offload()` y `bfloat16`, y permite cambiar el modelo con `WAN_MODEL_ID`. En T4 el clip tarda bastante más que los ~2 minutos de Flux: la cola y el sondeo son obligatorios, no un extra.

### 3.4 Wompi

- `POST /api/wompi/checkout` con el paquete elegido → URL de checkout con `signature:integrity = SHA256(reference + amountInCents + currency + integritySecret)`.
- `POST /api/v1/webhooks/wompi` valida `signature.checksum = SHA256(valores de signature.properties + timestamp + eventsSecret)` y, ante `transaction.updated` con `APPROVED`, acredita con `credit_purchase` (idempotente por referencia).
- La referencia `CC-<uuid-de-usuario>-<nonce>` permite identificar al usuario sin estado adicional.

## 4. Economía de créditos

Un anuncio de 30 s se compone de ~4 planos: 4 keyframes (4) + 4 clips (20) = **24 créditos**.

| Paquete | COP | Créditos | Equivale a |
| --- | --- | --- | --- |
| Single Shot | 10.000 | 25 | 1 video de 30 s |
| Pack 5 videos | 40.000 | 140 | 5 videos (2.000 COP/video de ahorro) |
| Pack 10 videos | 75.000 | 280 | ~11 videos |
| Micro-Business (mes) | 60.000 | 200 | ~8 videos |
| Pro / Creador (mes) | 120.000 | 500 | ~20 videos |

COGS estimado: ~1,00 USD por video de 30 s. Márgenes del documento original (44-60 %) se mantienen.

## 5. Variables de entorno

Ver [`.env.example`](../.env.example). Bloqueantes por módulo:

- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Kaggle: `KAGGLE_USERNAME`, `KAGGLE_KEY`, `KAGGLE_FLUX_KERNEL`, `KAGGLE_VIDEO_KERNEL`.
- Wompi: `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_BASE_URL`.
- IA de texto: `GEMINI_API_KEY` (el chat director sigue siendo Gemini; no consume créditos).

Cada módulo se degrada de forma explícita: si falta su configuración, su endpoint responde 503 con el nombre de la variable faltante, nunca un resultado falso.

## 6. Despliegue

- **Vercel:** el monolito Express se sirve como función; los archivos estáticos los genera Vite.
- **Supabase:** aplicar la migración desde el SQL Editor o `supabase db push`.
- **Kaggle:** subir `kaggle/flux_image` y `kaggle/wan_i2v` una vez con `kaggle kernels push -p <dir>` para crear los kernels; después el backend los versiona. Añadir `HF_TOKEN` como secreto de Kaggle si el modelo lo requiere.
- **Wompi:** registrar la URL del webhook en el panel (eventos `transaction.updated`) y usar el par de llaves de sandbox hasta la validación.

## 7. Límites conocidos

1. **Un kernel por tarea, una versión por job.** `kaggle kernels output` descarga la última versión: dos generaciones simultáneas del mismo tipo pueden descargar el artefacto de la otra. El backend serializa los pushes en memoria; para varias instancias hace falta una cola real (QStash, pg-boss) o separar kernels por usuario.
2. **Jobs en `ai_jobs` + memoria.** El estado sobrevive a reinicios, pero el push inicial vive en la instancia que lo creó. En serverless conviene mover el disparo a un worker siempre encendido.
3. **Los renders son clips.** El montaje final y la música siguen siendo externos.
4. **No se descarga video de terceros.** El clon viral trabaja con metadatos públicos y la referencia que aporta el usuario.
5. **Los precios y créditos son configurables** en `server/lib/wompi.ts`; los montos deben validarse contra la pasarela antes de producción.
