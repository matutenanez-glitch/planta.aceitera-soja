/*
 * Vista: Secadora y tomas de laboratorio.
 *
 * La soja que pasa por la secadora ya está mezclada en el silo (todos los
 * camiones descargaron), así que cada toma no es de un camión: solo se anota
 * la humedad en caliente y en frío. La humedad de cada camión se carga en
 * Recepción. Los registros anteriores a la v2.18 pueden tener "empresa" y
 * "hCamion": se conservan, pero ya no se muestran acá.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, hoy, num, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'hCaliente', format: fmt.porcentaje, className: 'num' },
    { key: 'hFrio', format: fmt.porcentaje, className: 'num' },
  ];

  const promedio = (lista, campo) => {
    const v = lista.map((r) => r[campo]).filter((x) => x != null && x !== '' && !isNaN(Number(x))).map(Number);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  function actualizarHoy() {
    const tomas = store.todos('secadora').filter((r) => String(r.fecha).startsWith(hoy()));
    $('#sec-hoy-tomas').textContent = fmt.entero(tomas.length);
    $('#sec-hoy-caliente').textContent = fmt.porcentaje(promedio(tomas, 'hCaliente'));
    $('#sec-hoy-frio').textContent = fmt.porcentaje(promedio(tomas, 'hFrio'));
    const ultima = tomas.map((r) => String(r.fecha)).sort().pop();
    $('#sec-hoy-ultima').textContent = ultima ? ultima.slice(11, 16) : '-';
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.secadora = {
    init() {
      let editor;
      const tabla = tablaRegistros({
        tbody: $('#tbody-secadora'),
        caption: $('#caption-secadora'),
        coleccion: 'secadora',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-secadora'), {
        tabla,
        rellenar(r) {
          $('#sec-humedad-caliente').value = r.hCaliente ?? '';
          $('#sec-humedad-frio').value = r.hFrio ?? '';
        },
      });

      $('#form-secadora').addEventListener('submit', (e) => {
        e.preventDefault();
        if (guardarRegistro('secadora', editor, {
          hCaliente: num($('#sec-humedad-caliente')),
          hFrio: num($('#sec-humedad-frio')),
        }, { nuevo: 'Toma de la secadora guardada.' })) $('#sec-humedad-caliente').focus();
      });

      store.alCambiar((c) => {
        if (c === 'secadora' || c === '*') { tabla.dibujar(); actualizarHoy(); }
      });
      tabla.dibujar();
      actualizarHoy();
    },
    refresh: actualizarHoy, // al entrar a la vista se recalcula "hoy"
  };
})(window.SoyaCore = window.SoyaCore || {});
