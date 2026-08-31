// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: chart-bar;

/**
 * ============================================================================
 *  CLAUDE USAGE — Widget mediano para Scriptable (iOS)
 * ============================================================================
 *  Monitorea los límites de uso de Claude imitando el panel de escritorio:
 *  barras de progreso para la sesión actual y el límite semanal, porcentajes,
 *  tiempo transcurrido (anillo) y horas de reinicio.
 *
 *  ── AUTENTICACIÓN (endpoint real) ─────────────────────────────────────────
 *  El panel de límites de Claude Code se alimenta del endpoint OAuth:
 *     GET https://api.anthropic.com/api/oauth/usage
 *  autenticado con un token OAuth (Pro/Max), NO con la cookie sessionKey.
 *  El token de acceso caduca (~8 h), así que el script guarda también el
 *  refresh token y renueva el acceso automáticamente cuando hace falta.
 *
 *  ── SEGURIDAD (requisitos estrictos) ──────────────────────────────────────
 *  1. Los tokens NUNCA están hardcodeados. Se guardan cifrados en el llavero
 *     del dispositivo mediante la clase nativa `Keychain`. (El client_id de
 *     OAuth sí es público — no es un secreto — y por eso puede ir en claro.)
 *  2. Al ejecutar el script DENTRO de la app (no como widget), si falta el
 *     token se ofrece un cuadro de diálogo para guardarlo de forma segura.
 *  3. Un bloque de validación inicial comprueba la existencia del token.
 *     Si falta, se muestra una alerta (modo app) o un widget de "configuración
 *     requerida" (modo widget), en lugar de crashear o exponer datos.
 *  4. Ningún `console.log` imprime el token ni la cabecera Authorization.
 *     El registro de depuración solo usa datos no sensibles.
 * ============================================================================
 */

// ─── Configuración general ──────────────────────────────────────────────────

// Endpoint real de uso (el que alimenta el panel de Claude Code / settings).
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
// Cabecera beta requerida por el endpoint OAuth de uso.
const OAUTH_BETA = "oauth-2025-04-20";

// Renovación de token OAuth. El client_id es el cliente público de Claude
// Code (identificador público de OAuth, NO un secreto).
// Anthropic movió el endpoint de renovación a platform.claude.com; el antiguo
// console.anthropic.com/v1/oauth/token devuelve 404.
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

// User-Agent tipo Claude Code. El borde de la API (Cloudflare) devuelve 403 a
// peticiones sin un User-Agent reconocible; el de Scriptable es genérico.
const USER_AGENT = "claude-cli/1.0.0 (external, cli)";
const ANTHROPIC_VERSION = "2023-06-01";

// Entradas del Keychain donde se guardan los secretos, cifrados. Solo son
// etiquetas: el valor real (token) nunca aparece en el código.
const KC = {
  access: "claude_oauth_access",   // token de acceso (Bearer) — modo directo
  refresh: "claude_oauth_refresh", // refresh token (renueva el acceso)
  expires: "claude_oauth_expires", // caducidad del acceso en ms epoch
  proxyUrl: "claude_proxy_url",    // URL del Worker de Cloudflare — modo proxy
  proxyToken: "claude_proxy_token",// token compartido con el proxy (PROXY_TOKEN)
};

// Borrado seguro: Keychain.remove lanza si la clave no existe, así que
// comprobamos antes. (Lo mismo aplica a Keychain.get en el resto del script.)
function kcRemove(id) {
  if (Keychain.contains(id)) Keychain.remove(id);
}

// Paleta que imita la interfaz de escritorio (tema oscuro).
const COLORS = {
  bg1: new Color("#20222E"),
  bg2: new Color("#191A23"),
  title: new Color("#8A8FA3"),   // encabezados de columna
  label: new Color("#C7CBD6"),   // etiquetas de fila
  value: new Color("#F2F3F7"),   // valores fuertes (%, tiempos)
  subtle: new Color("#9AA0B0"),  // horas de reinicio
  track: new Color("#3A3D4D"),   // fondo de las barras / anillos
  session: new Color("#8B5CF6"), // morado — sesión actual
  weekly: new Color("#3B82F6"),  // azul — barra semanal
  ring2: new Color("#F59E0B"),   // ámbar — anillo semanal
};

