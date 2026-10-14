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

> **Si venís de la v2.8:** abrí la versión nueva en el mismo navegador donde usabas la versión anterior y los datos aparecen solos (se usan las mismas claves `soya_*`). La v2.8 también sigue pudiendo leerlos.

## Estructura del proyecto

```
app/                     ← la aplicación (esto es lo que se instala en la planta)
  index.html             estructura de la página (sin estilos ni lógica adentro)
  css/styles.css         estilos GENERADOS (no editar a mano)
  js/config.js           ← datos de la planta: equipos, turnos, versión
  js/icons.js            íconos (Lucide) incluidos localmente
  js/ui.js               utilidades de pantalla: formato, tablas, avisos
  js/turnos.js           turnos y día de producción (a qué día pertenece cada cierre)
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
scripts/sincronizar_github.bat   sube los cambios a GitHub (Windows)
firebase/firestore.rules         reglas de la base en la nube (cada dueño ve solo lo suyo)
docs/nube-firebase.md            cómo poner en marcha la copia en la nube
archivo/                 versiones anteriores y el circuito de tanques (en pausa), solo como referencia
```

## Recepción y secadora

- **Recepción en dos pasos.** Cuando llegan varios camiones juntos, primero se pesan llenos: se carga el **bruto** y se deja la tara vacía. El camión queda en **"En planta, esperando la tara"**. Cuando descarga y se pesa vacío, se toca **Cargar tara**: la app calcula el **neto** y ofrece el comprobante. Mientras falta la tara, el camión no suma a los totales.
- **Humedad.** Si la carga es soja, se anota la humedad del camión (muestra de laboratorio). Es obligatoria cuando se completa la pesada.
- **Soja ingresada en el día.** Arriba se ven la cantidad de camiones, los kg y la humedad promedio, ponderada por los kg de cada camión.
- **Comprobante de pesada en PDF.** Está en el ícono de documento de cada fila, o en el aviso después de cargar la tara. Trae empresa, chofer, patente, carga, humedad, bruto y tara con fecha y hora, neto y lugar para las firmas. Se puede:
    - **Descargar**;
    - **Compartir**, si la PC lo permite;
    - abrir **WhatsApp** o el **correo** con los datos escritos. En ese caso el PDF se descarga para adjuntarlo.
- **Informe por empresa en PDF.** Está en el botón de la tabla. Lista los camiones de una empresa (o de todas) en un período, con el total de kg y la humedad promedio. Si son muchos, ocupa varias páginas.
- **Datos de la planta.** El nombre, el CUIT, la dirección y el teléfono que salen en los PDF se completan una vez y quedan guardados en esa PC.
- **Los PDF se generan en la PC** (`app/js/pdf.js`), sin internet y sin librerías externas.
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

## Estado de equipos

- Hay una tarjeta por equipo: 8 prensas (línea 1: 1 a 4, línea 2: 5 a 8), 2 extrusores (uno por línea), reductores y 4 bombas.
- Cada tarjeta muestra cómo quedó el equipo en su último mantenimiento (*Operativo*, *Con observaciones* o *Fuera de servicio*), qué se hizo y hace cuánto.
- Al tocar una tarjeta se ve el historial y se puede registrar un mantenimiento para ese equipo.
- Si un equipo deja de estar en la lista pero tiene mantenimientos cargados, aparece en el grupo **Otros** para no perder su historial.
- El panel **Para el sábado** junta los equipos con observaciones o fuera de servicio, y los que llevan más tiempo sin mantenimiento. La producción suele cortar el viernes a las 22:00 y el mantenimiento se hace el sábado.

## Stock de repuestos

Piezas y repuestos para prensas, extrusores, reductores y bombas, y cosas generales (lubricantes, herramientas).

- **Cada repuesto** tiene nombre, para qué sector es, código y ubicación (opcionales), en qué se cuenta (unidades, juegos, litros, kg o metros), la cantidad que hay y un **mínimo**.
- **Aviso cuando se está por agotar.** Cuando la cantidad llega al mínimo, el repuesto pasa a **Reponer**. Si no queda ninguno, pasa a **Sin stock**. Se avisa así:
    - en el menú, al lado de **Stock de Repuestos**, con la cantidad de repuestos para reponer (en rojo si alguno está sin stock);
    - en el panel **Para reponer**, arriba del stock, con el botón **Cargar compra**;
    - con un aviso al guardar un mantenimiento o una salida que deja un repuesto en el mínimo.
- **Cambiar la cantidad.** Con el botón de flechas de cada fila:
    - **Entró (compra)** suma;
    - **Salió** resta, y no deja sacar más de lo que hay;
    - **Contamos** pone lo que se contó en el depósito y anota la diferencia.

  También se puede corregir desde **Editar**. Cada repuesto tiene su historial de movimientos, con los mantenimientos en que se usó.
- **Descuento automático desde Mantenimientos.** En el registro de mantenimiento se eligen los **repuestos del stock que se usaron** y cuántos. Al guardar se descuentan solos. Primero aparecen los del sector del equipo, y cada uno dice cuánto hay y cuánto va a quedar. Si se corrige o se borra el mantenimiento, el stock se acomoda solo. Los repuestos que no están en el stock se escriben en **Otros repuestos**.
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
| Agregar una prensa, reductor o extrusor    | `app/js/config.js` → `equipos`                                  |
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
