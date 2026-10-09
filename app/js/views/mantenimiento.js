/*
 * Vista: Mantenimiento de prensas, extrusores y reductores.
 */
(function (SoyaCore) {
  'use strict';

  const { $, ahora, renderRows, fillSelect, toast } = SoyaCore.ui;
  const store = SoyaCore.store;
  const equipos = SoyaCore.config.equipos;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'equipo' },
    { key: 'tarea' },
    { key: 'repuestos' },
    { key: 'observaciones', className: 'max-w-xs truncate' },
  ];

  function actualizarEquipos() {
    const tipo = $('#mant-tipo').value;
    fillSelect($('#mant-equipo'), (equipos[tipo] || { lista: [] }).lista);
  }

  function dibujar() {
    renderRows($('#tbody-mantenimiento'), store.todos('mantenimiento'), COLUMNAS, { caption: $('#caption-mantenimiento') });
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.mantenimiento = {
    init() {
      fillSelect($('#mant-tipo'), Object.entries(equipos).map(([value, def]) => ({ value, label: def.etiqueta })));
      $('#mant-tipo').addEventListener('change', actualizarEquipos);
      actualizarEquipos();

      $('#form-mantenimiento').addEventListener('submit', (e) => {
        e.preventDefault();
        const registro = {
          fecha: ahora(),
          tipo: $('#mant-tipo').value,
          equipo: $('#mant-equipo').value,
          tarea: $('#mant-tarea').value.trim(),
          repuestos: $('#mant-piezas').value.trim() || 'Ninguno',
          observaciones: $('#mant-obs').value.trim(), // en v2.8 este campo se pedía pero no se guardaba
        };
        if (!store.agregar('mantenimiento', registro)) return;
        e.target.reset();
        actualizarEquipos();
        toast('Registro de mantenimiento guardado', 'ok');
      });
      store.alCambiar((c) => (c === 'mantenimiento' || c === '*') && dibujar());
      dibujar();
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