// ─── Punto de entrada ────────────────────────────────────────────────────────

await main();

async function main() {
  // BLOQUE DE VALIDACIÓN INICIAL — comprueba la configuración antes de red.
  // Hay configuración si existe un proxy o un token OAuth directo.
  const hasKey = Keychain.contains(KC.proxyUrl) || Keychain.contains(KC.access);

  if (!config.runsInWidget) {
    // Modo app: configurar / actualizar / borrar de forma segura.
    await runInteractiveSetup();
    return;
  }

  // Modo widget.
  if (!hasKey) {
    // No hay llave: mostramos un widget de configuración, nunca un crash.
    const w = buildMissingKeyWidget();
    Script.setWidget(w);
    Script.complete();
    return;
  }

  // Hay llave: recuperamos datos y construimos el widget real.
  const data = await fetchUsage();
  const widget = buildWidget(data);
  Script.setWidget(widget);
  Script.complete();
}

// ─── Configuración interactiva (solo dentro de la app) ───────────────────────

async function runInteractiveSetup() {
  const hasProxy = Keychain.contains(KC.proxyUrl);
  const hasDirect = Keychain.contains(KC.access);
  const hasRefresh = Keychain.contains(KC.refresh);

  const menu = new Alert();
  menu.title = "Claude Usage · Configuración";
  menu.message = statusSummary(hasProxy, hasDirect, hasRefresh);

  // Construimos las acciones con su handler para evitar errores de índice.
  const actions = [];
  actions.push(["Configurar proxy (Cloudflare) — recomendado", promptAndStoreProxy]);
  actions.push([hasDirect ? "Actualizar token OAuth directo" : "Guardar token OAuth directo", promptAndStoreCredentials]);
  if (hasProxy || hasDirect) actions.push(["Ver vista previa del widget", previewWidget]);
  if (hasProxy || hasDirect) actions.push(["Borrar toda la configuración", deleteAllConfig]);

  for (const [label] of actions) menu.addAction(label);
  menu.addCancelAction("Cerrar");

  const choice = await menu.presentSheet();
  if (choice < 0 || choice >= actions.length) return; // cancelado
  await actions[choice][1]();
}

function statusSummary(hasProxy, hasDirect, hasRefresh) {
  if (hasProxy) {
    return "Modo proxy activo (recomendado). El widget pide los datos a tu " +
      "Worker de Cloudflare; tus credenciales de Anthropic no están en el móvil.";
  }
  if (hasDirect) {
    return "Modo directo. Token guardado" +
      (hasRefresh ? " con auto-renovación." : " (sin refresh; caduca en ~8 h).") +
      " Nota: el endpoint puede bloquear peticiones directas del móvil (403).";
  }
  return "Sin configurar. Usa el proxy de Cloudflare (recomendado, evita el " +
    "bloqueo 403) o, si prefieres, pega el token OAuth directo.";
}

// Vista previa con diagnóstico si cae a datos de muestra.
async function previewWidget() {
  const data = await fetchUsage();
  if (data.stale && data.reason) {
    await note("Diagnóstico (no se ven datos reales)", data.reason);
  }
  const widget = buildWidget(data);
  await widget.presentMedium();
}

// Borra tanto el modo proxy como el modo directo.
async function deleteAllConfig() {
  kcRemove(KC.access);
  kcRemove(KC.refresh);
  kcRemove(KC.expires);
  kcRemove(KC.proxyUrl);
  kcRemove(KC.proxyToken);
  await note("Listo", "Se eliminó toda la configuración del llavero.");
}

/**
 * Guarda la URL del Worker y el token del proxy (PROXY_TOKEN), cifrados.
 * En modo proxy el móvil NO guarda las credenciales de Anthropic: solo la
 * URL de tu Worker y un token compartido con él.
 */
