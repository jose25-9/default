# Claude Usage · Widget para Scriptable (iOS)

Widget **mediano** que imita el panel de escritorio de límites de uso de Claude:
barras de progreso para la **sesión actual** y el **límite semanal**, porcentajes,
tiempo transcurrido (anillo), tiempo hasta el reinicio y hora de reinicio.

## Endpoint real y autenticación

El panel de límites de Claude Code se alimenta del endpoint OAuth:

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer sk-ant-oat01-…
anthropic-beta: oauth-2025-04-20
```

Respuesta (esquema real):

```json
{
  "five_hour":  { "utilization": 33.0, "resets_at": "2026-04-11T07:00:00Z" },
  "seven_day":  { "utilization": 13.0, "resets_at": "2026-04-17T00:59:59Z" },
  "seven_day_opus":   null,
  "seven_day_sonnet": { "utilization": 1.0, "resets_at": "…" },
  "extra_usage":      { "is_enabled": false, "monthly_limit": null, "used_credits": null, "utilization": null }
}
```

- `five_hour` → fila **CURRENT SESSION** (ventana de 5 h).
- `seven_day` → fila **WEEKLY LIMIT** (límite de 7 días).
- `utilization` es el porcentaje 0–100; `resets_at` es ISO 8601 (UTC).

> **Importante:** este endpoint usa un **token OAuth** (Pro/Max), **no** la cookie
> `sessionKey` de claude.ai. El token de acceso **caduca en ~8 h**, por eso el
> script guarda también el *refresh token* y renueva el acceso automáticamente.
> El endpoint está **muy rate-limited**: no lo consultes en exceso.

## Dos modos de funcionamiento

El widget puede obtener los datos de dos formas:

1. **Modo proxy (recomendado).** El widget llama a un **Cloudflare Worker** tuyo
   que a su vez consulta a Anthropic. Es la opción robusta porque el endpoint de
   Anthropic **bloquea con 403 "Request not allowed"** las peticiones directas
   desde apps de terceros en el móvil. Además tus credenciales de Anthropic
   viven en Cloudflare, no en el teléfono. Guía completa en
   [`proxy/README.md`](./proxy/README.md).
2. **Modo directo.** El widget llama a `api.anthropic.com` directamente con tu
   token OAuth. Es más simple, pero puede devolver **403** según el dispositivo
   y la protección del borde de la API. Si te funciona, perfecto; si no, usa el
   proxy.

En la app, el menú del script ofrece **"Configurar proxy (Cloudflare)"** y
**"Guardar token OAuth directo"** para elegir el modo.

## Cómo obtener las credenciales OAuth

Las credenciales las genera Claude Code al hacer login. Ubicación típica:

- **macOS:** llavero → entrada **“Claude Code-credentials”** (JSON).
- **Linux/Windows:** `~/.claude/.credentials.json`.

El JSON tiene esta forma (los tokens están recortados aquí):

```json
{ "claudeAiOauth": { "accessToken": "sk-ant-oat01-…", "refreshToken": "sk-ant-ort01-…", "expiresAt": 1730000000000, "scopes": ["user:inference","user:profile"] } }
```

Copia **todo ese JSON** (o al menos `accessToken` + `refreshToken`) para pegarlo en el widget.

## Instalación

1. Instala la app [Scriptable](https://scriptable.app/) desde la App Store.
2. Crea un script nuevo y pega el contenido de [`claude-usage-widget.js`](./claude-usage-widget.js).
3. **Ejecuta el script una vez dentro de la app** (botón ▶) → **“Guardar
   credenciales OAuth”** y pega:
   - el **JSON de credenciales** (recomendado: permite auto-renovación), o
   - solo el **token de acceso** `sk-ant-oat01-…` (más simple, pero caduca en ~8 h
     y tendrás que volver a pegarlo).
   Todo se almacena **cifrado en el llavero del dispositivo** (`Keychain`).
4. Añade un widget **mediano** a la pantalla de inicio, elige el script Scriptable
   y selecciona este script.

## Seguridad

Cumple estos requisitos por diseño:

- **Sin secretos hardcodeados.** Los tokens (acceso y refresh) nunca aparecen en
  el código; se guardan y recuperan con la clase nativa `Keychain` (cifrado del
  dispositivo). El `client_id` de OAuth **sí** va en claro porque es un
  identificador **público** de cliente, no un secreto.
- **Validación inicial.** Antes de cualquier petición de red se comprueba si
  existe el token. Si falta, el widget muestra **“Configuración requerida”** y,
  en la app, ofrece un diálogo para guardarlo — nunca crashea ni expone datos.
- **Entrada oculta.** Las credenciales se introducen con `addSecureTextField`,
  de modo que no se ven en pantalla mientras se escriben.
- **Sin fugas en consola.** Ningún `console.log` imprime el token ni la cabecera
  `Authorization`. Solo se registran mensajes de estado y errores truncados sin
  datos sensibles.

## Renovación, actualización y borrado

- **Auto-renovación:** si guardaste el refresh token, el widget renueva el token
  de acceso solo (POST a `https://console.anthropic.com/v1/oauth/token`) cuando
  está a punto de caducar, y guarda el nuevo token cifrado.
- **Manual:** ejecuta el script dentro de la app → **“Actualizar credenciales
  OAuth”** para reemplazarlas, o **“Borrar credenciales del llavero”** para
  eliminarlas por completo.

## Nota sobre los datos

Si la petición falla, el token caducó (401) o el formato no coincide, el widget
renderiza **datos de muestra** y lo indica en el pie (`· datos de muestra`), en
lugar de fallar. Los `resets_at` del endpoint son de **ventana deslizante**: el
`seven_day.resets_at` indica cuándo caduca el tramo más antiguo del periodo, no
necesariamente cuándo recibes una asignación nueva.
