# CloneCinema

Estudio de video viral con IA. Un chat de director que convierte un enlace viral, una idea de
producto o una saga en un **plan de producción completo**: ADN viral, storyboard, reparto, audio y
render.

Nace de unificar los dos proyectos que ya tenías:

| Origen | Qué aporta a CloneCinema |
| --- | --- |
| `cinead-studio-ai` | Producto como personaje, escenarios, storyboard de anuncio, prompts de render, TTS, Veo y kit de publicación. |
| `kitsune_v2/storyboard-studio` | Personajes, localizaciones, props, desglose de guion por planos, prompts EN para imagen/video y continuidad de saga. |
| Referencia `capafy.ai / CloneCut` | El producto: chat primero, clon de la **estructura** de un video que funciona y reemplazo selectivo de elementos. |

## Cómo funciona

1. **Chat director** (`Clon viral` / `Anuncio` / `Saga`). Conversa y, cuando corresponde, devuelve un
   plan estructurado que se aplica al proyecto sin perder los renders ya hechos.
2. **Enlace viral → estructura.** Se leen los metadatos públicos del video (oEmbed de YouTube y
   TikTok) y, si adjuntas una portada o fotograma, se analiza también esa imagen. Con eso se
   reconstruye el gancho, el patrón, los beats con marcas de tiempo y los trucos de retención.
3. **Conservar vs. reemplazar.** Cada elemento del clip fuente (personaje, producto, fondo, logo,
   texto) queda marcado como `conservar` o `reemplazar`. Ese es el corazón del clon.
4. **Estudio.** Guion por planos, storyboard con keyframes generados, reparto editable, narración
   con voz, música y SFX, render por plano y kit de publicación por plataforma.

## Puesta en marcha

```bash
npm install
cp .env.example .env   # añade GEMINI_API_KEY y, si quieres cuentas, Supabase/Kaggle/Wompi
npm run dev            # http://localhost:3000
```

Comprobación de tipos: `npm run lint`.

## Capa SaaS (cuentas, créditos, Kaggle y Wompi)

El producto completo está descrito en [docs/PRD.md](docs/PRD.md) y el esquema de base de datos en
[supabase/migrations/0001_saas_mvp.sql](supabase/migrations/0001_saas_mvp.sql).

### 1. Supabase

1. Crea el proyecto y aplica la migración (SQL Editor o `supabase db push`).
2. Habilita los proveedores **Email** y **Google** en Auth; añade `http://localhost:3000` a las
   redirect URLs.
3. Copia `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al `.env`.

La migración crea `profiles`, `user_credits`, `transactions` y `ai_jobs`, el trigger que regala
**10 créditos** al registrarse, las funciones atómicas `debit_credits` / `refund_credits` /
`credit_purchase`, RLS y los buckets `keyframes` y `videos`.

### 2. Créditos

`server/middleware/checkCredits.ts` intercepta la generación:

- **1 crédito** por keyframe, **5** por clip (`CREDIT_COST_IMAGE` / `CREDIT_COST_VIDEO`).
- Sin saldo → `402 Payment Required` con el saldo actual; la UI abre el paywall.
- Si la tarea falla en Kaggle, los créditos se devuelven solos.
- Sin Supabase y con `ALLOW_ANONYMOUS_GENERATION=true` no se cobra: el estudio local sigue abierto.

### 3. Kaggle

Los kernels viven en [kaggle/flux_image](kaggle/flux_image) (FLUX.1-schnell) y
[kaggle/wan_i2v](kaggle/wan_i2v) (Wan 2.1 I2V). Instala la CLI (`pip install kaggle`), pon
`KAGGLE_USERNAME`, `KAGGLE_KEY` y los nombres de kernel en el `.env`; después el backend los
versiona solo (`kaggle kernels push`), sondea el estado, descarga el artefacto y lo publica en
Storage.

> **Corrección al diseño original:** `Wan2.1-I2V-1.3B-Diffusers` no existe. Wan 2.1 publica I2V
> desde 14B; el kernel usa `Wan-AI/Wan2.1-I2V-14B-480P-Diffusers` con `cpu offload` y cae a T2V 1.3B
> cuando no hay imagen. En T4 un clip tarda bastante más que una imagen.

```bash
# id de cada kernel en Kaggle (se crean solos en el primer push)
KAGGLE_FLUX_KERNEL="tu_usuario/clonecinema-flux"
KAGGLE_VIDEO_KERNEL="tu_usuario/clonecinema-wan-i2v"
```

### 4. Wompi

Configura `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y registra el webhook
`https://tu-dominio/api/v1/webhooks/wompi` (evento `transaction.updated`) en el panel de Wompi.