async function promptAndStoreProxy() {
  const a = new Alert();
  a.title = "Configurar proxy (Cloudflare)";
  a.message =
    "Pega la URL de tu Worker (p. ej. " +
    "https://claude-usage-proxy.tucuenta.workers.dev) y el PROXY_TOKEN. Se " +
    "guardan cifrados en el llavero. Deja el token vacío para conservar el " +
    "actual.";
  a.addTextField("https://…workers.dev", Keychain.contains(KC.proxyUrl) ? Keychain.get(KC.proxyUrl) : "");
  a.addSecureTextField("PROXY_TOKEN", "");
  a.addAction("Guardar");
  a.addCancelAction("Cancelar");

  const res = await a.present();
  if (res === -1) return; // cancelado

  const rawUrl = a.textFieldValue(0).trim().replace(/\/+$/, "");
  const rawTok = a.textFieldValue(1).trim();
  if (!/^https:\/\//i.test(rawUrl)) {
    await note("URL no válida", "La URL del Worker debe empezar por https://");
    return;
  }
  if (!rawTok && !Keychain.contains(KC.proxyToken)) {
    await note("Falta el token", "Introduce el PROXY_TOKEN la primera vez.");
    return;
  }

  Keychain.set(KC.proxyUrl, rawUrl);
  if (rawTok) Keychain.set(KC.proxyToken, rawTok);

  await note(
    "Guardado de forma segura",
    "Proxy configurado. Toca 'Ver vista previa del widget' para probar. " +
      "Tus credenciales de Anthropic viven en Cloudflare, no en el móvil."
  );
}

/**
 * Pide y guarda las credenciales OAuth de forma segura.
 * Acepta:
 *   - El JSON de credenciales de Claude Code
 *     ({"claudeAiOauth":{"accessToken","refreshToken","expiresAt",...}}),
 *   - o solo el token de acceso (sk-ant-oat01-...), que caduca en ~8 h.
 * Todo se introduce con un campo seguro (oculto) y se cifra en el Keychain.
 */
async function promptAndStoreCredentials() {
  const a = new Alert();
  a.title = "Guardar credenciales OAuth";
  a.message =
    "Pega el JSON de credenciales de Claude Code (recomendado, permite " +
    "auto-renovación) o solo el token de acceso 'sk-ant-oat01-...'. Se " +
    "almacena cifrado en el llavero; nunca en texto plano.";
  // addSecureTextField oculta el contenido mientras se escribe.
  a.addSecureTextField("{\"claudeAiOauth\":{...}}  o  sk-ant-oat01-…", "");
  a.addAction("Guardar");
  a.addCancelAction("Cancelar");

  const res = await a.present();
  if (res === -1) return; // cancelado

  const raw = a.textFieldValue(0).trim();
  if (!raw) {
    await note("Valor vacío", "No se guardó nada porque el campo estaba vacío.");
    return;
  }

  const creds = parseCredentialsInput(raw);
  if (!creds || !creds.access) {
    await note(
      "Formato no reconocido",
      "Esperaba un token 'sk-ant-oat01-...' o el JSON con accessToken/refreshToken."
    );
    return;
  }

  Keychain.set(KC.access, creds.access);
  if (creds.refresh) Keychain.set(KC.refresh, creds.refresh);
  else kcRemove(KC.refresh);
  Keychain.set(KC.expires, String(creds.expires || 0));

  await note(
    "Guardadas de forma segura",
    creds.refresh
      ? "Token y refresh cifrados en el llavero. El acceso se renueva solo."
      : "Token cifrado en el llavero. Sin refresh: recuérdalo, caduca en ~8 h."
  );
}

// Interpreta la entrada del usuario (JSON de credenciales o token suelto).
function parseCredentialsInput(raw) {
  // Caso 1: token de acceso pegado directamente.
  if (raw.startsWith("sk-ant-oat")) {
    return { access: raw, refresh: null, expires: 0 };
  }
  // Caso 2: JSON. Admite el envoltorio claudeAiOauth o el objeto plano.
  try {
    const obj = JSON.parse(raw);
    const o = obj.claudeAiOauth || obj;
    const access = o.accessToken || o.access_token || o.access || null;
    const refresh = o.refreshToken || o.refresh_token || o.refresh || null;
    let expires = o.expiresAt || o.expires_at || o.expires || 0;
    if (typeof expires === "number" && expires < 1e12) expires *= 1000; // seg -> ms
    return access ? { access, refresh, expires: Number(expires) || 0 } : null;
  } catch (e) {
    return null;
  }
}

