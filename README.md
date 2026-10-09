# SoyaCore OS — Sistema de planta aceitera de soja

App de escritorio para registrar la operación diaria de una planta aceitera:
recepción de camiones, despacho de expeller, secadora, producción por turnos,
niveles de tanques, mantenimiento, resumen mensual y un constructor de prompts para IA.

Funciona **sin internet** y guarda los datos **en la PC donde se usa**.

## Cómo usarla

1. Abrí `app/index.html` con doble clic. Usá **Chrome o Edge actualizados**: los estilos necesitan Chrome/Edge 111 o posterior.
2. Usá siempre **el mismo navegador y el mismo usuario de Windows**: los datos quedan guardados en ese navegador.
3. Hacé un **backup** con el botón **Exportar** (abajo a la izquierda) al menos una vez por semana y guardalo fuera de la PC. La app avisa en ámbar cuando pasaron 7 días.

> **Si venís de la v2.8:** abrí la v2.9 en el mismo navegador donde usabas la versión anterior y los datos aparecen solos (se usan las mismas claves `soya_*`). La v2.8 también sigue pudiendo leerlos.

## Estructura del proyecto

```
app/                     ← la aplicación (esto es lo que se instala en la planta)
  index.html             estructura de la página (sin estilos ni lógica adentro)
  css/styles.css         estilos GENERADOS (no editar a mano)
  js/config.js           ← datos de la planta: tanques, equipos, turnos, versión
  js/icons.js            íconos (Lucide) incluidos localmente
  js/ui.js               utilidades de pantalla: formato, tablas, avisos
  js/store.js            guardado de datos, migración y backup
  js/views/*.js          una vista por archivo (recepción, secadora, tanques…)
  js/app.js              arranque y navegación
src/styles.css           ← fuente de los estilos (Tailwind CSS v4)
scripts/build-css.mjs    compila src/styles.css → app/css/styles.css
scripts/sincronizar_github.bat   sube los cambios a GitHub (Windows)
archivo/                 versiones anteriores, solo como referencia
```

## Cambios habituales

| Quiero…                                    | Dónde                                                           |
|--------------------------------------------|-----------------------------------------------------------------|
| Agregar un tanque o cambiar capacidades    | `app/js/config.js` → `tanques`                                  |
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

1. **Tanques:** el nivel es la suma de *todo* el aceite producido desde el primer día; todavía no se registran salidas de aceite. Con el tiempo los tanques se ven siempre llenos.
2. **Fecha del turno:** cada registro toma la fecha y hora del momento en que se guarda. Si el Turno 2 se cierra después de las 00:00, el registro queda en el día siguiente.
3. **No se pueden editar ni borrar registros** desde la app.
4. **Datos en el navegador:** si se borran los datos de navegación, se pierde todo lo que no esté en un backup.

## Historial

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
