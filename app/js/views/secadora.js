/*
 * Vista: Secadora y tomas de laboratorio.
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, hoy, num, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
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

  let editor;

  function actualizarTotal() {
    const camionesHoy = store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()) && esSoja(c));
    $('#secadora-total-kg').textContent = fmt.kg(camionesHoy.reduce((s, c) => s + (Number(c.neto) || 0), 0));
    if (editor && editor.id) return; // no tocar el select mientras se edita

    const select = $('#sec-empresa');
    const empresas = [...new Set(camionesHoy.map((c) => c.empresa))];
    if (empresas.length === 0) fillSelect(select, [{ value: 'S/D', label: 'Sin camiones de soja hoy' }]);
    else fillSelect(select, empresas, select.value);
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.secadora = {
    init() {
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
          const select = $('#sec-empresa');
          // La empresa de una muestra vieja puede no estar entre los camiones de hoy.
          if (![...select.options].some((o) => o.value === r.empresa)) {
            select.appendChild(el('option', { text: r.empresa, attrs: { value: r.empresa } }));
          }
          select.value = r.empresa;
          $('#sec-humedad-camion').value = r.hCamion ?? '';
          $('#sec-humedad-caliente').value = r.hCaliente ?? '';
          $('#sec-humedad-frio').value = r.hFrio ?? '';
        },
        alTerminar: () => setTimeout(actualizarTotal), // después de que termine el modo edición
      });

      $('#form-secadora').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarRegistro('secadora', editor, {
          empresa: $('#sec-empresa').value,
          hCamion: num($('#sec-humedad-camion')),
          hCaliente: num($('#sec-humedad-caliente')),
          hFrio: num($('#sec-humedad-frio')),
        }, { nuevo: 'Muestra de laboratorio guardada.' });
      });

      store.alCambiar((c) => {
        if (c === 'secadora' || c === '*') tabla.dibujar();
        if (c === 'ingresos' || c === '*') actualizarTotal();
      });
      tabla.dibujar();
      actualizarTotal();
    },
    refresh: actualizarTotal, // al entrar a la vista se recalcula "hoy"
  };
})(window.SoyaCore = window.SoyaCore || {});
