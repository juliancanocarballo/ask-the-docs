# CLAUDE.md

Este archivo provee contexto a Claude Code (claude.ai/code) para trabajar en este proyecto.

---

## 1. Contexto del proyecto

Este es un **demo público** que funciona como herramienta de ventas para un servicio freelance de integración de chatbots IA con RAG en sitios web. NO es un producto SaaS. El objetivo es que clientes potenciales en Upwork/Fiverr vean el demo funcionando y contraten el servicio de implementación personalizada.

**Servicio que se vende a partir del demo:**
> "Chatbot IA con conocimiento de tu negocio para tu web: responde preguntas usando tu contenido (docs, FAQs, productos), widget embebible, panel para ver conversaciones. Entrega en 7 días. $350 USD."

**Cliente ideal:** founders de SaaS y devs técnicos que necesitan un chatbot sobre su documentación/producto.

**Demo elegido:** Chatbot entrenado sobre la **documentación oficial de Supabase** (https://supabase.com/docs). Razones: audiencia compradora perfecta (founders/devs construyendo SaaS), posiciona al autor como dev full-stack senior, SEO orgánico alto ("Supabase chatbot", "AI assistant Supabase docs"), complejidad de la doc permite demos técnicos impresionantes.

**URL raíz a ingestar:** `https://supabase.com/docs`
**Secciones prioritarias (en orden de importancia para el demo):**
1. Database (queries, RLS, policies, indexes)
2. Auth (providers, JWT, sessions)
3. Storage (buckets, policies, transformations)
4. Edge Functions (deploy, secrets, runtime)
5. Realtime (channels, presence, broadcast)
6. Getting started / Quickstarts
7. CLI reference

**Secciones a excluir de ingesta (ruido):**
- Blog posts
- Changelog
- Customer stories
- Partners

---

## 2. Objetivos del demo

El demo debe lograr que un visitante en menos de 90 segundos piense: *"quiero exactamente esto pero para mi negocio"*.

Para eso debe demostrar, en este orden de prioridad:

1. **Precisión con citas:** responde preguntas técnicas y cita la fuente (página/doc de origen).
2. **Manejo elegante de "no sé":** cuando la pregunta está fuera del contexto, responde honestamente sin alucinar y ofrece capturar email.
3. **Acción custom de conversión:** botón "Agendar demo" o captura de email cuando detecta intención comercial.
4. **Streaming de respuestas:** palabras aparecen en tiempo real (no respuesta bloque).
5. **Historial persistente:** la conversación sobrevive recargas (localStorage).

---

## 3. Stack técnico

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **Componentes UI:** shadcn/ui (solo lo mínimo necesario)
- **LLM:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) para respuestas del chat
- **Embeddings:** OpenAI `text-embedding-3-small` (bajo costo)
- **Vector DB:** pgvector en Supabase (free tier)
- **Ingesta de contenido:** Firecrawl o Jina Reader para scrapear docs
- **Hosting:** Vercel (free tier)
- **Analytics:** Plausible o Google Analytics
- **Rate limiting:** Upstash Redis (free tier) o implementación simple en memoria

**No usar:** servidor Express separado (usar API routes de Next.js), bases de datos adicionales, autenticación de usuarios, pagos.

---

