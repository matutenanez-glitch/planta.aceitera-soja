# Gestión Aceitera — Gestión de plantas aceiteras de soja

App de escritorio para registrar la operación diaria de una planta aceitera:
recepción de camiones, despacho de expeller, retiro de aceite, secadora, producción por turnos,
aceite por día y turno, estado de equipos, mantenimiento, stock de repuestos y resumen por día y por mes.
Todos los registros se pueden editar y borrar.

Funciona **sin internet** y guarda los datos **en la PC donde se usa**. Si el dueño ingresa con su cuenta (opcional), todas las PCs de la planta guardan además una **copia en la nube** y comparten los datos (ver [docs/nube-firebase.md](docs/nube-firebase.md)).

## Cómo usarla

1. Abrí `app/index.html` con doble clic. Usá **Chrome o Edge actualizados**: los estilos necesitan Chrome/Edge 111 o posterior.
2. Usá siempre **el mismo navegador y el mismo usuario de Windows**: los datos quedan guardados en ese navegador.
3. Hacé un **backup** con el botón **Exportar** (abajo a la izquierda) al menos una vez por semana y guardalo fuera de la PC. La app avisa en ámbar cuando pasaron 7 días.
4. **Modo día / noche:** el botón de arriba a la derecha cambia entre el modo noche (fondo oscuro, el de siempre) y el modo día (fondo claro, para pantallas con mucha luz). Cada PC recuerda el suyo.

**Un solo archivo.** Con `node scripts/empaquetar.mjs` se arma `dist/gestion-aceitera-v<versión>.html`, con todo adentro. Sirve para pasar la app por pendrive, correo o WhatsApp: se abre con doble clic, sin descomprimir nada, y funciona igual que la carpeta `app/`.

**Versión de prueba para un cliente.** Con `node scripts/empaquetar.mjs --prueba` se arma `dist/gestion-aceitera-v<versión>-prueba.html`. Opcionalmente se agregan `--whatsapp=549…` y `--correo=…`, que es adonde llegan las sugerencias. La versión de prueba:
- trae datos de ejemplo y una bienvenida que explica cómo probar;
- tiene en el encabezado el cartel **Versión de prueba** y dos botones:
    - **Sugerencia** abre WhatsApp o el correo con el mensaje listo (dice en qué pantalla estaba el cliente), o lo copia;
    - **Datos de prueba** sirve para **empezar de cero** o **volver a cargar el ejemplo**;
- guarda todo aparte (`prueba:` delante de cada clave): lo que se cargue al probar no aparece en la versión final, aunque se abra en el mismo navegador.

Sin `--whatsapp` ni `--correo`, el cliente elige a quién mandar la sugerencia. Lo que suma la versión de prueba está en `prueba/`.

**Versión de prueba con link.** Con `node scripts/prueba-web.mjs` (acepta las mismas `--whatsapp=` y `--correo=`) se arma la misma versión de prueba como carpeta web, en `dist/prueba-web/`. Se sube la carpeta entera a una página (`index.html` es la entrada) y al cliente se le pasa el link: la abre en el navegador de su computadora, sin instalar nada. Lo que cargue queda en **su** navegador, aparte de la versión final.

**Página de prueba dentro de Claude.** `node scripts/prueba-web.mjs --claude --salida=dist/prueba-claude` arma la versión de prueba para publicarla como página de Claude (claude.ai/artifact/…). Ahí el navegador no deja descargar directo, así que el PDF y el backup se descargan con las descargas de Claude (`prueba/descargas-claude.js`; la página se publica con la capacidad `downloads`). Fuera de Claude ese archivo no cambia nada.