async function note(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("OK");
  await a.present();
}

// ─── Obtención de datos ──────────────────────────────────────────────────────

/**
 * Recupera el uso desde el endpoint OAuth real usando el token del llavero.
 * - Renueva el token de acceso con el refresh token si está caducado.
 * - Nunca registra el token ni la cabecera Authorization.
 * - Si algo falla, devuelve datos de muestra para que el widget renderice.
 * @returns {Promise<{stale:boolean, session:object, weekly:object}>}
 */
async function fetchUsage() {
  // Modo proxy (recomendado): pide los datos a tu Worker de Cloudflare.
  if (Keychain.contains(KC.proxyUrl)) return fetchViaProxy();
  // Modo directo: llama al endpoint de Anthropic desde el móvil.
  return fetchDirect();
}

/**
 * Pide el uso a tu Worker de Cloudflare. El Worker guarda las credenciales de
 * Anthropic y renueva el token; el móvil solo envía el token del proxy.
 */
async function fetchViaProxy() {
  try {
    const base = Keychain.get(KC.proxyUrl).replace(/\/+$/, "");
    const token = Keychain.contains(KC.proxyToken) ? Keychain.get(KC.proxyToken) : "";

    const req = new Request(base + "/usage");
    req.method = "GET";
    req.headers = {
      // Token del proxy, no el de Anthropic. Nunca se imprime en consola.
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    };
    req.timeoutInterval = 15;

    const json = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 200;
    if (status === 401) {
      return { stale: true, reason: "Proxy 401: el PROXY_TOKEN del widget no coincide con el del Worker. Reconfigura el proxy con el token correcto.", ...sampleData() };
    }
    if (status === 502 && json && json.error === "upstream_error") {
      // El proxy pudo autenticarte, pero Anthropic devolvió error (token OAuth).
      const up = json.upstream_status;
      if (up === 401 || up === 403) {
        return { stale: true, reason: "El token de Anthropic caducó y el Worker no pudo renovarlo (HTTP " + up + "). Vuelve a ejecutar /seed con credenciales frescas.", ...sampleData() };
      }
      return { stale: true, reason: "Anthropic devolvió HTTP " + up + " al Worker. " + shortBody(json.body), ...sampleData() };
    }
    if (status < 200 || status >= 300) {
      return { stale: true, reason: "Proxy HTTP " + status + ". " + shortBody(json), ...sampleData() };
    }
    const parsed = parseUsage(json);
    if (parsed) {
      console.log("Claude Usage: datos recuperados vía proxy.");
      return { stale: false, ...parsed };
    }
    return {
      stale: true,
      reason: "El proxy respondió sin los campos esperados. Claves: " + topKeys(json) + ".",
      ...sampleData(),
    };
  } catch (e) {
    console.log("Claude Usage: fallo hacia el proxy -> " + describeError(e));
    return { stale: true, reason: "No se pudo contactar con el proxy: " + describeError(e), ...sampleData() };
  }
}

