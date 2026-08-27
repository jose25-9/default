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
  - **Windows:** `C:\Users\TU_USUARIO\.claude\.credentials.json`
    (equivale a `%USERPROFILE%\.claude\.credentials.json`).
  - **macOS:** app *Acceso a Llaveros* → entrada **"Claude Code-credentials"**
    (o el archivo `~/.claude/.credentials.json` según la instalación).
  - **Linux:** `~/.claude/.credentials.json`.

> Las instrucciones de abajo están en dos variantes: **Windows (PowerShell)** y
> **macOS / Linux (bash/zsh)**. Usa la de tu sistema. Los comandos `npx wrangler`
> son idénticos en ambos.

---

## Despliegue paso a paso

Abre una terminal **dentro de la carpeta `proxy/`** de este repo. Si aún no lo
tienes clonado:

**Windows (PowerShell):**
```powershell
git clone https://github.com/jose25-9/default.git
Set-Location default
git checkout claude/scriptable-claude-limits-widget-2tqgb9
Set-Location proxy
```

**macOS / Linux:**
```bash
git clone https://github.com/jose25-9/default.git
cd default
git checkout claude/scriptable-claude-limits-widget-2tqgb9
cd proxy
```

### 1. Inicia sesión en Cloudflare

```bash
npx wrangler login
```
Se abre el navegador para autorizar. (Si pregunta si instalar `wrangler`, acepta.)

### 2. Crea el namespace KV y pega su id en `wrangler.toml`

```bash
npx wrangler kv namespace create OAUTH
```

Imprime algo como:
```
[[kv_namespaces]]
binding = "OAUTH"
id = "a1b2c3d4e5f6..."
```

Copia ese `id` y sustitúyelo en el archivo **local** `wrangler.toml`
(reemplaza `REEMPLAZA_CON_TU_KV_ID`). `wrangler deploy` lee el archivo de tu PC,
no el de GitHub, así que edítalo localmente:

- **Windows:** `notepad wrangler.toml`
- **macOS:** `open -e wrangler.toml`  ·  **Linux:** `nano wrangler.toml`

### 3. Define el token del proxy (secreto)

Elige una cadena larga y aleatoria: es la "contraseña" entre el widget y el
Worker. Genérala así:

**Windows (PowerShell):**
```powershell
(([guid]::NewGuid()).ToString() + ([guid]::NewGuid()).ToString()) -replace '-',''
```

**macOS / Linux:**
```bash
openssl rand -hex 32
```

Copia esa cadena (guárdala: la usarás en el widget) y guárdala como secreto:

```bash
npx wrangler secret put PROXY_TOKEN
# pega la cadena cuando lo pida
```

### 4. Publica el Worker

```bash
npx wrangler deploy
```

Anota la URL que devuelve, del tipo
`https://claude-usage-proxy.TUCUENTA.workers.dev`.

### 5. Carga tus credenciales de Anthropic (una sola vez)

Envía el JSON de credenciales de Claude Code al endpoint `/seed`. Sustituye la
URL y `TU_PROXY_TOKEN` por los tuyos. Deja la palabra **`Bearer`** tal cual; solo
cambia el token que va detrás.

**Windows (PowerShell)** — usa `curl.exe` (el `curl` de PowerShell es distinto) y
manda el archivo directamente:
```powershell
curl.exe -X POST "https://claude-usage-proxy.TUCUENTA.workers.dev/seed" `
  -H "Authorization: Bearer TU_PROXY_TOKEN" `
  -H "Content-Type: application/json" `
  --data-binary "@$env:USERPROFILE\.claude\.credentials.json"
```

**macOS** (credenciales en el llavero):
```bash
CREDS=$(security find-generic-password -s "Claude Code-credentials" -w)
curl -X POST "https://claude-usage-proxy.TUCUENTA.workers.dev/seed" \
  -H "Authorization: Bearer TU_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREDS"
```

**macOS / Linux** (credenciales en archivo):
```bash
curl -X POST "https://claude-usage-proxy.TUCUENTA.workers.dev/seed" \
  -H "Authorization: Bearer TU_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$HOME/.claude/.credentials.json"
```

Debe responder `{"ok":true,"stored":{"access":true,"refresh":true}}`.

> **Fíjate en que diga `"refresh":true`.** Eso confirma que el Worker guardó el
> refresh token y renovará el acceso solo. Si dice `"refresh":false`, tu archivo
> no traía refresh token: abre Claude Code una vez (para que reescriba el
> archivo con credenciales frescas), ciérralo y repite este paso.

**¿El paso 5 da "archivo no encontrado"?** Confirma la ruta:

- **Windows (PowerShell):** `Test-Path "$env:USERPROFILE\.claude\.credentials.json"`
- **macOS / Linux:** `ls -l ~/.claude/.credentials.json`

Para ver qué campos contiene (solo nombres, sin exponer valores):

- **Windows (PowerShell):**
  ```powershell
  (Get-Content "$env:USERPROFILE\.claude\.credentials.json" -Raw | ConvertFrom-Json).claudeAiOauth | Get-Member -MemberType NoteProperty | Select-Object Name
  ```
- **macOS / Linux:**
  ```bash
  cat ~/.claude/.credentials.json | python3 -c "import sys,json;print(list(json.load(sys.stdin)['claudeAiOauth'].keys()))"
  ```
  Debe aparecer `refreshToken` en la lista.

### 6. Comprueba que funciona

**Windows (PowerShell):**
```powershell
curl.exe "https://claude-usage-proxy.TUCUENTA.workers.dev/usage" `
  -H "Authorization: Bearer TU_PROXY_TOKEN"
```

**macOS / Linux:**
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

Si algún día el refresh token deja de valer (revocado, expirado por inactividad
larga, o cierras sesión en Claude Code), el widget mostrará "· datos de muestra".
Vuelve a ejecutar el **paso 5** (`/seed`) con un JSON de credenciales nuevo y se
arregla.

## Coste

El plan gratuito de Cloudflare Workers cubre 100.000 peticiones/día; un widget
que refresca cada pocos minutos usa una fracción ínfima.
