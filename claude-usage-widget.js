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
 *  ── SEGURIDAD (requisitos estrictos) ──────────────────────────────────────
 *  1. La sessionKey NUNCA está hardcodeada en el código. Se guarda cifrada
 *     en el llavero del dispositivo mediante la clase nativa `Keychain`.
 *  2. Al ejecutar el script DENTRO de la app (no como widget), si la llave no
 *     existe se ofrece un cuadro de diálogo para guardarla de forma segura.
 *  3. Un bloque de validación inicial comprueba la existencia de la llave.
 *     Si falta, se muestra una alerta (modo app) o un widget de "configuración
 *     requerida" (modo widget), en lugar de crashear o exponer datos.
 *  4. Ningún `console.log` imprime la sessionKey ni cabeceras de autorización
 *     completas. El registro de depuración solo usa datos no sensibles.
 * ============================================================================
 */

// ─── Configuración general ──────────────────────────────────────────────────

// Nombre de la entrada en el Keychain. Solo es una etiqueta, NO el secreto.
const KEYCHAIN_ID = "claude_session_key";

// Endpoint de uso de Claude. Ajusta si tu organización usa otro host.
// La respuesta se procesa de forma defensiva; si falla, se usan datos de
// muestra para que el widget siempre renderice sin exponer nada.
const USAGE_URL = "https://claude.ai/api/organizations/usage";

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
  // BLOQUE DE VALIDACIÓN INICIAL — comprueba la llave antes de cualquier red.
  const hasKey = Keychain.contains(KEYCHAIN_ID);

  if (!config.runsInWidget) {
    // Modo app: permite configurar / actualizar / borrar la llave de forma segura.
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
  const menu = new Alert();
  menu.title = "Claude Usage · Configuración";
  menu.message = hasKey
    ? "Ya hay una sessionKey guardada de forma cifrada en el llavero."
    : "No hay sessionKey guardada. Añádela para activar el widget.";

  menu.addAction(hasKey ? "Actualizar sessionKey" : "Guardar sessionKey");
  if (hasKey) menu.addDestructiveAction("Borrar sessionKey del llavero");
  menu.addAction("Ver vista previa del widget");
  menu.addCancelAction("Cerrar");

  const choice = await menu.presentSheet();

  // Índices dependen de si existe la llave (por la acción destructiva).
  const idxSave = 0;
  const idxDelete = hasKey ? 1 : -1;
  const idxPreview = hasKey ? 2 : 1;

  if (choice === idxSave) {
    await promptAndStoreKey();
  } else if (choice === idxDelete) {
    Keychain.remove(KEYCHAIN_ID);
    const done = new Alert();
    done.title = "Listo";
    done.message = "La sessionKey fue eliminada del llavero.";
    done.addAction("OK");
    await done.present();
  } else if (choice === idxPreview) {
    const data = await fetchUsage();
    const widget = buildWidget(data);
    await widget.presentMedium();
  }
}

async function promptAndStoreKey() {
  const a = new Alert();
  a.title = "Guardar sessionKey";
  a.message =
    "Pega tu cookie de sesión (sessionKey). Se almacena cifrada en el " +
    "llavero del dispositivo y no se escribe en texto plano.";
  // addSecureTextField oculta el contenido mientras se escribe.
  a.addSecureTextField("sk-ant-sid...", "");
  a.addAction("Guardar");
  a.addCancelAction("Cancelar");

  const res = await a.present();
  if (res === -1) return; // cancelado

  const value = a.textFieldValue(0).trim();
  if (!value) {
    const err = new Alert();
    err.title = "Valor vacío";
    err.message = "No se guardó nada porque el campo estaba vacío.";
    err.addAction("OK");
    await err.present();
    return;
  }

  Keychain.set(KEYCHAIN_ID, value);

  const ok = new Alert();
  ok.title = "Guardada de forma segura";
  ok.message = "La sessionKey quedó cifrada en el llavero. Ya puedes añadir " +
    "el widget mediano a tu pantalla de inicio.";
  ok.addAction("OK");
  await ok.present();
}

// ─── Obtención de datos ──────────────────────────────────────────────────────

/**
 * Recupera el uso desde el endpoint usando la sessionKey del llavero.
 * - Nunca registra la llave ni la cabecera Cookie completa.
 * - Si algo falla, devuelve datos de muestra para que el widget renderice.
 * @returns {Promise<{stale:boolean, session:object, weekly:object}>}
 */
