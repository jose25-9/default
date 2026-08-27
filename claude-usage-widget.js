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
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

// Entradas del Keychain donde se guardan los secretos, cifrados. Solo son
// etiquetas: el valor real (token) nunca aparece en el código.
const KC = {
  access: "claude_oauth_access",   // token de acceso (Bearer)
  refresh: "claude_oauth_refresh", // refresh token (renueva el acceso)
  expires: "claude_oauth_expires", // caducidad del acceso en ms epoch
};

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
  // BLOQUE DE VALIDACIÓN INICIAL — comprueba el token antes de cualquier red.
  const hasKey = Keychain.contains(KC.access);

  if (!config.runsInWidget) {
    // Modo app: permite configurar / actualizar / borrar el token de forma segura.
    await runInteractiveSetup(hasKey);
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

async function runInteractiveSetup(hasKey) {
  const hasRefresh = Keychain.contains(KC.refresh);
  const summary = hasKey
    ? "Token guardado" + (hasRefresh ? " (con auto-renovación)." : " (sin refresh; caduca en ~8 h).")
    : "No hay token guardado.";

  const menu = new Alert();
  menu.title = "Claude Usage · Configuración";
  menu.message = hasKey
    ? summary
    : "No hay token. Pega tus credenciales OAuth para activar el widget.";

  menu.addAction(hasKey ? "Actualizar credenciales OAuth" : "Guardar credenciales OAuth");
  if (hasKey) menu.addDestructiveAction("Borrar credenciales del llavero");
  menu.addAction("Ver vista previa del widget");
  menu.addCancelAction("Cerrar");

  const choice = await menu.presentSheet();
  if (choice < 0) return; // cancelado

  const idxSave = 0;
  const idxDelete = hasKey ? 1 : -1;
  const idxPreview = hasKey ? 2 : 1;

  if (choice === idxSave) {
    await promptAndStoreCredentials();
  } else if (choice === idxDelete) {
    Keychain.remove(KC.access);
    Keychain.remove(KC.refresh);
    Keychain.remove(KC.expires);
    await note("Listo", "Se eliminaron las credenciales del llavero.");
  } else if (choice === idxPreview) {
    const data = await fetchUsage();
    const widget = buildWidget(data);
    await widget.presentMedium();
  }
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
  else Keychain.remove(KC.refresh);
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
  try {
    const access = await ensureFreshToken();
    if (!access) {
      console.log("Claude Usage: sin token de acceso válido, usando muestra.");
      return { stale: true, ...sampleData() };
    }

    const req = new Request(USAGE_URL);
    req.method = "GET";
    req.headers = {
      // El token viaja en la cabecera pero jamás se imprime en consola.
      "Authorization": `Bearer ${access}`,
      "anthropic-beta": OAUTH_BETA,
      "Accept": "application/json",
    };
    req.timeoutInterval = 15;

    const json = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 200;
    if (status === 401) {
      console.log("Claude Usage: token no autorizado (401). Reconfigura el token.");
      return { stale: true, ...sampleData() };
    }

    const parsed = parseUsage(json);
    if (parsed) {
      console.log("Claude Usage: datos recuperados correctamente.");
      return { stale: false, ...parsed };
    }
    console.log("Claude Usage: respuesta sin campos esperados, usando muestra.");
  } catch (e) {
    // Registramos solo el mensaje de error, nunca el token ni las cabeceras.
    console.log("Claude Usage: fallo de red/parseo -> " + describeError(e));
  }

  return { stale: true, ...sampleData() };
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
    req.headers = { "Content-Type": "application/json", "Accept": "application/json" };
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

  const m = {
    padH, padV, scale: S,
    colLabel: 68 * S,
    barW: 56 * S, barH: Math.max(6, 8 * S), gap: 6 * S, pctW: 30 * S,
    colElapsed: 38 * S, ringSize: 26 * S,
    colIn: 56 * S, colAt: 46 * S,
    fLabel: 11 * S, fPct: 13 * S, fVal: 12.5 * S, fSub: 12.5 * S, fHead: 8.5 * S,
    rowGap: 12 * S,
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
  addColTitle(header, "ELAPSED", m.colElapsed, "center", m.fHead);
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

  // Col 3 — anillo de tiempo transcurrido.
  const ringCol = addFixedStack(row, m.colElapsed);
  ringCol.centerAlignContent();
  ringCol.addSpacer();
  const ring = ringCol.addImage(ringImage(d.elapsedPct, ringColor, m.ringSize));
  ring.imageSize = new Size(m.ringSize, m.ringSize);
  ringCol.addSpacer();

  // Col 4 — tiempo hasta el reinicio.
  const inCol = addFixedStack(row, m.colIn);
  const it = inCol.addText(d.resetIn);
  it.font = Font.semiboldSystemFont(m.fVal);
  it.textColor = COLORS.value;
  it.lineLimit = 1;
  it.minimumScaleFactor = 0.6;

  // Col 5 — hora de reinicio.
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

// Devuelve una descripción de error segura (sin exponer datos sensibles).
function describeError(e) {
  if (!e) return "error desconocido";
  const msg = (e && e.message) ? String(e.message) : String(e);
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
