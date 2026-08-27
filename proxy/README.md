# Claude Usage Proxy · Cloudflare Worker

Proxy mínimo que resuelve el bloqueo **403 "Request not allowed"** que devuelve
el endpoint OAuth de uso de Anthropic cuando lo llama una app de terceros
(Scriptable) directamente desde el móvil.

La petición a Anthropic sale de un **servidor de Cloudflare**, no del teléfono,
así que no la bloquea el borde de la API. Además:

- Las **credenciales de Anthropic viven en Cloudflare** (KV + secretos), nunca
  en el móvil. El widget solo guarda la URL del Worker y un token propio.
- El Worker **renueva el access token automáticamente** con el refresh token y
  persiste el refresh **rotado** en KV.

## Qué expone el Worker

| Ruta          | Método | Para qué |
|---------------|--------|----------|
| `/usage`      | GET    | Devuelve el JSON de uso de Anthropic (lo que consume el widget). |
| `/seed`       | POST   | Carga/actualiza las credenciales OAuth en KV. |
| `/health`     | GET    | Comprobación rápida. |

Todas exigen la cabecera `Authorization: Bearer <PROXY_TOKEN>`.

## Requisitos

- Una cuenta de Cloudflare (el plan gratuito sobra).
- Node.js instalado en tu ordenador (para usar `npx wrangler`).
- Tus credenciales OAuth de Claude Code:
  - **macOS:** app *Acceso a Llaveros* → entrada **"Claude Code-credentials"**.
  - **Linux/Windows:** `~/.claude/.credentials.json`.

## Despliegue paso a paso

Desde la carpeta `proxy/`:

### 1. Inicia sesión en Cloudflare

```bash
npx wrangler login
```

### 2. Crea el namespace KV y pega su id en `wrangler.toml`

```bash
npx wrangler kv namespace create OAUTH
```

Copia el `id` que imprime y sustitúyelo en `wrangler.toml`
(`REEMPLAZA_CON_TU_KV_ID`).

### 3. Define el token del proxy (secreto)

Elige una cadena larga y aleatoria (es la "contraseña" entre el widget y el
Worker). Por ejemplo genera una con:

```bash
openssl rand -hex 32
```

Guárdala como secreto:

```bash
npx wrangler secret put PROXY_TOKEN
# pega la cadena cuando lo pida
```

Apúntala: la necesitarás en el widget.

### 4. Publica el Worker

```bash
npx wrangler deploy
```

Anota la URL que devuelve, del tipo
`https://claude-usage-proxy.TUCUENTA.workers.dev`.

### 5. Carga tus credenciales de Anthropic (una sola vez)

Envía el JSON de credenciales de Claude Code al endpoint `/seed`. Sustituye
`URL` y `PROXY_TOKEN` por los tuyos:

```bash
# macOS: extrae el JSON del llavero
CREDS=$(security find-generic-password -s "Claude Code-credentials" -w)

# Linux/Windows: usa el archivo
# CREDS=$(cat ~/.claude/.credentials.json)

curl -X POST "https://claude-usage-proxy.TUCUENTA.workers.dev/seed" \
  -H "Authorization: Bearer TU_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREDS"
```

Debe responder `{"ok":true,"stored":{"access":true,"refresh":true}}`.

> Incluye el `refreshToken` para que el Worker renueve solo el acceso. Si solo
> mandas el access token, caducará en ~8 h y tendrás que repetir el `/seed`.

### 6. Comprueba que funciona

```bash
curl "https://claude-usage-proxy.TUCUENTA.workers.dev/usage" \
  -H "Authorization: Bearer TU_PROXY_TOKEN"
```

Debe devolver el JSON con `five_hour` y `seven_day`.

### 7. Conéctalo al widget

En el iPhone, abre el script en Scriptable → **▶** →
**"Configurar proxy (Cloudflare)"** → pega la **URL del Worker** y el
**PROXY_TOKEN** → **Guardar** → **"Ver vista previa del widget"**.

## Seguridad

- `PROXY_TOKEN` se guarda como **secreto** del Worker (nunca en `wrangler.toml`
  ni en el repositorio).
- Las credenciales de Anthropic se guardan en **KV** (cifrado en reposo de
  Cloudflare) y solo salen del Worker hacia `api.anthropic.com`.
- El Worker exige el `PROXY_TOKEN` en todas las rutas; sin él responde 401.
- El widget guarda la URL y el `PROXY_TOKEN` cifrados en el **Keychain** del
  dispositivo, con entrada oculta (`addSecureTextField`).

## Actualizar credenciales más adelante

Si algún día el refresh token deja de valer (revocado, expirado), vuelve a
ejecutar el paso 5 (`/seed`) con un JSON de credenciales nuevo.

## Coste

El plan gratuito de Cloudflare Workers cubre 100.000 peticiones/día; un widget
que refresca cada pocos minutos usa una fracción ínfima.
