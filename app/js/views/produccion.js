/*
 * Vista: Producción por turnos.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, ahora, num, renderRows, fillSelect, toast } = SoyaCore.ui;
  const store = SoyaCore.store;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'turno' },
    { key: 'expeller', format: fmt.entero, className: 'num' },
    { key: 'aceite', format: fmt.entero, className: 'num' },
  ];

  function dibujar() {
    renderRows($('#tbody-produccion'), store.todos('produccion'), COLUMNAS, { caption: $('#caption-produccion') });
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.produccion = {
    init() {
      fillSelect($('#prod-turno'), SoyaCore.config.turnos);
      $('#form-produccion').addEventListener('submit', (e) => {
        e.preventDefault();
        const registro = {
          fecha: ahora(),
          turno: $('#prod-turno').value,
          expeller: num($('#prod-expeller')),
          aceite: num($('#prod-aceite')),
        };
        if (!store.agregar('produccion', registro)) return;
        e.target.reset();
        toast('Cierre de turno guardado correctamente', 'ok');
      });
      store.alCambiar((c) => (c === 'produccion' || c === '*') && dibujar());
      dibujar();
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