/** Modo directo: llama al endpoint de Anthropic desde el dispositivo. */
async function fetchDirect() {
  try {
    const access = await ensureFreshToken();
    if (!access) {
      console.log("Claude Usage: sin token de acceso válido, usando muestra.");
      return { stale: true, reason: "No hay token de acceso en el llavero.", ...sampleData() };
    }

    const req = new Request(USAGE_URL);
    req.method = "GET";
    req.headers = {
      // El token viaja en la cabecera pero jamás se imprime en consola.
      "Authorization": `Bearer ${access}`,
      "anthropic-beta": OAUTH_BETA,
      "anthropic-version": ANTHROPIC_VERSION,
      "User-Agent": USER_AGENT,
      // Claude Code se identifica como app "cli"; el endpoint lo exige.
      "x-app": "cli",
      "Accept": "application/json",
    };
    req.timeoutInterval = 15;

    const json = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 200;
    if (status === 401) {
      console.log("Claude Usage: token no autorizado (401). Reconfigura el token.");
      return {
        stale: true,
        reason: "HTTP 401 (no autorizado). El token caducó o no es válido. " +
          "Pega credenciales frescas de Claude Code (con refreshToken para que se renueve solo). " +
          shortBody(json),
        ...sampleData(),
      };
    }
    if (status === 403) {
      console.log("Claude Usage: prohibido (403). Posible bloqueo del borde o falta de permisos.");
      return {
        stale: true,
        reason: "HTTP 403. Suele ser el borde de la API bloqueando la petición " +
          "(User-Agent) o el token sin permisos para /oauth/usage. " + shortBody(json),
        ...sampleData(),
      };
    }
    if (status < 200 || status >= 300) {
      console.log("Claude Usage: HTTP " + status + " inesperado, usando muestra.");
      return {
        stale: true,
        reason: "HTTP " + status + " del endpoint de uso. " + shortBody(json),
        ...sampleData(),
      };
    }

    const parsed = parseUsage(json);
    if (parsed) {
      console.log("Claude Usage: datos recuperados correctamente.");
      return { stale: false, ...parsed };
    }
    console.log("Claude Usage: respuesta sin campos esperados, usando muestra.");
    return {
      stale: true,
      reason: "HTTP " + status + " OK, pero la respuesta no trae los campos " +
        "esperados (five_hour / seven_day). Claves recibidas: " + topKeys(json) + ".",
      ...sampleData(),
    };
  } catch (e) {
    // Registramos solo el mensaje de error, nunca el token ni las cabeceras.
    console.log("Claude Usage: fallo de red/parseo -> " + describeError(e));
    return {
      stale: true,
      reason: "Fallo de red o de parseo: " + describeError(e) +
        ". ¿Bloqueo de red o el endpoint devolvió algo que no es JSON?",
      ...sampleData(),
    };
  }
}

/**
 * Devuelve un token de acceso válido, renovándolo si es necesario.
 * Si no hay refresh token, devuelve el de acceso tal cual (puede estar caduco).
 * No registra ningún token.
 */
async function ensureFreshToken() {
  const access = Keychain.contains(KC.access) ? Keychain.get(KC.access) : null;
  const refresh = Keychain.contains(KC.refresh) ? Keychain.get(KC.refresh) : null;
  const expires = Keychain.contains(KC.expires) ? Number(Keychain.get(KC.expires)) : 0;

  // Margen de 60 s para no usar un token a punto de caducar.
  const stillValid = expires && Date.now() < expires - 60000;
  if (access && (stillValid || !refresh)) return access;
  if (!refresh) return access;

  try {
    const req = new Request(TOKEN_URL);
    req.method = "POST";
    req.headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    };
    req.body = JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: OAUTH_CLIENT_ID,
    });
    req.timeoutInterval = 15;

    const json = await req.loadJSON();
    if (json && json.access_token) {
      Keychain.set(KC.access, json.access_token);
      if (json.refresh_token) Keychain.set(KC.refresh, json.refresh_token);
      const ttl = Number(json.expires_in) || 0;
      Keychain.set(KC.expires, String(Date.now() + ttl * 1000));
      console.log("Claude Usage: token renovado correctamente.");
      return json.access_token;
    }
    console.log("Claude Usage: la renovación no devolvió access_token.");
  } catch (e) {
    console.log("Claude Usage: fallo al renovar token -> " + describeError(e));
  }
  return access; // último recurso: probamos con el que teníamos
}

/**
 * Normaliza la respuesta del endpoint OAuth de uso a la forma del widget.
 * Esquema real: { five_hour:{utilization,resets_at}, seven_day:{...}, ... }.
 * Es tolerante a nombres alternativos; devuelve null si no reconoce nada.
 */
