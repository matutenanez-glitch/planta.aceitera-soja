/*
 * Solo para las páginas publicadas dentro de Claude (claude.ai/artifact/…): ahí el
 * navegador no deja descargar directo ("esa opción no está disponible"). Se usan las
 * descargas de Claude (capacidad "downloads"): Claude muestra el archivo, se confirma
 * y se guarda. En Vercel, en la PC o en el .exe no cambia nada (no existe window.claude).
 *
 * Va después de js/ui.js y antes de los scripts que toman SoyaCore.ui.descargar
 * (comprobantes.js, app.js). Lo suma `prueba-web.mjs --claude`.
 */
(function (SoyaCore) {
  'use strict';
  const ui = SoyaCore.ui;
  const original = ui.descargar;
  const enClaude = () => !!(window.claude && typeof window.claude.use === 'function');
  let api = null;
  let pedido = null;
  const pedir = () => {
    if (!pedido && enClaude()) pedido = window.claude.use('downloads').then((d) => { api = d; return d; }, () => null);
    return pedido || Promise.resolve(null);
  };
  pedir();
  document.addEventListener('DOMContentLoaded', pedir);

  function guardar(d, nombre, data) {
    d.save({ filename: nombre, data }).catch((e) => {
      const code = e && e.code;
      if (code === 'declined') return;
      if (code === 'rate_limited') { ui.toast('Hay otra descarga esperando: confirmala o esperá un momento.', 'aviso'); return; }
      ui.toast('No se pudo descargar en esta página. Abrí la app en https://plantaaceitera-soja.vercel.app y descargalo desde ahí.', 'error');
    });
  }

  ui.descargar = function (nombre, contenido, mime) {
    if (!enClaude()) { original(nombre, contenido, mime); return; }
    const data = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime || 'application/octet-stream' });
    if (api) { guardar(api, nombre, data); return; }
    pedir().then((d) => (d ? guardar(d, nombre, data) : original(nombre, contenido, mime)));
  };
})(window.SoyaCore = window.SoyaCore || {});