## 4. Arquitectura

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Landing con hero + chatbot embebido + CTA
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── chat/route.ts        # Endpoint de chat con streaming
│   │       ├── capture-email/route.ts # Endpoint para capturar email (acción custom)
│   │       └── ingest/route.ts      # Script de ingesta (protegido, uso interno)
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWidget.tsx       # Widget principal del chatbot
│   │   │   ├── Message.tsx          # Render de mensaje individual con citas
│   │   │   ├── SuggestedQuestions.tsx # Chips con preguntas sugeridas
│   │   │   └── EmailCapture.tsx     # Componente que aparece en acción custom
│   │   └── ui/                      # Componentes de shadcn/ui
│   └── lib/
│       ├── anthropic.ts             # Cliente de Claude
│       ├── embeddings.ts            # Generación de embeddings con OpenAI
│       ├── supabase.ts              # Cliente de Supabase
│       ├── rag.ts                   # Lógica de retrieval (similarity search)
│       ├── rate-limit.ts            # Rate limiting por IP
│       └── prompts.ts               # System prompts centralizados
├── scripts/
│   └── ingest.ts                # Script standalone de ingesta inicial
├── supabase/
│   └── schema.sql               # Schema SQL para ejecutar en Supabase SQL Editor
└── CLAUDE.md
```

---

## 5. Flujo de RAG

1. Usuario escribe mensaje en el widget.
2. Frontend hace POST a `/api/chat` con el mensaje + historial corto (últimos 6 mensajes).
3. Backend:
   - Verifica rate limit por IP (20 mensajes/día/IP).
   - Genera embedding del mensaje con OpenAI.
   - Query a pgvector: top 5 chunks más similares (cosine similarity).
   - Construye prompt con contexto recuperado + historial + system prompt.
   - Llama a Claude Haiku 4.5 con streaming.
   - Detecta intención comercial en el mensaje → si aplica, devuelve flag `show_email_capture: true`.
4. Frontend renderiza respuesta en streaming + fuentes citadas + componente de captura si aplica.
5. Toda la conversación se guarda en tabla `conversations` de Supabase para análisis posterior.

---

## 6. System prompt base

El prompt del sistema debe forzar comportamiento anti-alucinación:

```
Eres un asistente experto en Supabase (plataforma open-source de Backend-as-a-Service: Postgres, Auth, Storage, Realtime, Edge Functions). Respondes preguntas técnicas basándote ÚNICAMENTE en la documentación oficial de Supabase proporcionada abajo como contexto.

REGLAS ESTRICTAS:
1. Si la respuesta no está en el contexto proporcionado, responde exactamente: "No tengo esa información en la documentación que tengo indexada. ¿Quieres que el equipo te contacte directamente?" y ofrece el botón de captura de email. No intentes responder con conocimiento general.
2. Nunca inventes APIs, nombres de funciones, parámetros ni sintaxis. Si no está en el contexto, no existe para ti.
3. Responde en máximo 3 párrafos cortos. Si el usuario pide código, inclúyelo en bloque de código con lenguaje especificado.
4. Al final de cada respuesta, cita las fuentes usadas con formato: [Fuente: <título> - <url>]
5. Si detectas intención comercial ("quiero contratar", "precios del servicio", "hablar con alguien", "cuánto cuesta implementar esto", "necesito ayuda con mi proyecto"), responde brevemente y activa la acción de captura de email invitando a contactar al equipo.
6. Responde en el idioma del usuario (español o inglés principalmente).
7. Nunca menciones que eres un demo o que fuiste construido para vender servicios. Actúa como un asistente técnico profesional.

CONTEXTO RECUPERADO DE DOCUMENTACIÓN:
{chunks_recuperados}

HISTORIAL RECIENTE DE LA CONVERSACIÓN:
{historial}
```

---

## 7. Esquema de base de datos (Supabase)

```sql
-- Chunks de documentación con embeddings
create table documents (
  id bigserial primary key,
  source_url text not null,
  source_title text not null,
  content text not null,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  created_at timestamp default now()
);

create index on documents using ivfflat (embedding vector_cosine_ops);

-- Historial de conversaciones
create table conversations (
  id bigserial primary key,
  session_id text not null,  -- ID generado en cliente, persiste en localStorage
  ip_hash text not null,      -- IP hasheada para rate limit y analytics
  role text not null,         -- 'user' | 'assistant'
  content text not null,
  sources jsonb,              -- fuentes citadas en respuestas de assistant
  created_at timestamp default now()
);

create index on conversations(session_id);
create index on conversations(ip_hash, created_at);