- El checkout firma `SHA256(reference + amountInCents + COP + integritySecret)`.
- El webhook valida `SHA256(valores de signature.properties + timestamp + eventsSecret)` y acredita
  de forma idempotente por referencia (`CC-<userId>-<paquete>-<nonce>`).
- La vuelta del checkout (`?id=…`) también confirma contra la API de Wompi, por si el webhook tarda.

Paquetes (editables en `server/lib/wompi.ts`): Single 10.000 COP/25 créditos, Pack 5 40.000/140,
Pack 10 75.000/280, Micro 60.000/200 al mes, Pro 120.000/500 al mes. Un video de 30 s ≈ 24 créditos.

### Sin clave de API

La app funciona en **modo local**: el motor de plantillas arma planes completos (4-6 planos,
beats, reparto, audio y copy) para recorrer todo el estudio. Lo que no puede hacer sin clave es
generar imágenes, voz o video reales. La interfaz lo indica en la barra lateral y en cada respuesta.

## Endpoints

| Ruta | Para qué |
| --- | --- |
| `GET /api/health` | Estado y si hay clave configurada. |
| `POST /api/ai/chat` | Respuesta del director + plan opcional (JSON estructurado). |
| `POST /api/viral/analyze` | Metadatos del enlace + ADN viral + plan de clon. |
| `POST /api/ai/image` | Keyframe de un plano (Gemini image). |
| `POST /api/ai/speech` | Narración TTS, devuelta como WAV reproducible. |
| `POST /api/ai/video` | Inicia un render (Veo). |
| `POST /api/ai/video-status` | Consulta el render. |
| `GET /api/ai/video-file?op=…` | Descarga el clip terminado. |
| `GET /api/config` | Configuración pública (Supabase, costes, módulos activos). |
| `GET /api/account/me` | Usuario, plan y saldo de créditos. |
| `POST /api/generate/image` | Keyframe con créditos (Kaggle Flux o Gemini). |
| `POST /api/generate/video` | Clip con créditos (Kaggle Wan o Veo). |
| `GET /api/jobs/:id` | Estado del trabajo (Jobs de Kaggle y operaciones de Veo). |
| `GET /api/wompi/packages` | Paquetes y precios en COP. |
| `POST /api/wompi/checkout` | URL de pago firmada. |
| `GET /api/wompi/status?reference=` | Confirma la compra a la vuelta del checkout. |
| `POST /api/v1/webhooks/wompi` | Acredita créditos con checksum validado. |

## Límites reales (importante)

- **No se descarga ni se procesa el video de YouTube/TikTok.** Se leen metadatos públicos y la
  imagen de referencia que adjuntes; el ritmo se reconstruye a partir de eso y de tu descripción.
  Bajar y reutilizar el video de otra persona es un problema de derechos, no una función pendiente.
- **Cada render es un clip corto**, no el video final. El montaje, la música y la mezcla se hacen
  fuera; la app te deja el plan y los prompts listos.
- **Personas reales requieren autorización.** El agente lo recuerda y la app no incluye rostros
  reales por defecto.
- Los planes se guardan en `localStorage`. Los keyframes en base64 pueden llenarlo: exporta el JSON
  desde *Publicar* si aparece el aviso.
- **Un job por kernel, una versión por trabajo.** Dos generaciones simultáneas del mismo tipo pueden
  descargar el artefacto de la otra; el backend lo detecta por `job_id` y devuelve los créditos. Para
  varias instancias hace falta una cola real. Ver *Límites conocidos* en el PRD.
- **En Vercel** el disparo del kernel vive en la instancia que atendió la petición: si necesitas
  trabajos largos con varias réplicas, mueve ese disparo a un worker siempre encendido.
- Los clips de Wan 2.1 en T4 son lentos (minutos por clip de 5 s). La cola no es opcional.

## Siguientes pasos naturales

- Cola persistente (pg-boss / QStash) para los renders de Kaggle.
- Unión automática de clips (FFmpeg) y mezcla de narración + música.
- Analizar un clip subido propio: extracción de frames y beats reales.
- Facturación de suscripciones recurrentes (Wompi no cobra recurrencia automática: hoy el plan
  mensual es una compra de créditos).
