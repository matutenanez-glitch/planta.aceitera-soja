/*
 * Vista: Secadora y tomas de laboratorio.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, ahora, hoy, num, renderRows, fillSelect, toast } = SoyaCore.ui;
  const store = SoyaCore.store;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'empresa' },
    { key: 'hCamion', format: fmt.porcentaje, className: 'num' },
    { key: 'hCaliente', format: fmt.porcentaje, className: 'num' },
    { key: 'hFrio', format: fmt.porcentaje, className: 'num' },
  ];

  /** Un ingreso cuenta para la secadora si su carga dice "soja" (o no tiene carga: datos viejos). */
  const esSoja = (c) => (c.carga || 'Soja').toLowerCase().includes('soja');

  function actualizarTotal() {
    const camionesHoy = store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()) && esSoja(c));
    $('#secadora-total-kg').textContent = fmt.kg(camionesHoy.reduce((s, c) => s + (Number(c.neto) || 0), 0));

    const select = $('#sec-empresa');
    const empresas = [...new Set(camionesHoy.map((c) => c.empresa))];
    if (empresas.length === 0) fillSelect(select, [{ value: 'S/D', label: 'Sin camiones de soja hoy' }]);
    else fillSelect(select, empresas, select.value);
  }

  function dibujar() {
    renderRows($('#tbody-secadora'), store.todos('secadora'), COLUMNAS, { caption: $('#caption-secadora') });
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.secadora = {
    init() {
      $('#form-secadora').addEventListener('submit', (e) => {
        e.preventDefault();
        const registro = {
          fecha: ahora(),
          empresa: $('#sec-empresa').value,
          hCamion: num($('#sec-humedad-camion')),
          hCaliente: num($('#sec-humedad-caliente')),
          hFrio: num($('#sec-humedad-frio')),
        };
        if (!store.agregar('secadora', registro)) return;
        e.target.reset();
        actualizarTotal();
        toast('Muestra de laboratorio guardada', 'ok');
      });
      store.alCambiar((c) => {
        if (c === 'secadora' || c === '*') dibujar();
        if (c === 'ingresos' || c === '*') actualizarTotal();
      });
      dibujar();
      actualizarTotal();
    },
    refresh: actualizarTotal, // al entrar a la vista se recalcula "hoy"
  };
})(window.SoyaCore = window.SoyaCore || {});
