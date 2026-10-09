/*
 * Arranque de la app: navegación entre vistas, panel de datos y backup.
 * Se carga último (todos los scripts usan "defer"), con el HTML ya listo.
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, fmt, toast, alerta, descargar } = SoyaCore.ui;
  const { config, store, views, icons } = SoyaCore;

  let vistaActual = 'recepcion';

  // ---------- Navegación ----------
  function mostrar(vista, { foco } = {}) {
    if (!config.vistas[vista]) return;
    vistaActual = vista;

    $$('.view').forEach((s) => { s.hidden = s.id !== 'view-' + vista; });
    $$('#nav [data-view]').forEach((b) => {
      if (b.dataset.view === vista) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    $('#page-name').textContent = config.vistas[vista].titulo;
    icons.swap($('#page-icon'), config.vistas[vista].icono);
    document.title = `${config.vistas[vista].titulo} · SoyaCore OS`;

    views[vista].refresh();
    if (foco) $('#page-title').focus();
  }

  SoyaCore.navegar = (vista) => mostrar(vista, { foco: false });

  $('#nav').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-view]');
    if (boton) mostrar(boton.dataset.view, { foco: true });
  });

  // Enlaces internos entre vistas (por ejemplo, "Registrar despacho de aceite")
  document.addEventListener('click', (e) => {
    const enlace = e.target.closest('[data-ir]');
    if (enlace) mostrar(enlace.dataset.ir, { foco: true });
  });

  // ---------- Panel "Datos en este equipo" ----------
  function actualizarPanelDatos() {
    $('#datos-resumen').textContent = `${fmt.entero(store.totalRegistros())} registros guardados`;

    const ultimo = store.meta().ultimoBackup;
    const nodo = $('#datos-backup');
    if (!ultimo) {
      nodo.textContent = 'Último backup: nunca';
      nodo.className = 'mt-0.5 text-[11px] font-semibold text-amber-400';
      return;
    }
    const fecha = new Date(ultimo);
    const dias = Math.floor((Date.now() - fecha.getTime()) / 86400000);
    nodo.textContent = 'Último backup: ' + fecha.toLocaleDateString(config.locale) + (dias > 0 ? ` (hace ${dias} d)` : ' (hoy)');
    nodo.className = 'mt-0.5 text-[11px] ' + (dias >= config.diasAvisoBackup ? 'font-semibold text-amber-400' : 'text-slate-500');
  }

  $('#btn-backup-exportar').addEventListener('click', () => {
    const contenido = store.exportarBackup();
    const sello = SoyaCore.ui.ahora().replace(' ', '_').replace(':', '-');
    descargar(`soyacore_backup_${sello}.json`, contenido, 'application/json');
    toast('Backup exportado. Guardalo fuera de esta PC (pendrive, nube).', 'ok');
  });

  $('#btn-backup-importar').addEventListener('click', () => $('#input-backup').click());

  $('#input-backup').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    try {
      const { obj, resumen } = store.validarBackup(await archivo.text());
      const detalle = Object.entries(resumen).map(([k, n]) => `• ${store.etiqueta(k)}: ${n}`).join('\n');
      const mensaje = `Se van a REEMPLAZAR todos los datos actuales (${store.totalRegistros()} registros) por los del backup:\n\n${detalle}\n\n¿Continuar?`;
      if (!window.confirm(mensaje)) return;
      if (store.importarBackup(obj)) {
        toast('Backup importado correctamente', 'ok');
        mostrar(vistaActual);
      }
    } catch (err) {
      toast('No se pudo importar: ' + err.message, 'error');
    }
  });

  store.alCambiar(actualizarPanelDatos);

  // ---------- Arranque ----------
  $('#app-version').textContent = 'v' + config.version;
  icons.render();
  Object.values(views).forEach((v) => v.init());

  store.errores().forEach((err) => {
    alerta(
      `No se pudieron leer los datos de "${store.etiqueta(err.nombre)}": el contenido guardado está dañado. ` +
      (err.copia
        ? `Se guardó una copia del contenido dañado en la clave "${err.copia}" y la sección arrancó vacía. Importá tu último backup o pedí ayuda para recuperarla.`
        : 'La sección arrancó vacía y no se tocó el contenido original. Exportá un backup y pedí ayuda.')
    );
  });

  actualizarPanelDatos();
  mostrar('recepcion');
})(window.SoyaCore = window.SoyaCore || {});
