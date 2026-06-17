// Widget de Scriptable: brecha entre dólar oficial y paralelo (Venezuela)
// Fuente de datos: https://ve.dolarapi.com/v1/dolares
// Fórmula de la brecha: 1 - (oficial / paralelo)

const API_URL = "https://ve.dolarapi.com/v1/dolares";

async function obtenerDatos() {
  const req = new Request(API_URL);
  const data = await req.loadJSON();

  const oficial = data.find((d) => d.fuente === "oficial");
  const paralelo = data.find((d) => d.fuente === "paralelo");

  if (!oficial || !paralelo) {
    throw new Error("No se encontraron las tasas oficial/paralelo en la API");
  }

  return {
    oficial: oficial.promedio,
    paralelo: paralelo.promedio,
  };
}

function calcularBrecha(oficial, paralelo) {
  // 1 - (oficial / paralelo) -> proporción; se multiplica por 100 para el %
  return (1 - oficial / paralelo) * 100;
}

function fmt(n) {
  // Formato con separador de miles y 2 decimales
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function crearWidget() {
  const { oficial, paralelo } = await obtenerDatos();
  const brecha = calcularBrecha(oficial, paralelo);

  const w = new ListWidget();
  w.backgroundColor = new Color("#0d1b2a");
  w.setPadding(16, 16, 16, 16);

  const titulo = w.addText("Brecha cambiaria");
  titulo.font = Font.mediumSystemFont(13);
  titulo.textColor = new Color("#9bb0c1");

  w.addSpacer(6);

  const pct = w.addText(`${fmt(brecha)} %`);
  pct.font = Font.boldSystemFont(28);
  pct.textColor = brecha >= 0 ? new Color("#ff6b6b") : new Color("#51cf66");

  w.addSpacer(8);

  const oficialTxt = w.addText(`Oficial: Bs. ${fmt(oficial)}`);
  oficialTxt.font = Font.systemFont(12);
  oficialTxt.textColor = new Color("#e0e1dd");

  const paraleloTxt = w.addText(`Paralelo: Bs. ${fmt(paralelo)}`);
  paraleloTxt.font = Font.systemFont(12);
  paraleloTxt.textColor = new Color("#e0e1dd");

  w.addSpacer(6);

  const fecha = w.addText(`Act.: ${new Date().toLocaleString("es-VE")}`);
  fecha.font = Font.systemFont(9);
  fecha.textColor = new Color("#6c7a89");

  return w;
}

const widget = await crearWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // Vista previa al ejecutar el script manualmente en la app
  widget.presentSmall();
}

Script.complete();
