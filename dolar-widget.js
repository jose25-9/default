// Widget de Scriptable: dólar oficial vs paralelo (Venezuela) + comparador de pago
// Fuente de datos: https://ve.dolarapi.com/v1/dolares
//
// - Widget PEQUEÑO: muestra la brecha cambiaria en %  -> 1 - (oficial / paralelo)
// - Widget MEDIANO: compara dos formas de pagar (BCV vs cash) y marca con una
//   flecha verde la que más conviene, mostrando la diferencia en dólares.
// - Al TOCAR el widget se abre Scriptable y te pide los dos montos; quedan
//   guardados para que el widget los siga mostrando en cada refresco.

const API_URL = "https://ve.dolarapi.com/v1/dolares";

// --- Colores ---
const FONDO = new Color("#0d1b2a");
const GRIS = new Color("#9bb0c1");
const GRIS_OSCURO = new Color("#6c7a89");
const BLANCO = new Color("#e0e1dd");
const VERDE = new Color("#51cf66");
const ROJO = new Color("#ff6b6b");

// --- Datos de la API ---
async function obtenerDatos() {
  const req = new Request(API_URL);
  const data = await req.loadJSON();

  const oficial = data.find((d) => d.fuente === "oficial");
  const paralelo = data.find((d) => d.fuente === "paralelo");

  if (!oficial || !paralelo) {
    throw new Error("No se encontraron las tasas oficial/paralelo en la API");
  }

  return { oficial: oficial.promedio, paralelo: paralelo.promedio };
}

function calcularBrecha(oficial, paralelo) {
  // 1 - (oficial / paralelo); por 100 para mostrarlo en %
  return (1 - oficial / paralelo) * 100;
}

