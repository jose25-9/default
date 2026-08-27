# Claude Usage · Widget para Scriptable (iOS)

Widget **mediano** que imita el panel de escritorio de límites de uso de Claude:
barras de progreso para la **sesión actual** y el **límite semanal**, porcentajes,
tiempo transcurrido (anillo), tiempo hasta el reinicio y hora de reinicio.

## Instalación

1. Instala la app [Scriptable](https://scriptable.app/) desde la App Store.
2. Crea un script nuevo y pega el contenido de [`claude-usage-widget.js`](./claude-usage-widget.js).
3. **Ejecuta el script una vez dentro de la app** (botón ▶). Aparecerá un menú:
   elige **“Guardar sessionKey”** (y/o **“Guardar sessionKeyV3”**) y pega el
   valor de la cookie. Se almacena **cifrada en el llavero del dispositivo**
   (`Keychain`), no en el código. Con guardar **una** basta para autenticar;
   guardar ambas hace el widget más robusto ante cambios de formato de sesión.
4. Añade un widget **mediano** a la pantalla de inicio, elige el script Scriptable
   y selecciona este script.

## Seguridad

Cumple estos requisitos por diseño:

- **Sin secretos hardcodeados.** Las cookies (`sessionKey` / `sessionKeyV3`)
  nunca aparecen en el código; cada una se guarda y recupera en su propia
  entrada con la clase nativa `Keychain` (cifrado del dispositivo). En cada
  petición se envían solo las que estén presentes.
- **Validación inicial.** Antes de cualquier petición de red se comprueba si
  existe al menos una cookie. Si falta, el widget muestra **“Configuración
  requerida”** y, en la app, ofrece un diálogo para guardarla — nunca crashea
  ni expone datos.
- **Entrada oculta.** La llave se introduce con `addSecureTextField`, de modo que
  no se ve en pantalla mientras se escribe.
- **Sin fugas en consola.** Ningún `console.log` imprime la `sessionKey` ni la
  cabecera `Cookie`/autorización completa. Solo se registran mensajes de estado
  y errores truncados y sin datos sensibles.

## Actualizar o borrar las llaves

Ejecuta el script dentro de la app: el menú permite **actualizar** cada cookie
por separado o **borrar todas** las cookies del llavero en cualquier momento.

## Nota sobre los datos

El script intenta leer el uso desde el endpoint configurado (`USAGE_URL`) usando
tu cookie de sesión y procesa la respuesta de forma tolerante. Si la petición
falla o el formato no coincide, el widget renderiza **datos de muestra** y lo
indica en el pie (`· datos de muestra`), en lugar de fallar. Ajusta `USAGE_URL`
y los nombres de campo en `parseUsage()` según el endpoint real de tu cuenta.