**Publicada en internet (Vercel).** El repositorio está listo para [Vercel](https://vercel.com): `vercel.json` le dice que corra `node scripts/web.mjs` (no instala nada) y publique `dist/web/`. Queda:
- **https://plantaaceitera-soja.vercel.app/**: la app, para usarla de verdad;
- **https://plantaaceitera-soja.vercel.app/prueba/**: la versión de prueba, con datos de ejemplo y "Sugerencia".

Cada una guarda sus datos aparte, en el navegador de quien la usa. Cada vez que se sube un cambio a GitHub, Vercel publica la versión nueva sola. Para armar lo mismo en la PC: `node scripts/web.mjs` (queda en `dist/web/`).

Para conectarlo la primera vez: en Vercel, **Add New… → Project**, importar el repositorio y tocar **Deploy** (la configuración ya está en `vercel.json`). En este proyecto, Vercel publica como versión principal la rama `reestructura-soyacore-v2.9` (**Settings → Environments → Production → Branch Tracking**; antes era `main`, que tiene la versión vieja y daba 404).

> **Si venís de la v2.8:** abrí la versión nueva en el mismo navegador donde usabas la versión anterior y los datos aparecen solos (se usan las mismas claves `soya_*`). La v2.8 también sigue pudiendo leerlos.

## Estructura del proyecto

```
app/                     ← la aplicación (esto es lo que se instala en la planta)
  index.html             estructura de la página (sin estilos ni lógica adentro)
  css/styles.css         estilos GENERADOS (no editar a mano)
  js/config.js           ← datos de la planta: equipos, turnos, versión
  js/tema.js             modo día / noche (se carga antes de dibujar, para que no parpadee)
  js/icons.js            íconos (Lucide) incluidos localmente
  js/ui.js               utilidades de pantalla: formato, tablas, avisos
  js/turnos.js           turnos y día de producción (a qué día pertenece cada cierre)
  js/planta.js           equipos por lugar (y reconocer los nombres viejos)
  js/store.js            guardado de datos, edición, migración y backup
  js/nube.js             copia en la nube con Firebase (opcional, sin librerías)
  js/pdf.js              generador de PDF mínimo (sin librerías)
  js/comprobantes.js     comprobante de pesada e informe por empresa (PDF, WhatsApp, correo)
  js/cuenta.js           pantalla de la cuenta del dueño y estado de la nube
  js/graficos.js         gráficos de columnas y de línea en SVG (sin librerías)
  js/views/*.js          una vista por archivo (recepción, secadora, aceite…)
  js/app.js              arranque y navegación
src/styles.css           ← fuente de los estilos (Tailwind CSS v4)
scripts/build-css.mjs    compila src/styles.css → app/css/styles.css
scripts/empaquetar.mjs   arma la app en un solo archivo HTML (dist/); con --prueba, la versión de prueba
scripts/prueba-web.mjs   arma la versión de prueba como carpeta web (dist/prueba-web/), para pasarla con un link
scripts/web.mjs          arma el sitio para Vercel (dist/web/): la app en / y la versión de prueba en /prueba/
vercel.json              configuración de Vercel (build sin instalar nada, publica dist/web/)
prueba/                  solo para la versión de prueba y la vista previa: datos de ejemplo, cartel,
                         sugerencias, datos aparte y nube simulada
scripts/sincronizar_github.bat   sube los cambios a GitHub (Windows)
firebase/firestore.rules         reglas de la base en la nube (cada dueño ve solo lo suyo)
docs/nube-firebase.md            cómo poner en marcha la copia en la nube
archivo/                 versiones anteriores y el circuito de tanques (en pausa), solo como referencia
```

## Recepción y secadora

- **Una ficha por camión, con sus viajes como escalones.** En cada viaje el camión pasa dos veces por la balanza: lleno (**bruto**) y vacío (**tara**), en cualquier orden.
    1. Llega un camión: en **Nuevo camión** se cargan empresa, chofer, patente, carga y el peso que se tenga (bruto o tara; con uno alcanza). Aparece su ficha en **"Camiones en planta"**, con su número y su color, así no se confunde con otros camiones del día.
    2. Cada vez que vuelve a la balanza, se escribe el peso que falta **ahí mismo, en su viaje** (sin ventanas) y se toca **Guardar** (o Enter). La humedad es opcional.
    3. Si vuelve a cargar, **+ Agregar viaje** suma otro escalón con su bruto y su tara (cada viaje tiene su propia tara). No se puede agregar otro mientras un viaje espera un peso.
    4. Después del último viaje, **Terminar** (pide un segundo toque) cierra la ficha y saca **un solo PDF con todos los viajes**: hora, bruto, tara, neto y humedad de cada uno, y el **neto total**. No se puede terminar con un viaje sin completar.
    - Las fichas terminadas quedan en **Terminados hoy**, con **PDF** y **Reabrir** (por si el camión vuelve).
    - Cada ficha es de un solo camión: sus viajes no se mezclan con los de otro, aunque sea de la misma empresa o tenga el mismo chofer. Un camión que se registra de nuevo después de terminar es una ficha nueva (o se usa **Reabrir**).
    - Cada viaje queda como un ingreso propio (en la tabla dice "viaje 2 de 3"), así los totales del día, la secadora, el resumen y el informe por empresa cuentan cada carga. Mientras falta un peso, el viaje no suma.
    - En la tabla, el ícono de balanza de un viaje que espera un peso lleva al casillero de su ficha.
- **Humedad.** Se anota la humedad del camión (muestra de laboratorio) si se tomó: es **opcional**. El promedio del día se calcula con los camiones que la tienen.
- **Soja ingresada en el día.** Arriba se ven la cantidad de camiones, los kg y la humedad promedio, ponderada por los kg de cada camión.
- **Comprobante de pesada en PDF.** Está en el ícono de documento de cada fila, o en el aviso después de cargar la tara. Si el camión hizo varios viajes ese día, es uno solo con todos los viajes (desde la fila de cualquiera de ellos). Trae empresa, chofer, patente, carga, humedad, bruto y tara con fecha y hora, neto y lugar para las firmas. Se puede:
    - **Descargar**;
    - **Compartir**, si la PC lo permite;
    - abrir **WhatsApp** o el **correo** con los datos escritos. En ese caso el PDF se descarga para adjuntarlo.
- **Informe por empresa en PDF.** Está en el botón de la tabla. Lista los camiones de una empresa (o de todas) en un período, con el total de kg y la humedad promedio. Si son muchos, ocupa varias páginas.
- **Datos de la planta.** El nombre, el CUIT, la dirección y el teléfono que salen en los PDF se completan una vez y quedan guardados en esa PC.
- **Los PDF se generan en la PC** (`app/js/pdf.js`), sin internet y sin librerías externas.
- **Soja para secar:** arriba de la Secadora se ve la soja que entró hoy en los camiones (los mismos kg que en Recepción): kg, camiones y humedad de ingreso, con el detalle de cada camión. Abajo dice cuánto entró ayer, y avisa si hay camiones de soja en planta esperando la tara (sus kg se suman al cargarla).
- **Secadora:** la soja que pasa por la secadora ya está mezclada en el silo, así que las tomas no son de ningún camión. Cada toma registra la humedad **en caliente** y **en frío**. Arriba se ven las tomas del día, sus promedios y la hora de la última.
- **Datos anteriores a la 2.18:** las tomas viejas de la secadora conservan la empresa y la humedad del camión que tenían. En el resumen de esos días, la humedad de ingreso sale de esos datos.

## Cierre de turno

- El día va de **00:00 a 24:00** y se completa con 3 turnos: **Turno 1** (00 a 08), **Turno 2** (08 a 16) y **Turno 3** (16 a 00).
- Cada turno tiene **un solo cierre** con su operador. La app no deja cargar dos veces el mismo turno del mismo día y ofrece **Editarlo**.
- El formulario propone automáticamente el **día y el turno** que corresponde cargar según la hora. Por ejemplo, el Turno 3 que se carga a las 00:05 queda en el día anterior.
- El aceite se carga con los botones **1 tanque** o **2 tanques** (1 tanque = 1.525 L). En un turno se pasan hasta 2 tanques, así que la app no acepta más de 3.050 L. Si no fue un tanque entero, se escriben los litros a mano.
- **Turnos sin cargar:** arriba de la pantalla aparecen los turnos de los últimos 30 días que no tienen cierre.
    - **Cargar** abre el formulario con ese día y ese turno ya puestos. El cierre queda guardado en el día del turno, aunque se cargue días después (por ejemplo, el del martes cargado el jueves), y no cambia ningún otro día.
    - **No se trabajó** marca que ese turno no tuvo producción (parada, feriado). Se puede deshacer. Si después se carga, se edita y pasa a ser un cierre normal.

## Aceite por día y turno

Sale de los cierres de turno:

- **Hoy:** los 3 turnos del día. Cada uno aparece como *Cargado* (con litros, tanques y operador), *En curso*, *Más tarde*, *Falta cargar* o *No se trabajó*.
- **Totales del período** (7 días, 30 días, este mes o el anterior): aceite total, promedio por día y por turno, y cuántos turnos faltan cargar.
- **Día por día:** una fila por día con los 3 turnos, el total del día y su estado (*Completo*, *Falta 1 turno*, *No se trabajó*, *Sin producción*). Al tocar **Falta cargar** se abre el formulario con ese día y ese turno ya puestos. Un cierre cargado tarde lo indica ("Cargado el jue 08/10").

Se produce de **lunes a viernes**. La semana arranca el lunes a las 00:00 con el Turno 1, y el viernes la producción corta a las 22:00. En esos días, un turno terminado sin cierre aparece como *Falta cargar*, desde el primer cierre cargado en la app. Sábados y domingos quedan en gris, salvo que se cargue algún turno: en ese caso, ese día también se controla.

## Retiro de aceite

El aceite no lo despacha la planta: lo retira con su camión la empresa que lo compra. El camión se pesa en la balanza: **bruto − tara = neto**, y se guarda y se muestra **en kg**. Solo como referencia aparece entre paréntesis a cuántos litros equivale (densidad 0,92 kg/L, en `config.js` → `densidadAceite`); no se guarda ninguna conversión.

> El cálculo del circuito de tanques (interiores, exteriores y grandes) quedó **en pausa** en `archivo/circuito-aceite/`, con sus pruebas, para retomarlo cuando estén las capacidades de los tanques grandes.

## Equipos y mantenimiento

Los equipos están ordenados por **lugar**, cada uno con su nombre (en `config.js` → `lugares`):

- **Línea 1** y **Línea 2**, cada una con:
    - las prensas: Prensa 1 a 4 en la Línea 1 y Prensa 5 a 8 en la Línea 2;
    - las cajas reductoras: alimentador dosificador, dosificador prensa, chimango receptor, elevador expeller, borrero y chimango aceite;
    - el extrusor/dosificador de la línea y su caja reductora;
    - la bomba batea.
- **Tolva de producción:** su caja reductora.
- **Tanques de aceite:** cajas reductoras T1 y T2, decantador, bomba aceite y bomba goma.
- **Exteriores:** bomba externa y bomba extracción de aceite.

**Mantenimientos** tiene tres partes:

1. **Mantenimiento de la semana:** un tilde por equipo, agrupado por lugar, para marcar a qué equipos se les hizo el mantenimiento.
    - Cada lugar muestra cuántos van ("9 de 13") y tiene un botón **Tildar todos**.
    - Las flechas pasan a semanas anteriores, por si algo quedó sin tildar. Un tilde en una semana pasada queda con fecha del sábado de esa semana.
    - Un equipo queda tildado si tiene cualquier mantenimiento cargado esa semana (de lunes a domingo).
    - Destildar borra el tilde. Si el equipo tiene cargado lo que se usó, se borra desde el historial.
    - El tilde no cambia cómo quedó el equipo: un equipo fuera de servicio sigue así hasta que se cargue que quedó operativo.
2. **Qué se usó:** con los botones **Aceite**, **Grasa** y **Repuesto** se agrega lo que se usó. Hay dos formas:
    - **Todo el mantenimiento** (la de siempre): lo que se usó en el mantenimiento, **todo junto, sin elegir equipo por equipo** (son unos 35). Los repuestos aparecen agrupados por para qué son (prensas, cajas reductoras, bombas…). No tilda ningún equipo: eso se hace con los tildes.
    - **Un equipo**: para algo puntual (por ejemplo, un cambio de crapodinas en la Prensa 3). Se eligen el lugar, el equipo y cómo quedó, y el equipo queda tildado en la semana.
    - Debajo de los tildes, **Repuestos usados en la semana** suma todo lo usado, con un botón para anotar los repuestos del mantenimiento.
    - Cada botón ofrece solo lo del stock que corresponde (aceites, grasas o repuestos; de los repuestos, primero los del tipo del equipo).
    - Se pone la cantidad en litros, kg o unidades, y se ve cuánto va a quedar.
    - Al guardar se descuenta solo del stock (y, en **Un equipo**, el equipo queda tildado en la semana).
    - **Otros** es para lo que no está en el stock.
    - **Qué se hizo** es opcional (por ejemplo, "cambio de crapodinas"). En **Un equipo** también se carga **cómo quedó** el equipo.
3. **Historial:** todos los mantenimientos, para corregir o borrar. Los tildes de la semana se muestran solo si se pide.

**Estado de equipos.** Hay un panel por lugar, con un pantallazo de cómo está:
- cuántos equipos quedaron *Operativos*, *Con observaciones* o *Fuera de servicio*, y cuántos no tienen registros;
- cuándo fue su último mantenimiento;
- equipo por equipo, lo último que se le hizo y hace cuánto.

Cada lugar muestra también cuántos equipos tienen el mantenimiento de **esta semana** hecho, y cada equipo dice "Hecho" (con el día) o "Pendiente". Al tocar un equipo se ve su historial y se puede registrar lo que se usó.

**Mantenimientos anteriores a la 2.21:**
- Prensa 1 a 4 quedan en la Línea 1 y Prensa 5 a 8 en la Línea 2, con su historial.
- Los extrusores de cada línea y los agitadores de los tanques también se reconocen solos.
- Los equipos viejos que no tienen equivalencia (reductores "L1 - Reductor N", "Bomba N") aparecen en **Otros**, con su historial.
- Al editar uno de esos registros, se puede pasar al equipo que corresponde.
- El panel **Para el sábado** junta los equipos con observaciones o fuera de servicio, y los que llevan más tiempo sin mantenimiento. La producción suele cortar el viernes a las 22:00 y el mantenimiento se hace el sábado.

## Stock de repuestos

Piezas y repuestos para prensas, cajas reductoras, extrusores y bombas, **aceites**, **grasas** y cosas generales (herramientas). Los aceites y las grasas son los que ofrecen los botones **Aceite** y **Grasa** de Mantenimientos: al cargarlos, se cuentan en litros y kg. Los aceites y grasas que estaban en "General" (su nombre empieza con "Aceite" o "Grasa") pasan solos a su categoría.

- **Agregar un repuesto nuevo:** con el botón **Agregar repuesto**, arriba de la lista, se abre una ventana para cargarlo. El lápiz de cada fila abre la misma ventana para corregirlo.
- **Cada repuesto** tiene nombre, para qué tipo de equipo es, código y ubicación (opcionales), en qué se cuenta (unidades, juegos, litros, kg o metros), la cantidad que hay y un **mínimo**.
- **Aviso cuando se está por agotar.** Cuando la cantidad llega al mínimo, el repuesto pasa a **Reponer**. Si no queda ninguno, pasa a **Sin stock**. Se avisa así:
    - en el menú, al lado de **Stock de Repuestos**, con la cantidad de repuestos para reponer (en rojo si alguno está sin stock);
    - en el panel **Para reponer**, arriba del stock, con el botón **Cargar compra**;
    - con un aviso al guardar un mantenimiento o una salida que deja un repuesto en el mínimo.
- **Cambiar la cantidad.** Con el botón de flechas de cada fila:
    - **Entró (compra)** suma;
    - **Salió** resta, y no deja sacar más de lo que hay;
    - **Contamos** pone lo que se contó en el depósito y anota la diferencia.

  También se puede corregir desde **Editar**. Cada repuesto tiene su historial de movimientos, con los mantenimientos en que se usó.
- **Descuento automático desde Mantenimientos.** En **Qué se usó** se elige lo que se usó y cuánto. Al guardar se descuenta solo. Si se corrige o se borra el mantenimiento, el stock se acomoda solo. Lo que no está en el stock se escribe en **Otros**.
- **Más de lo que figura.** Si se usó más de lo que figura en el stock, el mantenimiento se guarda igual (el repuesto se usó). El stock queda en negativo, con aviso, hasta que se corrija con **Contamos**.
- **Cómo se calcula la cantidad.** No se guarda en el repuesto: se calcula con sus movimientos (cantidad inicial, compras, salidas y conteos) menos lo usado en los mantenimientos. Así, dos PCs que cargan a la vez no se pisan.
- **Stock del sistema anterior.** Si la PC tiene el stock de la v2.5 (`soyacore_stock`) y el stock nuevo está vacío, se pasa solo, una vez.

## Resumen

- **Por mes:** totales con la variación contra el mes anterior, gráficos por día (soja, aceite y expeller) y la tabla día por día.
- **Por día:** turnos (con su operador), camiones, secadora y mantenimientos de ese día.
- Al tocar un día, en la tabla o en un gráfico, se abre su detalle.

## Copia en la nube (cuenta del dueño)

Es **opcional** y hay **una sola cuenta por planta**, la del dueño. La pone solo el dueño, una vez en cada PC, desde **Copia en la nube** (abajo a la izquierda). Los operarios no necesitan cuenta: cargan como siempre y todo se guarda en la cuenta del dueño.

- **Crear cuenta** o **Ingresar** con correo y contraseña. También hay **Olvidé mi contraseña**.
- **Cerrar sesión** pide la contraseña del dueño, así un operario no puede desvincular la PC. Para confirmarla hace falta internet.
- Con la cuenta, cada PC de la planta sigue guardando todo en la PC y **funciona sin internet**. Cuando hay conexión, sube lo que se cargó y baja lo que cargaron las otras PCs. Lo hace sola: a los 3 segundos de cada cambio, cada 2 minutos y cuando vuelve internet.
- Si el mismo registro se cambió en dos PCs, queda el cambio más nuevo.
- En la nube **no se borra nada**: lo borrado queda guardado como borrado.
- El panel muestra si está **al día**, si hay **cambios sin subir** o si está **sin conexión**.

Para activarla, hay que crear el proyecto de Firebase y completar `firebase` en `app/js/config.js`. Los pasos están en [docs/nube-firebase.md](docs/nube-firebase.md). Mientras esté vacío, la app funciona solo en la PC.

## Editar y borrar registros

Cada fila tiene un lápiz (editar) y un tacho (borrar).

- **Editar** carga el registro en el formulario de la izquierda y permite corregir también la fecha y la hora. El registro queda marcado con la fecha de edición.
- **Borrar** pide un segundo clic para confirmar y ofrece **Deshacer** durante unos segundos.

## Cambios habituales

| Quiero…                                    | Dónde                                                           |
|--------------------------------------------|-----------------------------------------------------------------|
| Agregar o renombrar un equipo o un lugar   | `app/js/config.js` → `lugares` (el `id` de un equipo no se cambia) |
| Cambiar turnos                             | `app/js/config.js` → `turnos`                                   |
| Cambiar los litros de un tanque            | `app/js/config.js` → `litrosPorTanque`                          |
| Cambiar el máximo de tanques por turno     | `app/js/config.js` → `maxTanquesPorTurno`                       |
| Cambiar los días en que se produce         | `app/js/config.js` → `diasProduccion`                           |
| Agregar una categoría o unidad de stock    | `app/js/config.js` → `stock`                                    |
| Cambiar el color de marca                  | `src/styles.css` → `@theme` y después `npm run build:css`        |
| Agregar un ícono                           | `app/js/icons.js` (ver instrucciones al principio del archivo)  |
| Subir la versión                           | `app/js/config.js` → `version` (y `package.json`)               |

### Si cambiás clases de Tailwind en el HTML o el JS

El CSS se genera solo con las clases que se usan. Si agregás una clase nueva, recompilá:

```bash
npm install          # la primera vez (requiere Node 20+)
npm run build:css    # compila una vez
npm run watch:css    # recompila solo cada vez que guardás
npm test             # prueba el cálculo del circuito de tanques (archivado)
```

`scripts/sincronizar_github.bat` recompila automáticamente antes de subir si encuentra `node_modules`.

> Las clases son de **Tailwind v4**. Si pegás código generado por una IA, pedile que use Tailwind v4,
> sin CDN, y que no ponga `onclick` ni `<script>` dentro del HTML.

## Reglas del código

- **Nombres internos.** La app se llama **Gestión Aceitera** (hasta la 2.16 se llamaba SoyaCore OS). En el código siguen el espacio de nombres `SoyaCore` y las claves `soya_*` del navegador: así no se pierden los datos ya cargados ni los backups anteriores.
- **Nada de internet, salvo la nube.** No se cargan scripts, fuentes ni estilos externos. La política de seguridad (CSP) de `index.html` solo permite conectarse a los tres dominios de Firebase.
- **Nada de `innerHTML` con datos del usuario.** Usar `SoyaCore.ui.el(...)` o `textContent`. Así, un texto como `Pérez <Hnos> & Cía` se muestra tal cual y no se puede inyectar código.
- **Nada de `onclick=` en el HTML.** Los eventos se conectan en el `init()` de cada vista.
- **Versiones con git, no con copias.** Nada de `archivo (1).html`: cada cambio va en un commit, y cada versión entregada lleva un tag (`git tag v2.9.0`).

## Limitaciones conocidas (decisiones pendientes)

1. **Circuito de tanques en pausa:** falta la capacidad de los tanques grandes (se miden con manguera de nivel).
2. **Feriados y paradas:** la app no los conoce. Un día hábil sin producción aparece con turnos faltantes hasta que se marca **No se trabajó**.
3. **Datos en el navegador:** sin la cuenta, si se borran los datos de navegación se pierde todo lo que no esté en un backup. Con la cuenta, se recupera de la nube al volver a ingresar.
4. **Copia en la nube sin probar con un proyecto real:** las pruebas automáticas usan un Firebase simulado.

## Historial

- **2.27.1**: **Resumen del mes:** los gráficos (soja, aceite, expeller) quedan **dentro de su recuadro** en cualquier pantalla: miden el ancho real del recuadro, el margen de los números se ajusta solo y las fechas de abajo no se pisan.
- **2.27.0**: **Mantenimientos:** los repuestos, el aceite y la grasa del mantenimiento se cargan **todos juntos** ("Todo el mantenimiento"), sin elegir equipo por equipo; salen del stock y no tildan equipos. "Un equipo" queda para algo puntual. Debajo de los tildes, **Repuestos usados en la semana**.
- **2.26.0**: Recepción con **una ficha por camión**: los viajes son escalones con su bruto y su tara (cada viaje con su propia tara), se escriben ahí mismo sin ventanas, **+ Agregar viaje** suma otro, y **Terminar** cierra la ficha y saca **un solo PDF con todos los viajes**. Cada ficha es de un camión: los viajes se atan a su ficha y no se mezclan con los de otros camiones del día. Se sacan "Otro viaje" (la flecha), las ventanas de tara y "Usar esa tara".
- **Publicación en Vercel** (`vercel.json`, `scripts/web.mjs`): la app en `/` y la versión de prueba en `/prueba/`, desde GitHub.
- **2.25.1**: Recepción más simple. Cada viaje se pesa lleno y vacío **en cualquier orden** (se puede empezar por la tara) y se guarda con un solo peso: el otro se completa en **"Camiones de hoy"**. La flecha **Otro viaje** carga el viaje siguiente del mismo camión, **sin tara obligatoria** (con **Usar la tara anterior**). Se sacan "Va a volver hoy" y "Terminar" de la 2.25.0: el comprobante con todos los viajes está siempre en **Comprobante**.
- **2.25.0**: **camión de varios viajes**. Con **Va a volver hoy** el camión no se cierra: queda en "Camiones en curso" con **+ Otro viaje** (solo el bruto, con la misma tara) y **Terminar**. Al terminar sale **un solo comprobante con todos los viajes** y el neto total. La **humedad pasa a ser opcional**. Se sacan los botones de "¿Volvió un camión de hoy?" (los reemplaza "+ Otro viaje").
- **2.24.2**: todo se ve nítido: los paneles tienen fondo sólido (antes eran semitransparentes, con el fondo desenfocado), al abrir un diálogo la página de atrás solo se oscurece (antes se desenfocaba) y los números grandes y botones ya no tienen brillo difuso.
- **2.24.1**: la "Extrusora tanques" pasa a llamarse **Decantador** (con su propio tipo, también en el stock); su historial sigue igual.
- **2.24.0**:
  - **Modo día / noche**, con el botón de arriba a la derecha (cada PC recuerda el suyo).
  - **Recepción:** un camión que vuelve en el día usa la tara que ya tiene (**¿Volvió un camión de hoy?**, **Usar esa tara** y la tara puesta en **Cargar tara**).
  - **Versión de prueba con link** (`scripts/prueba-web.mjs`).
- **2.23.0**:
  - **Mantenimientos más simple:** un tilde por equipo para marcar el mantenimiento de la semana (por lugar, con "Tildar todos" y semanas anteriores), y un apartado **Qué se usó** con botones **Aceite**, **Grasa** y **Repuesto** que salen del stock.
  - Estado de equipos muestra lo hecho esta semana.
  - El stock suma las categorías **Aceites** y **Grasas**.
  - **Versión de prueba** para clientes (`empaquetar.mjs --prueba`).
- **2.22.0**: la Secadora muestra la **soja para secar**: los kg que entraron hoy en los camiones, con su humedad, el detalle por camión, lo de ayer y los camiones que esperan la tara.
- **2.21.1**: las prensas vuelven a llamarse Prensa 1 a 8 (en la 2.21.0 figuraron por error como "extrusoras"); lo cargado con esos nombres, también en el stock, pasa solo a la prensa que corresponde. Cada línea tiene su extrusor/dosificador.
- **2.21.0**: equipos por lugar, con sus nombres (Línea 1, Línea 2, Tolva de producción, Tanques de aceite y Exteriores). Mantenimientos se cargan eligiendo lugar y equipo. Estado de equipos muestra un panel por lugar con el resumen y lo último de cada equipo.
- **2.20.1**: botón **Agregar repuesto** bien a la vista en Stock, que abre el formulario en una ventana. La lista de repuestos ocupa todo el ancho y suma la columna Ubicación.
- **2.20.0**:
  - Nueva sección **Stock de Repuestos**, con alertas cuando un repuesto llega al mínimo o se termina, y entradas, salidas y conteos con historial.
  - Los repuestos del stock que se usan en un **mantenimiento** se descuentan solos (y vuelven si se corrige o se borra el registro).
  - Copia en la nube: si se actualiza la app pero falta publicar las reglas nuevas, el panel lo avisa y lo nuevo queda guardado en la PC hasta publicarlas. Lo demás se sigue copiando.
- **2.19.0**:
  - Recepción en dos pasos: primero el bruto y después la tara, con la lista de camiones en planta esperando la tara. Se agrega la patente.
  - Comprobante de pesada e informe por empresa en PDF, para descargar o compartir por WhatsApp o correo.
- **2.18.0**:
  - La **humedad de cada camión** pasa a **Recepción**, donde se ve el total y la humedad promedio del día.
  - La **secadora** queda solo con las tomas de la soja ya mezclada: humedad en caliente y en frío, sin empresa ni camión.
  - El resumen toma la humedad de ingreso de los camiones.
- **2.17.0**:
  - La app pasa a llamarse **Gestión Aceitera**.
  - "Venta de aceite" pasa a llamarse **Retiro de aceite**.
  - Los backups nuevos se llaman `gestion_aceitera_backup_….json`. Los anteriores se siguen importando.
- **2.16.1**: cerrar la sesión pide la contraseña del dueño. Los textos aclaran que los operarios no necesitan cuenta.
- **2.16.0**:
  - **Cuenta del dueño** (correo y contraseña) y **copia en la nube** con Firebase, opcional. Las PCs de la planta comparten los datos y cada una sigue funcionando sin internet.
  - Reglas de Firestore: cada cuenta ve solo lo suyo, nada se borra y no se puede pisar una versión con otra más vieja.
  - Importar un backup con la nube activa reemplaza los datos en todas las PCs, y la app lo avisa antes.
- **2.15.0**:
  - "Despacho de aceite" pasa a llamarse **Venta de aceite**: la empresa compradora lo retira con su camión.
  - Cierre de turno con botones de 1 y 2 tanques. No acepta más de 2 tanques por turno.
  - Se produce de lunes a viernes. Un turno terminado sin cierre en esos días aparece como faltante.
  - Lista de **turnos sin cargar** en Producción. Un turno olvidado se carga días después en su día, y lo que no se trabajó se marca **No se trabajó**.
- **2.14.0**:
  - Los turnos pasan a ser 1 (00–08), 2 (08–16) y 3 (16–00), y el día va de 00:00 a 24:00. Los registros anteriores se renombran solos según su horario.
  - El cierre de turno guarda el día del turno, tiene botones de tanques (1.525 L) y no deja cargar dos veces el mismo turno.
  - La pantalla de aceite pasa a ser **Aceite por día y turno**: hoy, totales y día por día, con los turnos que faltan cargar.
  - En el resumen, los cierres cuentan en el día del turno.
  - Estado de equipos: "hace N días" cuenta días de calendario.
- **2.13.0**:
  - Pantalla nueva **Aceite por operador y turno**. El cierre de turno pide el operador.
  - El despacho de aceite se guarda y se muestra solo en kg de balanza (litros aproximados entre paréntesis).
  - El circuito de tanques se saca de la app y queda archivado.
  - 2 extrusores, uno por línea.
- **2.12.0**:
  - El despacho de aceite se carga con bruto y tara de balanza. Se guarda el neto en kg y su equivalente en litros.
  - Los exteriores pasan a 6.862 L útiles (4 ½ interiores), por el residuo del cono.
- **2.11.0**:
  - El aceite se muestra como balance (había + producido − despachado = queda), con gráficos por día.
  - Pantalla nueva **Estado de Equipos**, con tarjetas por equipo, historial y pendientes para el sábado.
  - Los mantenimientos registran cómo quedó el equipo.
  - Se agregan 4 bombas.
  - El resumen se divide en **por mes** (con comparación y gráficos) y **por día**.
- **2.10.0**:
  - Circuito de aceite calculado con las reglas reales de la planta: interiores alternados con reposo, exteriores en ronda y vaciado de a uno a los tanques grandes.
  - Despacho de aceite, para registrar los camiones que vacían los tanques grandes.
  - Carga de mediciones reales de los tanques.
  - Editar (incluida la fecha) y borrar registros en todas las secciones, con Deshacer.
  - Los ingresos y despachos ahora guardan también el bruto y la tara.
  - Se quitó el asistente de IA.
- **2.9.0**:
  - Reestructuración completa: HTML semántico, CSS compilado local, JS separado por vista y sin dependencias de internet.
  - Corrige la inyección de código desde los formularios.
  - Corrige que un dato dañado bloqueara toda la app.
  - Corrige que no se guardaran las *observaciones* de mantenimiento.
  - Agrega backup (exportar e importar).
  - Números con formato argentino.
  - Mejora la accesibilidad: etiquetas asociadas, navegación con teclado y anuncios para lectores de pantalla.
- **2.8.0** y anteriores: ver `archivo/`.

---
Íconos: [Lucide](https://lucide.dev) (licencia ISC). Estilos: [Tailwind CSS](https://tailwindcss.com) (licencia MIT).