function parseUsage(json) {
  if (!json || typeof json !== "object") return null;

  const s = json.five_hour || json.current_session || json.session || null;
  const w = json.seven_day || json.weekly_limit || json.weekly || null;
  if (!s && !w) return null;

  const now = Date.now();

  const build = (obj, windowMs) => {
    if (!obj) return null;
    // utilization ya viene en 0..100; se lee tal cual (sin heurística de fracción).
    const rawUsed = firstNumber(obj, ["utilization", "used_pct", "percent", "usage"]);
    const used = rawUsed == null ? null : clampPct(rawUsed);
    const resetAtMs = pickDate(obj, ["resets_at", "reset_at", "resetsAt", "expires_at"]);
    let resetInMs = resetAtMs != null ? resetAtMs - now : null;
    // El anillo representa la fracción del ciclo transcurrida.
    let elapsed = null;
    if (resetInMs != null && windowMs) {
      elapsed = clampPct(100 * (1 - resetInMs / windowMs));
    }
    return {
      usedPct: used == null ? 0 : used,
      elapsedPct: elapsed == null ? used || 0 : elapsed,
      resetIn: resetInMs != null ? formatDuration(resetInMs) : "—",
      resetAt: resetAtMs != null ? formatResetAt(new Date(resetAtMs)) : "—",
    };
  };

  return {
    session: build(s, 5 * 60 * 60 * 1000) || sampleData().session,
    weekly: build(w, 7 * 24 * 60 * 60 * 1000) || sampleData().weekly,
  };
}

// Datos de muestra que imitan la captura del panel de escritorio.
function sampleData() {
  return {
    session: { usedPct: 65, elapsedPct: 68, resetIn: "1h 35m", resetAt: "4:10 PM" },
    weekly: { usedPct: 26, elapsedPct: 78, resetIn: "17h 25m", resetAt: "Aug 28" },
  };
}

// ─── Construcción del widget ─────────────────────────────────────────────────

// Ancho (pts) del widget MEDIANO según la familia de pantalla del iPhone.
// Sirve para escalar el diseño y que se vea bien del SE al Pro Max.
function mediumWidgetWidth() {
  let longer = 852; // valor por defecto razonable (iPhone 14/15/16)
  try {
    const sz = Device.screenSize();
    longer = Math.max(sz.width, sz.height);
  } catch (e) { /* en preview puede no estar; usamos el valor por defecto */ }

  if (longer >= 926) return 360; // Pro Max / Plus grandes
  if (longer >= 896) return 360; // XS Max / 11 Pro Max / XR / 11
  if (longer >= 844) return 338; // 12–16 estándar y Pro
  if (longer >= 812) return 329; // X / XS / 11 Pro / mini
  if (longer >= 736) return 321; // 8 Plus
  return 292;                    // SE / 8 / pantallas estrechas
}

// Calcula tamaños de columnas y tipografías escalados al ancho disponible.
// El diseño base suma 300 pt de contenido; se reescala proporcionalmente.
function metrics() {
  const padH = 12, padV = 12;
  const avail = mediumWidgetWidth() - padH * 2;
  const S = Math.max(0.82, Math.min(avail / 300, 1.18));

  // Tamaño único para todas las fuentes del cuerpo (etiqueta, %, RESETS IN,
  // RESETS AT). Solo los encabezados de columna (fHead) van más pequeños.
  const fBody = 13 * S;

  const m = {
    padH, padV, scale: S,
    colLabel: 66 * S,
    barW: 90 * S, barH: Math.max(10, 13 * S), gap: 7 * S, pctW: 34 * S,
    colIn: 56 * S, colAt: 46 * S,
    fLabel: fBody, fPct: fBody, fVal: fBody, fSub: fBody, fHead: 8.5 * S,
    rowGap: 14 * S,
  };
  m.colUsed = m.barW + m.gap + m.pctW;
  return m;
}

function baseWidget(padV, padH) {
  const w = new ListWidget();
  const grad = new LinearGradient();
  grad.colors = [COLORS.bg1, COLORS.bg2];
  grad.locations = [0, 1];
  grad.startPoint = new Point(0, 0);
  grad.endPoint = new Point(1, 1);
  w.backgroundGradient = grad;
  w.setPadding(padV == null ? 14 : padV, padH == null ? 16 : padH,
               padV == null ? 14 : padV, padH == null ? 16 : padH);
  return w;
}

function buildMissingKeyWidget() {
  const w = baseWidget();
  const title = w.addText("Claude Usage");
  title.font = Font.semiboldSystemFont(15);
  title.textColor = COLORS.value;
  w.addSpacer(6);
  const msg = w.addText("⚠︎ Configuración requerida");
  msg.font = Font.mediumSystemFont(13);
  msg.textColor = COLORS.ring2;
  w.addSpacer(4);
  const hint = w.addText(
    "Abre este script en la app Scriptable y guarda tus credenciales OAuth para activar el widget."
  );
  hint.font = Font.systemFont(11);
  hint.textColor = COLORS.subtle;
  w.addSpacer();
  return w;
}

