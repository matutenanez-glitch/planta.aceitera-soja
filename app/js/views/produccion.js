/*
 * Vista: Producción por turnos.
 * Cada cierre de turno alimenta el Circuito de Aceite (ver circuito-aceite.js).
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, num, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'turno' },
    { key: 'expeller', format: fmt.entero, className: 'num' },
    { key: 'aceite', format: fmt.entero, className: 'num' },
  ];

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.produccion = {
    init() {
      fillSelect($('#prod-turno'), SoyaCore.config.turnos);
      let editor;
      const tabla = tablaRegistros({
        tbody: $('#tbody-produccion'),
        caption: $('#caption-produccion'),
        coleccion: 'produccion',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-produccion'), {
        tabla,
        rellenar(r) {
          $('#prod-turno').value = r.turno;
          $('#prod-expeller').value = r.expeller ?? '';
          $('#prod-aceite').value = r.aceite ?? '';
        },
      });

      $('#form-produccion').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarRegistro('produccion', editor, {
          turno: $('#prod-turno').value,
          expeller: num($('#prod-expeller')),
          aceite: num($('#prod-aceite')),
        }, { nuevo: 'Cierre de turno guardado. El aceite ya entró al circuito.' });
      });

      SoyaCore.store.alCambiar((c) => (c === 'produccion' || c === '*') && tabla.dibujar());
      tabla.dibujar();
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