async function fetchUsage() {
  // Recuperación segura desde el llavero (nunca hardcodeada).
  const sessionKey = Keychain.get(KEYCHAIN_ID);

  try {
    const req = new Request(USAGE_URL);
    req.method = "GET";
    req.headers = {
      // La cookie viaja en la cabecera pero jamás se imprime en consola.
      "Cookie": `sessionKey=${sessionKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    req.timeoutInterval = 15;

    const json = await req.loadJSON();
    const parsed = parseUsage(json);
    if (parsed) {
      console.log("Claude Usage: datos recuperados correctamente.");
      return { stale: false, ...parsed };
    }
    console.log("Claude Usage: respuesta sin campos esperados, usando muestra.");
  } catch (e) {
    // Registramos solo el mensaje de error, nunca la llave ni las cabeceras.
    console.log("Claude Usage: fallo de red/parseo -> " + describeError(e));
  }

  return { stale: true, ...sampleData() };
}

/**
 * Normaliza la respuesta del API a la forma que consume el widget.
 * Es tolerante a distintos nombres de campo; devuelve null si no reconoce nada.
 */
function parseUsage(json) {
  if (!json || typeof json !== "object") return null;

  const s = json.current_session || json.session || json.five_hour || null;
  const w = json.weekly_limit || json.weekly || json.seven_day || null;
  if (!s && !w) return null;

  const now = Date.now();

  const build = (obj, windowMs) => {
    if (!obj) return null;
    const used = clampPct(pickNumber(obj, ["used_pct", "utilization", "percent", "usage"]));
    const resetAtMs = pickDate(obj, ["resets_at", "reset_at", "resetsAt", "expires_at"]);
    let resetInMs = pickNumber(obj, ["resets_in_ms", "reset_in_ms"]);
    if (resetInMs == null && resetAtMs != null) resetInMs = resetAtMs - now;
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

function baseWidget() {
  const w = new ListWidget();
  const grad = new LinearGradient();
  grad.colors = [COLORS.bg1, COLORS.bg2];
  grad.locations = [0, 1];
  grad.startPoint = new Point(0, 0);
  grad.endPoint = new Point(1, 1);
  w.backgroundGradient = grad;
  w.setPadding(14, 16, 14, 16);
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
    "Abre este script en la app Scriptable y guarda tu sessionKey para activar el widget."
  );
  hint.font = Font.systemFont(11);
  hint.textColor = COLORS.subtle;
  w.addSpacer();
  return w;
}

function buildWidget(data) {
  const w = baseWidget();

  // Fila de encabezados de columna.
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  addFixedText(header, "", 96);
  addColTitle(header, "SESSION USED", 104, "left");
  addColTitle(header, "ELAPSED", 52, "center");
  addColTitle(header, "RESETS IN", 62, "left");
  addColTitle(header, "RESETS AT", 60, "left");

  w.addSpacer(10);
  addRow(w, "CURRENT SESSION", data.session, COLORS.session, COLORS.session);
  w.addSpacer(12);
  addRow(w, "WEEKLY LIMIT", data.weekly, COLORS.weekly, COLORS.ring2);
  w.addSpacer();

  // Pie discreto: marca de actualización o aviso de datos de muestra.
  const foot = w.addText(
    data.stale ? "· datos de muestra · revisa la sessionKey" : "· actualizado " + nowLabel()
  );
  foot.font = Font.systemFont(9);
  foot.textColor = data.stale ? COLORS.ring2 : COLORS.title;
  foot.centerAlignText();

  return w;
}

function addRow(w, label, d, barColor, ringColor) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  // Col 1 — etiqueta de la fila.
  const lbl = addFixedStack(row, 96);
  const lt = lbl.addText(label);
  lt.font = Font.semiboldSystemFont(11);
  lt.textColor = COLORS.label;
  lt.lineLimit = 1;
  lt.minimumScaleFactor = 0.7;

  // Col 2 — barra de progreso + porcentaje.
  const barCol = addFixedStack(row, 104);
  barCol.centerAlignContent();
  barCol.addImage(barImage(d.usedPct, barColor, 78, 8));
  barCol.addSpacer(6);
  const pct = barCol.addText(`${Math.round(d.usedPct)}%`);
  pct.font = Font.boldSystemFont(13);
  pct.textColor = COLORS.value;

  // Col 3 — anillo de tiempo transcurrido.
  const ringCol = addFixedStack(row, 52);
  ringCol.centerAlignContent();
  const ring = ringCol.addImage(ringImage(d.elapsedPct, ringColor));
  ring.imageSize = new Size(26, 26);

  // Col 4 — tiempo hasta el reinicio.
  const inCol = addFixedStack(row, 62);
  const it = inCol.addText(d.resetIn);
  it.font = Font.semiboldSystemFont(13);
  it.textColor = COLORS.value;
  it.lineLimit = 1;
  it.minimumScaleFactor = 0.7;

  // Col 5 — hora de reinicio.
  const atCol = addFixedStack(row, 60);
  const at = atCol.addText(d.resetAt);
  at.font = Font.systemFont(13);
  at.textColor = COLORS.subtle;
  at.lineLimit = 1;
  at.minimumScaleFactor = 0.7;
}

// ─── Helpers de dibujo ───────────────────────────────────────────────────────

// Barra de progreso redondeada dibujada con DrawContext.
function barImage(pct, color, width, height) {
  const scale = 3;
  const W = width * scale;
  const H = height * scale;
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
function ringImage(pct, color) {
  const scale = 3;
  const size = 26 * scale;
  const lineWidth = 4 * scale;
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

function addFixedText(parent, text, width) {
  const s = addFixedStack(parent, width);
  const t = s.addText(text);
  t.font = Font.systemFont(9);
  return s;
}

function addColTitle(parent, text, width, align) {
  const s = addFixedStack(parent, width);
  if (align === "center") {
    s.addSpacer();
  }
  const t = s.addText(text);
  t.font = Font.mediumSystemFont(9);
  t.textColor = COLORS.title;
  if (align === "center") s.addSpacer();
}

// ─── Utilidades varias ───────────────────────────────────────────────────────

function clampPct(n) {
  if (typeof n !== "number" || isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v <= 1 ? v * 100 : v; // admite 0..1 o 0..100
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
      const n = Number(v);
      return n <= 1 ? n * 100 : n;
    }
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