function buildWidget(data) {
  const m = metrics();
  const w = baseWidget(m.padV, m.padH);

  // Fila de encabezados de columna (alineada con las columnas de datos).
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  addFixedStack(header, m.colLabel);
  addColTitle(header, "SESSION USED", m.colUsed, "left", m.fHead);
  addColTitle(header, "RESETS IN", m.colIn, "left", m.fHead);
  addColTitle(header, "RESETS AT", m.colAt, "left", m.fHead);
  header.addSpacer();

  w.addSpacer(m.rowGap * 0.9);
  addRow(w, m, "CURRENT SESSION", data.session, COLORS.session, COLORS.session);
  w.addSpacer(m.rowGap);
  addRow(w, m, "WEEKLY LIMIT", data.weekly, COLORS.weekly, COLORS.ring2);
  w.addSpacer();

  // Pie discreto: marca de actualización o aviso de datos de muestra.
  const foot = w.addText(
    data.stale ? "· datos de muestra · revisa el token" : "· actualizado " + nowLabel()
  );
  foot.font = Font.systemFont(Math.max(8, 9 * m.scale));
  foot.textColor = data.stale ? COLORS.ring2 : COLORS.title;
  foot.centerAlignText();

  return w;
}

function addRow(w, m, label, d, barColor, ringColor) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  // Col 1 — etiqueta de la fila.
  const lbl = addFixedStack(row, m.colLabel);
  const lt = lbl.addText(label);
  lt.font = Font.semiboldSystemFont(m.fLabel);
  lt.textColor = COLORS.label;
  lt.lineLimit = 1;
  lt.minimumScaleFactor = 0.6;

  // Col 2 — barra de progreso + porcentaje.
  const barCol = addFixedStack(row, m.colUsed);
  barCol.centerAlignContent();
  barCol.addImage(barImage(d.usedPct, barColor, m.barW, m.barH));
  barCol.addSpacer(m.gap);
  const pctBox = barCol.addStack();
  pctBox.size = new Size(m.pctW, 0);
  const pct = pctBox.addText(`${Math.round(d.usedPct)}%`);
  pct.font = Font.boldSystemFont(m.fPct);
  pct.textColor = COLORS.value;
  pct.lineLimit = 1;
  pct.minimumScaleFactor = 0.6;

  // Col 3 — tiempo hasta el reinicio.
  const inCol = addFixedStack(row, m.colIn);
  const it = inCol.addText(d.resetIn);
  it.font = Font.semiboldSystemFont(m.fVal);
  it.textColor = COLORS.value;
  it.lineLimit = 1;
  it.minimumScaleFactor = 0.6;

  // Col 4 — hora de reinicio.
  const atCol = addFixedStack(row, m.colAt);
  const at = atCol.addText(d.resetAt);
  at.font = Font.systemFont(m.fSub);
  at.textColor = COLORS.subtle;
  at.lineLimit = 1;
  at.minimumScaleFactor = 0.6;
}

// ─── Helpers de dibujo ───────────────────────────────────────────────────────

// Barra de progreso redondeada dibujada con DrawContext.
// Renderiza al tamaño real en puntos; respectScreenScale da nitidez retina.
function barImage(pct, color, width, height) {
  const W = width;
  const H = height;
  const r = H / 2;
  const p = clampPct(pct) / 100;

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Pista de fondo.
  ctx.setFillColor(COLORS.track);
  ctx.addPath(roundedRectPath(0, 0, W, H, r));
  ctx.fillPath();

  // Relleno.
  const fillW = Math.max(H, W * p); // al menos un círculo visible
  ctx.setFillColor(color);
  ctx.addPath(roundedRectPath(0, 0, fillW, H, r));
  ctx.fillPath();

  return ctx.getImage();
}

