# SoyaCore OS — Sistema de planta aceitera de soja

App de escritorio para registrar la operación diaria de una planta aceitera:
recepción de camiones, despacho de expeller y de aceite, secadora, producción por turnos,
aceite por operador y turno, estado de equipos, mantenimiento y resumen por día y por mes.
Todos los registros se pueden editar y borrar.

Funciona **sin internet** y guarda los datos **en la PC donde se usa**.

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
  js/store.js            guardado de datos, edición, migración y backup
  js/graficos.js         gráficos de columnas y de línea en SVG (sin librerías)
  js/views/*.js          una vista por archivo (recepción, secadora, aceite…)
  js/app.js              arranque y navegación
src/styles.css           ← fuente de los estilos (Tailwind CSS v4)
scripts/build-css.mjs    compila src/styles.css → app/css/styles.css
scripts/sincronizar_github.bat   sube los cambios a GitHub (Windows)
archivo/                 versiones anteriores y el circuito de tanques (en pausa), solo como referencia
```

## Aceite por operador y turno

Sale de los **cierres de turno** (Producción → Turnos), que ahora piden el **operador**. Para el período elegido (7 días, 30 días, este mes o el anterior) muestra:

- **Totales:** aceite producido, promedio por turno, expeller y aceite despachado.
- **Por operador:** cuántos turnos hizo, cuánto aceite pasó en total y en promedio, y cuánto expeller.
- **Por turno:** cuánto rinde cada franja horaria (T1, T2, T3).
- **Turno por turno:** una grilla día × turno con quién estuvo y cuánto pasó.

Para corregir un dato se edita el cierre de turno en Producción.

## Despacho de aceite

El camión se pesa en la balanza: **bruto − tara = neto**, y se guarda y se muestra **en kg**. Solo como referencia aparece entre paréntesis a cuántos litros equivale (densidad 0,92 kg/L, en `config.js` → `densidadAceite`); no se guarda ninguna conversión.

> El cálculo del circuito de tanques (interiores, exteriores y grandes) quedó **en pausa** en `archivo/circuito-aceite/`, con sus pruebas, para retomarlo cuando estén las capacidades de los tanques grandes.

## Estado de equipos

- Hay una tarjeta por equipo: 8 prensas (línea 1: 1 a 4, línea 2: 5 a 8), 2 extrusores (uno por línea), reductores y 4 bombas.
- Cada tarjeta muestra cómo quedó el equipo en su último mantenimiento (*Operativo*, *Con observaciones* o *Fuera de servicio*), qué se hizo y hace cuánto.
- Al tocar una tarjeta se ve el historial y se puede registrar un mantenimiento para ese equipo.
- Si un equipo deja de estar en la lista pero tiene mantenimientos cargados, aparece en el grupo **Otros** para no perder su historial.
- El panel **Para el sábado** junta los equipos con observaciones o fuera de servicio, y los que llevan más tiempo sin mantenimiento. La producción suele cortar el viernes a las 22:00 y el mantenimiento se hace el sábado.

## Resumen

- **Por mes:** totales con la variación contra el mes anterior, gráficos por día (soja, aceite y expeller) y la tabla día por día.
- **Por día:** turnos (con su operador), camiones, secadora y mantenimientos de ese día.
- Al tocar un día, en la tabla o en un gráfico, se abre su detalle.

## Editar y borrar registros

Cada fila tiene un lápiz (editar) y un tacho (borrar).

- **Editar** carga el registro en el formulario de la izquierda y permite corregir también la fecha y la hora. El registro queda marcado con la fecha de edición.
- **Borrar** pide un segundo clic para confirmar y ofrece **Deshacer** durante unos segundos.

## Cambios habituales

| Quiero…                                    | Dónde                                                           |
|--------------------------------------------|-----------------------------------------------------------------|
| Agregar una prensa, reductor o extrusor    | `app/js/config.js` → `equipos`                                  |
| Cambiar turnos                             | `app/js/config.js` → `turnos`                                   |
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

- **Nada de internet.** No se cargan scripts, fuentes ni estilos externos. La política de seguridad (CSP) de `index.html` lo bloquea.
- **Nada de `innerHTML` con datos del usuario.** Usar `SoyaCore.ui.el(...)` o `textContent`. Así, un texto como `Pérez <Hnos> & Cía` se muestra tal cual y no se puede inyectar código.
- **Nada de `onclick=` en el HTML.** Los eventos se conectan en el `init()` de cada vista.
- **Versiones con git, no con copias.** Nada de `archivo (1).html`: cada cambio va en un commit, y cada versión entregada lleva un tag (`git tag v2.9.0`).

## Limitaciones conocidas (decisiones pendientes)

1. **Circuito de tanques en pausa:** falta la capacidad de los tanques grandes (se miden con manguera de nivel).
2. **Fecha del turno:** un registro nuevo toma la fecha y hora del momento en que se guarda. Si hace falta, se corrige con **Editar**.
3. **Datos en el navegador:** si se borran los datos de navegación, se pierde todo lo que no esté en un backup.

## Historial

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
