/*
 * Modo día / noche. Se carga en el <head> SIN "defer", antes de que se dibuje la
 * página, así no parpadea al abrir en modo día. Se recuerda en cada PC
 * (localStorage "soya_tema"); no se copia a la nube.
 *   <html data-tema="oscuro">  modo noche (el de siempre)
 *   <html data-tema="claro">   modo día
 * El botón lo conecta app.js con SoyaCore.tema.
 */
(function (SoyaCore) {
  'use strict';
  const CLAVE = 'soya_tema';
  const raiz = document.documentElement;

  function leer() {
    try { return localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro'; } catch (_) { return 'oscuro'; }
  }

  function poner(tema) {
    raiz.dataset.tema = tema === 'claro' ? 'claro' : 'oscuro';
    try { localStorage.setItem(CLAVE, raiz.dataset.tema); } catch (_) { /* sin almacenamiento: dura hasta cerrar */ }
  }

  raiz.dataset.tema = leer();

  SoyaCore.tema = {
    actual: () => raiz.dataset.tema,
    poner,
    cambiar: () => poner(raiz.dataset.tema === 'claro' ? 'oscuro' : 'claro'),
  };
})(window.SoyaCore = window.SoyaCore || {});