// Anillo de progreso (tiempo transcurrido) dibujado por segmentos.
// Renderiza al tamaño real en puntos; respectScreenScale da nitidez retina.
function ringImage(pct, color, ptSize) {
  const size = ptSize || 26;
  const lineWidth = Math.max(3, size * 0.15);
  const radius = (size - lineWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const p = clampPct(pct) / 100;

  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Pista completa.
  strokeArc(ctx, cx, cy, radius, lineWidth, 0, 360, COLORS.track);
  // Progreso desde arriba (-90°) en sentido horario.
  strokeArc(ctx, cx, cy, radius, lineWidth, -90, -90 + 360 * p, color);

  return ctx.getImage();
}

// Traza un arco rellenando pequeños círculos a lo largo del recorrido.
function strokeArc(ctx, cx, cy, radius, lineWidth, startDeg, endDeg, color) {
  ctx.setFillColor(color);
  const dotR = lineWidth / 2;
  const steps = Math.max(1, Math.round(Math.abs(endDeg - startDeg) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    const x = cx + radius * Math.cos(rad) - dotR;
    const y = cy + radius * Math.sin(rad) - dotR;
    ctx.fillEllipse(new Rect(x, y, dotR * 2, dotR * 2));
  }
}

function roundedRectPath(x, y, w, h, r) {
  const path = new Path();
  r = Math.min(r, w / 2, h / 2);
  path.move(new Point(x + r, y));
  path.addLine(new Point(x + w - r, y));
  path.addQuadCurve(new Point(x + w, y + r), new Point(x + w, y));
  path.addLine(new Point(x + w, y + h - r));
  path.addQuadCurve(new Point(x + w - r, y + h), new Point(x + w, y + h));
  path.addLine(new Point(x + r, y + h));
  path.addQuadCurve(new Point(x, y + h - r), new Point(x, y + h));
  path.addLine(new Point(x, y + r));
  path.addQuadCurve(new Point(x + r, y), new Point(x, y));
  path.closeSubpath();
  return path;
}

// ─── Helpers de layout / texto ───────────────────────────────────────────────

function addFixedStack(parent, width) {
  const s = parent.addStack();
  s.size = new Size(width, 0);
  s.layoutHorizontally();
  s.centerAlignContent();
  return s;
}

function addColTitle(parent, text, width, align, fontSize) {
  const s = addFixedStack(parent, width);
  if (align === "center") s.addSpacer();
  const t = s.addText(text);
  t.font = Font.mediumSystemFont(fontSize || 9);
  t.textColor = COLORS.title;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  if (align === "center") s.addSpacer();
}

// ─── Utilidades varias ───────────────────────────────────────────────────────

function clampPct(n) {
  if (typeof n !== "number" || isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// Devuelve el primer valor numérico presente entre las claves dadas, tal cual.
function firstNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickDate(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // seg o ms
    const parsed = Date.parse(v);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatResetAt(date) {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    const df = new DateFormatter();
    df.useNoDateStyle();
    df.useShortTimeStyle(); // p. ej. 4:10 PM
    return df.string(date);
  }
  const df = new DateFormatter();
  df.dateFormat = "MMM d"; // p. ej. Aug 28
  return df.string(date);
}

function nowLabel() {
  const df = new DateFormatter();
  df.useNoDateStyle();
  df.useShortTimeStyle();
  return df.string(new Date());
}

// Lista las claves de nivel superior de la respuesta (nombres, no valores).
function topKeys(json) {
  if (!json || typeof json !== "object") return "(no es objeto)";
  const keys = Object.keys(json);
  return keys.length ? keys.slice(0, 12).join(", ") : "(objeto vacío)";
}

// Extrae un mensaje/error corto del cuerpo para diagnóstico (sin datos sensibles).
function shortBody(json) {
  if (!json || typeof json !== "object") return "";
  const msg = (json.error && (json.error.message || json.error.type)) ||
    json.message || json.detail || json.type || "";
  const s = String(msg || "");
  return s ? "(" + (s.length > 100 ? s.slice(0, 100) + "…" : s) + ")" : "";
}

// Devuelve una descripción de error segura (sin exponer datos sensibles).
function describeError(e) {
  if (!e) return "error desconocido";
  const msg = (e && e.message) ? String(e.message) : String(e);
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
