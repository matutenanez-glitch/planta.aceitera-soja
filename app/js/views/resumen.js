/*
 * Vista: Resumen mensual (KPIs + desglose diario).
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, fillSelect } = SoyaCore.ui;
  const store = SoyaCore.store;

  const esSoja = (c) => (c.carga || 'Soja').toLowerCase().includes('soja');
  const mesDe = (r) => String(r.fecha).slice(0, 7);
  const diaDe = (r) => String(r.fecha).slice(0, 10);

  function cargarMeses() {
    const select = $('#resumen-mes');
    const meses = new Set();
    store.todos('ingresos').forEach((c) => meses.add(mesDe(c)));
    store.todos('produccion').forEach((p) => meses.add(mesDe(p)));
    const lista = [...meses].sort().reverse();
    const seleccionado = lista.includes(select.value) ? select.value : lista[0];
    fillSelect(select, lista.length ? lista : [{ value: '', label: 'Sin datos' }], seleccionado);
    dibujar();
  }

  function dibujar() {
    const mes = $('#resumen-mes').value;
    const dias = {};
    const dia = (d) => (dias[d] = dias[d] || { soja: 0, expeller: 0, aceite: 0, humedades: [] });
    let soja = 0, expeller = 0, aceite = 0, camionesIn = 0, camionesOut = 0;

    if (mes) {
      store.todos('ingresos').filter((c) => mesDe(c) === mes).forEach((c) => {
        camionesIn++;
        if (esSoja(c)) {
          soja += Number(c.neto) || 0;
          dia(diaDe(c)).soja += Number(c.neto) || 0;
        }
      });
      camionesOut = store.todos('despachos').filter((c) => mesDe(c) === mes).length;
      store.todos('produccion').filter((p) => mesDe(p) === mes).forEach((p) => {
        expeller += Number(p.expeller) || 0;
        aceite += Number(p.aceite) || 0;
        dia(diaDe(p)).expeller += Number(p.expeller) || 0;
        dia(diaDe(p)).aceite += Number(p.aceite) || 0;
      });
      store.todos('secadora').filter((s) => mesDe(s) === mes).forEach((s) => {
        const d = dias[diaDe(s)];
        if (d && !isNaN(Number(s.hCamion))) d.humedades.push(Number(s.hCamion));
      });
    }

    $('#kpi-soja').textContent = fmt.toneladas(soja);
    $('#kpi-expeller').textContent = fmt.toneladas(expeller);
    $('#kpi-aceite').textContent = fmt.litros(aceite);
    $('#kpi-camiones').textContent = `${camionesIn} / ${camionesOut}`;

    const filas = Object.keys(dias).sort().reverse().map((d) => {
      const v = dias[d];
      const promedio = v.humedades.length ? v.humedades.reduce((a, b) => a + b, 0) / v.humedades.length : null;
      return el('tr', null, [
        el('td', { text: d }),
        el('td', { className: 'num', text: fmt.entero(v.soja) }),
        el('td', { className: 'num', text: fmt.entero(v.expeller) }),
        el('td', { className: 'num font-medium text-brand-400', text: fmt.entero(v.aceite) }),
        el('td', { className: 'num', text: fmt.porcentaje(promedio) }),
      ]);
    });
    if (filas.length === 0) filas.push(el('tr', null, [el('td', { className: 'empty', text: 'Sin datos para este mes.', attrs: { colspan: '5' } })]));
    $('#tbody-resumen').replaceChildren(...filas);
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.resumen = {
    init() {
      $('#resumen-mes').addEventListener('change', dibujar);
    },
    refresh: cargarMeses, // se recalcula al entrar a la vista
  };
})(window.SoyaCore = window.SoyaCore || {});
