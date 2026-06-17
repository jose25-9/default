// Widget de Scriptable: dólar oficial vs paralelo (Venezuela) + comparador de pago
// Fuente de datos: https://ve.dolarapi.com/v1/dolares
//
// - Widget PEQUEÑO: muestra la brecha cambiaria en %  -> 1 - (oficial / paralelo)
// - Widget MEDIANO: compara dos formas de pagar (BCV vs cash) y marca con una
//   flecha verde la que más conviene, mostrando la diferencia en dólares.
// - Al TOCAR el widget se abre Scriptable y te pide los dos montos; quedan
//   guardados para que el widget los siga mostrando en cada refresco.

const API_URL = "https://ve.dolarapi.com/v1/dolares";

// Nombre EXACTO del Atajo (Shortcut) que pide los montos y muestra el resultado.
// Al tocar el widget se abrirá este Atajo en vez de la app de Scriptable.
const NOMBRE_ATAJO = "Comparar Dólar";
const ATAJO_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(NOMBRE_ATAJO)}`;

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

// --- Pedir los montos solo en el momento (no se guarda nada) ---
async function pedirMontos() {
  const a = new Alert();
  a.title = "Comparar pago";
  a.message = "Ingresa los dos montos en dólares";
  a.addTextField("Monto BCV ($)", "");
  a.addTextField("Monto cash ($)", "");
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

  // Todo el contenido va dentro de este stack, que lleva el enlace al Atajo.
  // (En widgets medianos/grandes el widget.url se ignora; el enlace debe ir
  //  en los elementos internos.)
  const c = w.addStack();
  c.layoutVertically();
  c.url = ATAJO_URL;

  const titulo = c.addText("¿Cómo me conviene pagar?");
  titulo.font = Font.boldSystemFont(14);
  titulo.textColor = GRIS;
  c.addSpacer(10);

  const sinDatos =
    montos.bcv == null ||
    montos.cash == null ||
    isNaN(montos.bcv) ||
    isNaN(montos.cash);

  if (sinDatos) {
    const aviso = c.addText("Toca el widget para ingresar los dos montos (BCV y cash).");
    aviso.font = Font.systemFont(13);
    aviso.textColor = BLANCO;
    c.addSpacer(10);
    const tasas = c.addText(`Oficial Bs.${fmt(oficial)} · Paralelo Bs.${fmt(paralelo)}`);
    tasas.font = Font.systemFont(10);
    tasas.textColor = GRIS_OSCURO;
    return w;
  }

  // Costo real en dólares EN EFECTIVO de cada opción
  const costoBCV = montos.bcv * (oficial / paralelo); // se paga en Bs. comprados a paralelo
  const costoCash = montos.cash; // dólares en efectivo directos
  const bcvGana = costoBCV < costoCash;
  const diferencia = Math.abs(costoBCV - costoCash);
  const difBs = Math.abs(montos.bcv * oficial - montos.cash * paralelo);

  filaOpcion(c, `BCV  ${fmt(montos.bcv)}$`, `${fmt(costoBCV)}$ cash`, bcvGana);
  c.addSpacer(5);
  filaOpcion(c, `Cash ${fmt(montos.cash)}$`, `${fmt(costoCash)}$ cash`, !bcvGana);

  c.addSpacer(10);

  // Diferencia en dólares y bolívares (debajo de la flecha)
  const dif = c.addText(
    `Diferencia: ${fmt(diferencia)}$ · Bs. ${fmt(difBs)} a favor de ${bcvGana ? "BCV" : "Cash"}`,
  );
  dif.font = Font.boldSystemFont(12);
  dif.textColor = VERDE;

  c.addSpacer(4);
  const tasas = c.addText(`Oficial Bs.${fmt(oficial)} · Paralelo Bs.${fmt(paralelo)}`);
  tasas.font = Font.systemFont(9);
  tasas.textColor = GRIS_OSCURO;

  return w;
}

// Texto de resultado para mostrar rápido (usado por el Atajo)
function textoComparacion(datos, bcv, cash) {
  const { oficial, paralelo } = datos;
  const costoBCV = bcv * (oficial / paralelo);
  const costoCash = cash;
  const bcvGana = costoBCV < costoCash;
  const difUSD = Math.abs(costoBCV - costoCash);
  // Equivalentes en bolívares
  const bcvBs = bcv * oficial; // lo que te cobra el vendedor
  const cashBs = cash * paralelo; // valor de esos dólares cash
  const difBs = Math.abs(bcvBs - cashBs);
  return (
    `BCV  ${fmt(bcv)}$  =  ${fmt(costoBCV)}$ cash  ·  Bs. ${fmt(bcvBs)}\n` +
    `Cash ${fmt(cash)}$  =  ${fmt(costoCash)}$ cash  ·  Bs. ${fmt(cashBs)}\n\n` +
    `🟢 Conviene pagar en: ${bcvGana ? "BCV" : "CASH"}\n` +
    `Diferencia: ${fmt(difUSD)}$  (Bs. ${fmt(difBs)}) a favor`
  );
}

// ===================== Flujo principal =====================
const datos = await obtenerDatos();

// Llamado desde un Atajo (Shortcut): recibe "bcv|cash", calcula y devuelve el
// texto del resultado para mostrarlo como ventanita en la pantalla de inicio.
// El valor puede llegar como shortcutParameter o como texto plano, según cómo
// se configure la acción "Ejecutar script", así que probamos ambos.
let entradaAtajo = args.shortcutParameter;
if (entradaAtajo == null && args.plainTexts && args.plainTexts.length > 0) {
  entradaAtajo = args.plainTexts.join("");
}
const llamadoDesdeAtajo = entradaAtajo != null;
if (llamadoDesdeAtajo) {
  const partes = String(entradaAtajo).split("|");
  const bcv = parseFloat((partes[0] || "").replace(",", "."));
  const cash = parseFloat((partes[1] || "").replace(",", "."));
  const resultado =
    isNaN(bcv) || isNaN(cash)
      ? `Montos inválidos. Recibí: "${entradaAtajo}". Deben ser dos números separados por |`
      : textoComparacion(datos, bcv, cash);
  Script.setShortcutOutput(resultado);
  Script.complete();
}

// Si NO vino del Atajo, se comporta como widget / vista en la app.
if (!llamadoDesdeAtajo) {
  // Si abriste el script tocando el widget (corre dentro de la app), pide los montos
  // y calcula solo en ese momento. No se guarda ni se recuerda nada.
  let montos = { bcv: null, cash: null };
  if (config.runsInApp) {
    const nuevos = await pedirMontos();
    if (nuevos) montos = nuevos;
  }

  const family = config.widgetFamily; // "small", "medium", "large" o null

  let widget;
  if (family === "small") {
    widget = crearWidgetPequeno(datos);
  } else {
    widget = crearWidgetMediano(datos, montos);
  }

  // Al tocar el widget, abrir el Atajo (ventanitas en la pantalla de inicio)
  // en lugar de abrir la app de Scriptable. En el pequeño basta con widget.url;
  // en el mediano el enlace ya va en el stack interno (ver crearWidgetMediano).
  widget.url = ATAJO_URL;

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
}