-- Emails capturados por acción custom
create table leads (
  id bigserial primary key,
  email text not null,
  session_id text,
  context text,               -- última pregunta antes de capturar email
  created_at timestamp default now()
);
```

---

## 8. Variables de entorno

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FIRECRAWL_API_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
INGEST_SECRET=                 # Para proteger endpoint de ingesta
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

---

## 9. Features del widget (UI)

**Obligatorios:**
- Botón flotante en esquina inferior derecha que abre el widget.
- Header con nombre del bot y botón de cerrar.
- Área de mensajes con scroll automático.
- Indicador de "escribiendo..." mientras llega el streaming.
- Input con botón enviar + enter para enviar.
- 3 preguntas sugeridas visibles al inicio (se ocultan al primer mensaje).
- Citas clickeables debajo de respuestas del bot (abren fuente en nueva pestaña).
- Componente de captura de email que aparece inline cuando `show_email_capture: true`.
- Marca de agua: "Powered by [tu nombre]" (clickeable → link al servicio).

**Prohibidos (scope creep):**
- Login de usuarios.
- Múltiples conversaciones guardadas.
- Configuración de preferencias.
- Dark mode toggle (respetar sistema, sí; toggle manual, no).
- Voz, audio, imágenes.

---

## 10. Preguntas sugeridas (CRÍTICO)

Las 3 preguntas iniciales están diseñadas para demostrar las 3 capacidades clave del bot en menos de 90 segundos.

**Preguntas finales para el demo de Supabase:**

1. **Técnica específica (muestra precisión con citas):**
   `"What's the difference between anon key and service role key?"`
   - Demuestra: respuesta técnica correcta + cita a docs de Auth/API. Reemplaza la pregunta de RLS por un problema de embeddings outlier (ver sección "Known Issues").

2. **Fuera de contexto (muestra manejo de 'no sé'):**
   `"What's the best pricing strategy for my SaaS?"`
   - Demuestra: el bot NO inventa respuesta, reconoce límite, ofrece contactar al equipo. Esta es la pregunta que más impresiona a compradores porque es lo que sus clientes reales harán.

3. **Intención comercial (activa acción custom):**
   `"I need help implementing Supabase Auth in my Next.js app — can someone help?"`
   - Demuestra: bot responde con info técnica útil Y activa el componente de captura de email ofreciendo contacto con el equipo.

**Preguntas alternativas probadas (rotar para A/B testing):**
- "How do I sign in with Google?"
- "How do I migrate from Firebase to Supabase?"
- "Can I use Supabase with Drizzle ORM?"
- "How do Edge Functions handle secrets?"

---

## 11. Landing page

Bloques en orden:

1. **Hero:** título de 1 frase que explique qué es + subtítulo de 1 frase con beneficio + widget ya abierto abajo.
2. **Ejemplo en vivo:** el widget flotando abierto, invitando a preguntar.
3. **Video Loom de 2 min:** explica problema → demo → cómo lo implementas para el cliente.
4. **Qué incluye el servicio:** lista corta de entregables del paquete de $350.
5. **CTA final:** "Quiero esto para mi web" → link a Fiverr/Upwork/email.

**Tono del copy:** directo, sin fluff, enfocado en beneficio. No "revoluciona tu negocio con IA". Sí "Responde las preguntas de tus usuarios automáticamente con tu documentación".

---

## 12. Reglas operativas

### Anti-alucinación
- System prompt siempre fuerza "solo responde desde contexto".
- Si retrieval devuelve score de similitud < 0.7 en top chunk, responder directamente "no tengo info".
- Mostrar fuentes siempre, incluso si el usuario no las pide.

### Control de costos
- Rate limit: 20 mensajes/día/IP.
- Context window: enviar solo top 5 chunks + últimos 6 mensajes de historial.
- Caché de preguntas frecuentes en Redis (TTL 24h) para evitar llamadas repetidas al LLM.
- Usar Haiku 4.5, no Sonnet, en el demo.

### Logging
- Guardar TODA conversación en tabla `conversations`.
- Loguear latencia de: embedding, retrieval, LLM.
- Monitorear costo diario de APIs (manual al inicio, dashboard simple después).

### Seguridad
- Endpoint `/api/ingest` protegido con `INGEST_SECRET`.
- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente.
- Sanitizar input del usuario (aunque Claude es robusto, defensa en profundidad).
- Hashear IPs antes de guardar (privacidad + rate limit igual funciona).

---

## 12.5. Estrategia de ingesta específica para Supabase

Las docs de Supabase son grandes (~300+ páginas). Un approach naive (scrapear todo, chunkear por párrafo) genera retrieval mediocre. Reglas específicas:

### Chunking
- **Tamaño de chunk:** 800 tokens con overlap de 100 tokens.
- **Respetar estructura:** nunca cortar un bloque de código a la mitad. Si un chunk termina en medio de un ` ``` `, extender hasta cerrar el bloque.
- **Preservar headers:** cada chunk debe incluir el header H1/H2 de su sección al inicio como contexto (ej: `## Row Level Security\n\n[contenido del chunk]`).