function fmt(n) {
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// --- Guardar/leer los montos ingresados ---
function leerMontos() {
  const bcv = Keychain.contains("dolar_bcv")
    ? parseFloat(Keychain.get("dolar_bcv"))
    : null;
  const cash = Keychain.contains("dolar_cash")
    ? parseFloat(Keychain.get("dolar_cash"))
    : null;
  return { bcv, cash };
}

function guardarMontos(bcv, cash) {
  Keychain.set("dolar_bcv", String(bcv));
  Keychain.set("dolar_cash", String(cash));
}

async function pedirMontos(prev) {
  const a = new Alert();
  a.title = "Comparar pago";
  a.message = "Ingresa los dos montos en dólares";
  a.addTextField("Monto BCV ($)", prev.bcv != null ? String(prev.bcv) : "");
  a.addTextField("Monto cash ($)", prev.cash != null ? String(prev.cash) : "");
  a.addAction("Comparar");
  a.addCancelAction("Cancelar");
  const idx = await a.presentAlert();
  if (idx === -1) return null; // canceló
  const bcv = parseFloat(a.textFieldValue(0).replace(",", "."));
  const cash = parseFloat(a.textFieldValue(1).replace(",", "."));
  return { bcv, cash };
}

// --- Widget pequeño: brecha en % ---
function crearWidgetPequeno(datos) {
  const { oficial, paralelo } = datos;
  const brecha = calcularBrecha(oficial, paralelo);

  const w = new ListWidget();
  w.backgroundColor = FONDO;
  w.setPadding(16, 16, 16, 16);

  const titulo = w.addText("Brecha cambiaria");
  titulo.font = Font.mediumSystemFont(13);
  titulo.textColor = GRIS;

  w.addSpacer(6);

  const pct = w.addText(`${fmt(brecha)} %`);
  pct.font = Font.boldSystemFont(28);
  pct.textColor = brecha >= 0 ? ROJO : VERDE;

  w.addSpacer(8);

  const oficialTxt = w.addText(`Oficial: Bs. ${fmt(oficial)}`);
  oficialTxt.font = Font.systemFont(12);
  oficialTxt.textColor = BLANCO;

  const paraleloTxt = w.addText(`Paralelo: Bs. ${fmt(paralelo)}`);
  paraleloTxt.font = Font.systemFont(12);
  paraleloTxt.textColor = BLANCO;

  w.addSpacer(6);

  const fecha = w.addText(`Act.: ${new Date().toLocaleString("es-VE")}`);
  fecha.font = Font.systemFont(9);
  fecha.textColor = GRIS_OSCURO;

  return w;
}

// Una fila de opción dentro del comparador
function filaOpcion(w, etiqueta, costoTxt, gana) {
  const st = w.addStack();
  st.centerAlignContent();

  const flecha = st.addText(gana ? "🟢 " : "    ");
  flecha.font = Font.boldSystemFont(14);

  const lbl = st.addText(etiqueta);
  lbl.font = gana ? Font.boldSystemFont(14) : Font.systemFont(14);
  lbl.textColor = gana ? VERDE : BLANCO;

  st.addSpacer();

  const c = st.addText(costoTxt);
  c.font = gana ? Font.boldSystemFont(14) : Font.systemFont(14);
  c.textColor = gana ? VERDE : GRIS;
}

// --- Widget mediano: comparador de pago ---
function crearWidgetMediano(datos, montos) {
  const { oficial, paralelo } = datos;

  const w = new ListWidget();
  w.backgroundColor = FONDO;
  w.setPadding(14, 16, 14, 16);

  const titulo = w.addText("¿Cómo me conviene pagar?");
  titulo.font = Font.boldSystemFont(14);
  titulo.textColor = GRIS;
  w.addSpacer(10);

  const sinDatos =
    montos.bcv == null ||
    montos.cash == null ||
    isNaN(montos.bcv) ||
    isNaN(montos.cash);

  if (sinDatos) {
    const aviso = w.addText("Toca el widget para ingresar los dos montos (BCV y cash).");
    aviso.font = Font.systemFont(13);
    aviso.textColor = BLANCO;
    w.addSpacer(10);
    const tasas = w.addText(`Oficial Bs.${fmt(oficial)} · Paralelo Bs.${fmt(paralelo)}`);
    tasas.font = Font.systemFont(10);
    tasas.textColor = GRIS_OSCURO;
    return w;
  }

  // Costo real en dólares EN EFECTIVO de cada opción
  const costoBCV = montos.bcv * (oficial / paralelo); // se paga en Bs. comprados a paralelo
  const costoCash = montos.cash; // dólares en efectivo directos
  const bcvGana = costoBCV < costoCash;
  const diferencia = Math.abs(costoBCV - costoCash);

  filaOpcion(w, `BCV  ${fmt(montos.bcv)}$`, `${fmt(costoBCV)}$ cash`, bcvGana);
  w.addSpacer(5);
  filaOpcion(w, `Cash ${fmt(montos.cash)}$`, `${fmt(costoCash)}$ cash`, !bcvGana);

  w.addSpacer(10);

  // Diferencia en dólares (debajo de la flecha)
  const dif = w.addText(`Diferencia: ${fmt(diferencia)}$ a favor de ${bcvGana ? "BCV" : "Cash"}`);
  dif.font = Font.boldSystemFont(12);
  dif.textColor = VERDE;

  w.addSpacer(4);
  const tasas = w.addText(`Oficial Bs.${fmt(oficial)} · Paralelo Bs.${fmt(paralelo)}`);
  tasas.font = Font.systemFont(9);
  tasas.textColor = GRIS_OSCURO;

  return w;
}

// ===================== Flujo principal =====================
const datos = await obtenerDatos();

// Si abriste el script tocando el widget (corre dentro de la app), pide los montos.
// En el refresco en segundo plano / Atajos no se pregunta nada.
if (config.runsInApp) {
  const nuevos = await pedirMontos(leerMontos());
  if (nuevos && !isNaN(nuevos.bcv) && !isNaN(nuevos.cash)) {
    guardarMontos(nuevos.bcv, nuevos.cash);
  }
}

const montos = leerMontos();
const family = config.widgetFamily; // "small", "medium", "large" o null

let widget;
if (family === "small") {
  widget = crearWidgetPequeno(datos);
} else {
  widget = crearWidgetMediano(datos, montos);
}

// Sugerir a iOS el próximo refresco para mañana a las 8:30 a. m.
// (iOS lo toma como sugerencia; la hora exacta la garantiza la automatización
//  de Atajos que ejecuta este script a las 8:30.)
const proxima = new Date();
proxima.setHours(8, 30, 0, 0);
if (proxima <= new Date()) proxima.setDate(proxima.getDate() + 1);
widget.refreshAfterDate = proxima;

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === "small") {
  widget.presentSmall();
} else {
  widget.presentMedium();
}

Script.complete();
