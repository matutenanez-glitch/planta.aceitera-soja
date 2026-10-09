/*
 * Vista: Producción por turnos (cierre de turno con su operador).
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, num, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'turno' },
    { key: 'operador', format: (v) => v || 'Sin operador' }, // los registros anteriores a la v2.13 no tienen operador
    { key: 'expeller', format: fmt.entero, className: 'num' },
    { key: 'aceite', format: fmt.entero, className: 'num' },
  ];

  /** Sugerencias para el campo Operador: los nombres ya usados, el más reciente primero. */
  function actualizarOperadores() {
    const vistos = new Map();
    store.todos('produccion').slice().reverse().forEach((r) => {
      const n = String(r.operador || '').trim();
      if (n && !vistos.has(n.toLowerCase())) vistos.set(n.toLowerCase(), n);
    });
    $('#lista-operadores').replaceChildren(...[...vistos.values()].map((n) => el('option', { attrs: { value: n } })));
  }

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
          $('#prod-operador').value = r.operador || '';
          $('#prod-expeller').value = r.expeller ?? '';
          $('#prod-aceite').value = r.aceite ?? '';
        },
      });

      $('#form-produccion').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarRegistro('produccion', editor, {
          turno: $('#prod-turno').value,
          operador: $('#prod-operador').value.trim().replace(/\s+/g, ' '),
          expeller: num($('#prod-expeller')),
          aceite: num($('#prod-aceite')),
        }, { nuevo: 'Cierre de turno guardado.' });
      });

      store.alCambiar((c) => {
        if (c === 'produccion' || c === '*') { tabla.dibujar(); actualizarOperadores(); }
      });
      tabla.dibujar();
      actualizarOperadores();
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