### Metadata por chunk
Guardar junto al embedding:
- `source_url`: URL exacta de la página (para citas clickeables)
- `source_title`: título H1 de la página
- `section`: sección de la doc (Database, Auth, Storage, etc.)
- `breadcrumb`: jerarquía completa (ej: "Database > Postgres > Row Level Security")

### Herramienta de ingesta
- **Firecrawl** con opción `crawl` sobre `https://supabase.com/docs`. Excluir patrones: `/blog/`, `/customers/`, `/partners/`, `/changelog/`.
- Alternativa: usar el sitemap oficial de Supabase docs + fetch individual de cada página.
- **NO usar Jina Reader** para este volumen, se vuelve caro. Firecrawl tiene mejor pricing para crawls grandes.

### Costo estimado de ingesta inicial
- ~300 páginas × ~2000 tokens promedio = 600k tokens
- Embeddings OpenAI `text-embedding-3-small`: ~$0.015 USD total
- Firecrawl: ~$2-3 USD (dentro del free tier si hay)
- **Total one-time: < $5 USD**

### Re-ingesta
- No automatizar. Ejecutar script manualmente cada 2-3 meses o cuando Supabase anuncie cambios mayores.
- Script debe hacer upsert (detectar si URL ya existe, actualizar solo si contenido cambió por hash).

### Validación post-ingesta
Antes de pasar a día 3, validar con estas queries de prueba:
- "How do I create a table?" → debe recuperar chunks de sección Database.
- "What are Row Level Security policies?" → chunks de RLS con ejemplos SQL.
- "How do I sign in with Google?" → chunks de Auth > Social Login.
- Si alguna de estas devuelve chunks irrelevantes, revisar chunking antes de seguir.

---



**Total: 10-12 días, ~22-24 horas (2h/día).** Supabase requiere 1-2 días extra vs una doc pequeña por el volumen y el tuning de retrieval.

- **Día 1:** Setup Next.js 15 + TypeScript + Tailwind + shadcn/ui. Cuenta Supabase creada con pgvector habilitado. Variables de entorno configuradas. Schema SQL ejecutado (tablas `documents`, `conversations`, `leads`).
- **Día 2:** Script de ingesta con Firecrawl. Crawl de `supabase.com/docs` con exclusiones. Chunking con overlap y preservación de bloques de código. Embeddings + upsert en pgvector. Validación con 4 queries de prueba.
- **Día 3:** Endpoint `/api/chat` con lógica RAG (embed query → similarity search → construir prompt → stream con Claude Haiku 4.5). Pruebas con curl. Primera iteración del system prompt.
- **Día 4:** Iterar system prompt hasta que responda bien a 10 preguntas técnicas sin alucinar. Probar casos edge (preguntas ambiguas, fuera de tema, intención comercial). Ajustar threshold de similarity.
- **Día 5:** Widget UI: botón flotante, panel de chat, render de mensajes, streaming visual con cursor parpadeante. Estilo limpio con Tailwind.
- **Día 6:** Integración widget ↔ API. Historial persistente en localStorage. Indicador "escribiendo...". Scroll automático. Citas clickeables debajo de respuestas.
- **Día 7:** Componente `EmailCapture` inline. Detección de intención comercial en backend (flag `show_email_capture`). Endpoint `/api/capture-email`. Preguntas sugeridas al inicio (3 chips clickeables).
- **Día 8:** Landing page completa alrededor del widget. Copy directo sin fluff. Hero + ejemplo en vivo + qué incluye el servicio + CTA a Fiverr/Upwork/email. Responsive mobile.
- **Día 9:** Rate limiting con Upstash Redis (20 msg/día/IP). Caché de preguntas frecuentes (TTL 24h). Deploy a Vercel con dominio propio. HTTPS. Plausible/GA configurado. Probar en producción.
- **Día 10:** Grabar Loom de 2 minutos: problema (30s) → demo en vivo (60s) → cómo se implementa para el cliente (30s). Subir a landing.
- **Día 11 (buffer):** Feedback con 3-5 devs conocidos. Ajustes de copy, preguntas sugeridas, bugs menores.
- **Día 12 (buffer):** Verificar checklist de "done" (sección 14). Si todo verde, linkear demo en perfiles Fiverr/Upwork.

---

## 14. Criterios de "done" del demo

El demo está listo para vender cuando:

- [ ] Responde correctamente a 10 preguntas técnicas sobre Supabase (Database, Auth, Storage, Edge Functions, Realtime) con citas válidas y clickeables.
- [ ] Maneja elegantemente 5 preguntas fuera de contexto sin alucinar (ej: "¿cuál es el mejor framework?", "¿cómo está el clima?").
- [ ] Captura email al menos en 3 flujos distintos de intención comercial.
- [ ] Streaming funciona sin bugs visuales.
- [ ] Conversación persiste tras recarga.
- [ ] Rate limit activo y probado.
- [ ] Deploy en dominio propio HTTPS.
- [ ] Loom grabado y subido en la landing.
- [ ] Analytics registrando visitas y conversiones a CTA.
- [ ] Costo operativo mensual proyectado < $10 USD con tráfico moderado.
- [ ] Probar preguntas en español Y en inglés — ambas deben funcionar bien.

---

## 15. Lo que NO se hace en este proyecto

- No es multi-tenant. Un demo, una doc indexada.
- No hay panel admin. El "panel de conversaciones" es una query SQL directa en Supabase.
- No hay suscripciones ni pagos.
- No hay onboarding de clientes. El cliente contrata por Fiverr/Upwork y se implementa manualmente.
- No se invierte tiempo en perfeccionismo visual. Funcional y limpio > bonito.
- No se agregan features "por si acaso". Alcance cerrado, punto.

---

## 16. Notas para Claude Code

- Priorizar velocidad de entrega sobre elegancia del código. Es un demo, no un producto.
- Comentar solo lo no obvio. No escribir JSDoc en todo.
- Tests: solo si hay tiempo en día 10. No bloquear entrega por tests.
- Si algo toma más de lo estimado en el cronograma, simplificar scope, no extender fechas.
- Cuando haya decisión entre "feature extra" vs "launch el día 10", siempre launch.

---

## 17. Known Issues

### Embeddings outlier con queries cortas y técnicas

OpenAI `text-embedding-3-small` ocasionalmente genera embeddings outlier para queries cortas y técnicas (ej: `"How do I set up Row Level Security?"`) que no matchean con ningún chunk almacenado, incluso con threshold muy bajo (0.05). El caso se observó en Día 3 durante las pruebas de `test-chat.ts`: la misma pregunta reformulada con más contexto devuelve matches normales.

**Workaround actual:** reformular la query con más contexto técnico, por ejemplo:
> `"How do I configure Row Level Security policies in Postgres for my Supabase database?"`

mejora el matching significativamente.

**A investigar en el futuro:**
- Probar `text-embedding-3-large` (3072 dims) — mayor capacidad semántica.
- Normalizar embeddings a norma unitaria antes de almacenar (pgvector cosine ya asume esto, pero verificar).
- Query expansion server-side: antes de embedir, añadir contexto del dominio ("Supabase") a la query del usuario.
- Hybrid retrieval: combinar vector search con BM25 full-text sobre `content` para rescatar matches léxicos que el embedding pierde.

### Day 4 accepted misses
- Q9 "Should I use Supabase or Firebase for my project?" returns NO-INFO. Docs lack head-to-head comparison; gate working as intended. Not a bug.
- Q3 RLS ES sometimes cites only 1 source when answer synthesizes multiple. Subcitation behavior of Claude Haiku, low-impact. Accepted.
- Pure contact requests without technical content (e.g., "necesito ayuda con mi proyecto, ¿alguien puede contactarme?") return NO-INFO without marker. By design — gate must pass for marker to emit. Lead capture for these cases handled by persistent "Contact team" button in widget (day 7).

### Day 4 lesson
Prompt iteration round 2 added a "NO-INFO + marker" path to capture ambiguous commercial leads. This caused Claude to default to NO-INFO under any uncertainty. Round 3 tried to fix with more rules — failed. Round 4 reverted the path entirely. Lesson: when the model prefers a shortcut, remove the shortcut; do not instruct against it.

### Day 6 accepted misses
- Multi-turn language drift: an EN message following several ES turns can inherit the previous language. This is LLM behavior on conversational history, not a widget issue. Accepted.
- Code blocks render with horizontal scroll (overflow-x-auto). Legacy from day 5, conscious decision — preserves formatting on narrow mobile widths.
- Markdown headers (`##`, `###`) render as plain text: no styling in the `react-markdown` custom components map. Low-impact; answers rarely use headers. Improvable on day 8 if time allows.
