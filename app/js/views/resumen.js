/*
 * Vista: Resumen por mes y por día.
 *
 * Por mes: totales con la comparación contra el mes anterior, gráficos por
 * día y la tabla día por día (tocando un día se abre su detalle).
 * Por día: qué pasó ese día (camiones, secadora, turnos, aceite, expeller,
 * mantenimiento).
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt, fillSelect } = SoyaCore.ui;
  const store = SoyaCore.store;
  const icons = SoyaCore.icons;

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const pad = (n) => String(n).padStart(2, '0');
  const esSoja = (c) => (c.carga || 'Soja').toLowerCase().includes('soja');
  const mesDe = (r) => String(r.fecha).slice(0, 7);
  const diaDe = (r) => String(r.fecha).slice(0, 10);
  const horaDe = (r) => String(r.fecha).slice(11, 16);
  const nombreMes = (m) => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1]} ${a}`; };
  const mesAnterior = (m) => { const [a, mm] = m.split('-').map(Number); const d = new Date(a, mm - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const fechaDia = (d) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const isoDia = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const tituloDia = (d) => { const f = fechaDia(d); return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`; };
  const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  let modo = 'mes';

  /** Totales de un conjunto de registros filtrados por un prefijo de fecha ("2026-10" o "2026-10-08"). */
  function totales(prefijo) {
    const de = (col) => store.todos(col).filter((r) => String(r.fecha).startsWith(prefijo));
    const ingresos = de('ingresos');
    const soja = ingresos.filter(esSoja);
    const produccion = de('produccion');
    const despExp = de('despachos');
    const despAce = de('despachosAceite');
    const secadora = de('secadora');
    const humedades = secadora.map((s) => Number(s.hCamion)).filter((v) => !isNaN(v));
    const sum = (lista, campo) => lista.reduce((t, r) => t + (Number(r[campo]) || 0), 0);
    return {
      ingresos, produccion, despExp, despAce, secadora,
      mantenimiento: de('mantenimiento'),
      sojaKg: sum(soja, 'neto'),
      camionesSoja: soja.length,
      aceiteProd: sum(produccion, 'aceite'),
      aceiteDesp: sum(despAce, 'litros'),
      expProd: sum(produccion, 'expeller'),
      expDesp: sum(despExp, 'neto'),
      camionesIn: ingresos.length,
      camionesOut: despExp.length + despAce.length,
      humedad: humedades.length ? humedades.reduce((a, b) => a + b, 0) / humedades.length : null,
    };
  }

  // ---------- Tarjetas ----------
  function variacion(actual, previo) {
    if (!(previo > 0)) return null;
    return ((actual - previo) / previo) * 100;
  }

  function kpi({ titulo, valor, sub, delta, nombreMesPrevio, color }) {
    const hijos = [
      el('p', { className: 'flex items-center gap-2 text-[11px] font-bold tracking-wide text-slate-400 uppercase' }, [
        color ? Object.assign(el('span', { className: 'inline-block h-2.5 w-2.5 rounded-sm' }), { style: `background:${color}` }) : null,
        el('span', { text: titulo }),
      ]),
      el('p', { className: 'mt-1 text-2xl font-black text-white', text: valor }),
    ];
    if (delta != null) {
      const sube = delta >= 0;
      hijos.push(el('p', { className: 'mt-1 flex items-center gap-1 text-[11px] ' + (Math.abs(delta) < 0.5 ? 'text-slate-400' : sube ? 'text-emerald-400' : 'text-red-400') }, [
        el('i', { attrs: { 'data-lucide': sube ? 'arrow-up' : 'arrow-down' }, className: 'h-3 w-3' }),
        el('span', { text: `${fmt.entero(Math.abs(delta))} % vs ${nombreMesPrevio}` }),
      ]));
    } else if (sub) {
      hijos.push(el('p', { className: 'mt-1 text-[11px] text-slate-500', text: sub }));
    }
    return el('div', { className: 'glass-panel rounded-xl p-5' }, hijos);
  }

  // ---------- Por mes ----------
  function mesesDisponibles() {
    const meses = new Set([isoDia(new Date()).slice(0, 7)]);
    ['ingresos', 'produccion', 'despachos', 'despachosAceite', 'secadora'].forEach((c) => store.todos(c).forEach((r) => meses.add(mesDe(r))));
    return [...meses].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  }

  function cargarMeses() {
    const select = $('#resumen-mes');
    const lista = mesesDisponibles();
    const elegido = lista.includes(select.value) ? select.value : lista[0];
    fillSelect(select, lista.map((m) => ({ value: m, label: capitalizar(nombreMes(m)) })), elegido);
  }

  function diasDelMes(mes) {
    const [a, m] = mes.split('-').map(Number);
    const hoy = isoDia(new Date());
    const dias = [];
    for (let d = new Date(a, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
      const iso = isoDia(d);
      if (iso > hoy) break;
      dias.push(iso);
    }
    return dias;
  }

  function dibujarMes() {
    const mes = $('#resumen-mes').value;
    if (!mes) return;
    const t = totales(mes);
    const prev = totales(mesAnterior(mes));
    const nPrev = MESES[Number(mesAnterior(mes).slice(5, 7)) - 1];

    $('#res-mes-kpis').replaceChildren(
      kpi({ titulo: 'Soja ingresada', valor: fmt.toneladas(t.sojaKg), delta: variacion(t.sojaKg, prev.sojaKg), sub: `${t.camionesSoja} camión${t.camionesSoja === 1 ? '' : 'es'}`, nombreMesPrevio: nPrev }),
      kpi({ titulo: 'Aceite producido', valor: fmt.litros(t.aceiteProd), delta: variacion(t.aceiteProd, prev.aceiteProd), nombreMesPrevio: nPrev, color: 'var(--color-viz-producido)' }),
      kpi({ titulo: 'Aceite despachado', valor: fmt.litros(t.aceiteDesp), delta: variacion(t.aceiteDesp, prev.aceiteDesp), sub: `${t.despAce.length} camión${t.despAce.length === 1 ? '' : 'es'}`, nombreMesPrevio: nPrev, color: 'var(--color-viz-despachado)' }),
      kpi({ titulo: 'Expeller producido', valor: fmt.toneladas(t.expProd), delta: variacion(t.expProd, prev.expProd), nombreMesPrevio: nPrev, color: 'var(--color-viz-producido)' }),
      kpi({ titulo: 'Expeller despachado', valor: fmt.toneladas(t.expDesp), delta: variacion(t.expDesp, prev.expDesp), sub: `${t.despExp.length} camión${t.despExp.length === 1 ? '' : 'es'}`, nombreMesPrevio: nPrev, color: 'var(--color-viz-despachado)' }),
      kpi({ titulo: 'Camiones entrada / salida', valor: `${t.camionesIn} / ${t.camionesOut}`, sub: 'ingresos / despachos de expeller y aceite' }),
    );
    icons.render($('#res-mes-kpis'));

    const dias = diasDelMes(mes);
    const porDia = dias.map((d) => totales(d));
    const categorias = dias.map((d) => ({ etiqueta: d.slice(8, 10), titulo: capitalizar(tituloDia(d)) }));
    const abrirDia = (i) => verDia(dias[i]);
    SoyaCore.graficos.columnas($('#res-graf-soja'), {
      titulo: 'Soja ingresada por día', categorias, unidad: 'kg', alSeleccionar: abrirDia,
      series: [{ nombre: 'Soja ingresada', color: 'var(--color-viz-soja)', valores: porDia.map((x) => x.sojaKg) }],
    });
    SoyaCore.graficos.columnas($('#res-graf-aceite'), {
      titulo: 'Aceite producido y despachado por día', categorias, unidad: 'L', alSeleccionar: abrirDia,
      series: [
        { nombre: 'Producido', color: 'var(--color-viz-producido)', valores: porDia.map((x) => x.aceiteProd) },
        { nombre: 'Despachado', color: 'var(--color-viz-despachado)', valores: porDia.map((x) => x.aceiteDesp) },
      ],
    });
    SoyaCore.graficos.columnas($('#res-graf-expeller'), {
      titulo: 'Expeller producido y despachado por día', categorias, unidad: 'kg', alSeleccionar: abrirDia,
      series: [
        { nombre: 'Producido', color: 'var(--color-viz-producido)', valores: porDia.map((x) => x.expProd) },
        { nombre: 'Despachado', color: 'var(--color-viz-despachado)', valores: porDia.map((x) => x.expDesp) },
      ],
    });

    // Tabla: solo los días con algún movimiento, el más reciente arriba
    const filas = dias.map((d, i) => ({ d, x: porDia[i] }))
      .filter(({ x }) => x.ingresos.length || x.produccion.length || x.despExp.length || x.despAce.length || x.secadora.length)
      .reverse()
      .map(({ d, x }) => {
        const boton = el('button', { className: 'link-btn text-left', text: capitalizar(tituloDia(d).replace(/ de \d{4}$/, '')), attrs: { type: 'button' } });
        boton.addEventListener('click', () => verDia(d));
        const n = (v) => (v ? fmt.entero(v) : '-');
        return el('tr', null, [
          el('td', null, [boton]),
          el('td', { className: 'num', text: n(x.sojaKg) }),
          el('td', { className: 'num text-brand-300', text: n(x.aceiteProd) }),
          el('td', { className: 'num text-purple-300', text: n(x.aceiteDesp) }),
          el('td', { className: 'num', text: n(x.expProd) }),
          el('td', { className: 'num', text: n(x.expDesp) }),
          el('td', { className: 'num', text: fmt.porcentaje(x.humedad) }),
        ]);
      });
    if (!filas.length) filas.push(el('tr', null, [el('td', { className: 'empty', text: 'Sin movimientos en este mes.', attrs: { colspan: '7' } })]));
    $('#tbody-resumen').replaceChildren(...filas);
  }

  // ---------- Por día ----------
  function filasTabla(tbodyId, registros, columnas, vacio) {
    const filas = registros.map((r) => el('tr', null, columnas.map((c) => el('td', { className: c.className || '', text: c.valor(r) }))));
    if (!filas.length) filas.push(el('tr', null, [el('td', { className: 'empty', text: vacio, attrs: { colspan: String(columnas.length) } })]));
    $(tbodyId).replaceChildren(...filas);
  }

  function dibujarDia() {
    const dia = $('#resumen-dia').value || isoDia(new Date());
    const t = totales(dia);
    $('#res-dia-titulo').textContent = capitalizar(tituloDia(dia));

    $('#res-dia-kpis').replaceChildren(
      kpi({ titulo: 'Soja ingresada', valor: fmt.kg(t.sojaKg), sub: `${t.camionesSoja} camión${t.camionesSoja === 1 ? '' : 'es'} de soja` }),
      kpi({ titulo: 'Humedad inicial prom.', valor: fmt.porcentaje(t.humedad), sub: `${t.secadora.length} muestra${t.secadora.length === 1 ? '' : 's'} de secadora` }),
      kpi({ titulo: 'Aceite producido', valor: fmt.litros(t.aceiteProd), sub: `${t.produccion.length} cierre${t.produccion.length === 1 ? '' : 's'} de turno`, color: 'var(--color-viz-producido)' }),
      kpi({ titulo: 'Aceite despachado', valor: fmt.litros(t.aceiteDesp), sub: `${t.despAce.length} camión${t.despAce.length === 1 ? '' : 'es'}`, color: 'var(--color-viz-despachado)' }),
      kpi({ titulo: 'Expeller producido', valor: fmt.kg(t.expProd), sub: 'según cierres de turno', color: 'var(--color-viz-producido)' }),
      kpi({ titulo: 'Expeller despachado', valor: fmt.kg(t.expDesp), sub: `${t.despExp.length} camión${t.despExp.length === 1 ? '' : 'es'}`, color: 'var(--color-viz-despachado)' }),
    );

    const porHora = (a, b) => String(a.fecha).localeCompare(String(b.fecha));
    filasTabla('#res-dia-turnos', t.produccion.slice().sort(porHora), [
      { valor: horaDe }, { valor: (r) => r.turno },
      { valor: (r) => fmt.entero(r.expeller), className: 'num' }, { valor: (r) => fmt.entero(r.aceite), className: 'num' },
    ], 'No se cerraron turnos este día.');

    const camiones = [
      ...t.ingresos.map((r) => ({ fecha: r.fecha, tipo: `Ingreso (${r.carga || 'Soja'})`, empresa: r.empresa, cantidad: fmt.kg(r.neto) })),
      ...t.despExp.map((r) => ({ fecha: r.fecha, tipo: 'Despacho expeller', empresa: r.empresa, cantidad: fmt.kg(r.neto) })),
      ...t.despAce.map((r) => ({ fecha: r.fecha, tipo: 'Despacho aceite', empresa: r.empresa, cantidad: fmt.entero(r.litros) + ' L' })),
    ].sort(porHora);
    filasTabla('#res-dia-camiones', camiones, [
      { valor: horaDe }, { valor: (r) => r.tipo }, { valor: (r) => r.empresa, className: 'max-w-48 truncate' }, { valor: (r) => r.cantidad, className: 'num' },
    ], 'No hubo camiones este día.');

    filasTabla('#res-dia-secadora', t.secadora.slice().sort(porHora), [
      { valor: horaDe }, { valor: (r) => r.empresa, className: 'max-w-48 truncate' },
      { valor: (r) => fmt.porcentaje(r.hCamion), className: 'num' }, { valor: (r) => fmt.porcentaje(r.hCaliente), className: 'num' }, { valor: (r) => fmt.porcentaje(r.hFrio), className: 'num' },
    ], 'Sin muestras este día.');

    const estados = SoyaCore.config.estadosEquipo;
    filasTabla('#res-dia-mant', t.mantenimiento.slice().sort(porHora), [
      { valor: horaDe }, { valor: (r) => r.equipo }, { valor: (r) => r.tarea, className: 'max-w-56 truncate' },
      { valor: (r) => estados[SoyaCore.views.mantenimiento.estadoDe(r)].etiqueta },
    ], 'Sin mantenimientos este día.');
  }

  // ---------- Navegación entre modos ----------
  function ponerModo(nuevo) {
    modo = nuevo;
    $('#res-tab-mes').setAttribute('aria-selected', String(modo === 'mes'));
    $('#res-tab-dia').setAttribute('aria-selected', String(modo === 'dia'));
    $('#res-mes').hidden = modo !== 'mes';
    $('#res-dia').hidden = modo !== 'dia';
    $('#res-ctrl-mes').hidden = modo !== 'mes';
    $('#res-ctrl-dia').hidden = modo !== 'dia';
    refrescar();
  }

  function verDia(dia) {
    $('#resumen-dia').value = dia;
    ponerModo('dia');
  }

  function refrescar() {
    if (modo === 'mes') { cargarMeses(); dibujarMes(); } else dibujarDia();
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.resumen = {
    init() {
      $('#resumen-dia').value = isoDia(new Date());
      $('#res-tab-mes').addEventListener('click', () => ponerModo('mes'));
      $('#res-tab-dia').addEventListener('click', () => ponerModo('dia'));
      $('#resumen-mes').addEventListener('change', dibujarMes);
      $('#resumen-dia').addEventListener('change', dibujarDia);
      $('#res-hoy').addEventListener('click', () => verDia(isoDia(new Date())));
      $$('[data-mover-mes]').forEach((b) => b.addEventListener('click', () => {
        // la lista está ordenada del más nuevo al más viejo
        const select = $('#resumen-mes');
        const i = select.selectedIndex - Number(b.dataset.moverMes);
        if (i >= 0 && i < select.options.length) { select.selectedIndex = i; dibujarMes(); }
      }));
      $$('[data-mover-dia]').forEach((b) => b.addEventListener('click', () => {
        const d = fechaDia($('#resumen-dia').value || isoDia(new Date()));
        d.setDate(d.getDate() + Number(b.dataset.moverDia));
        $('#resumen-dia').value = isoDia(d);
        dibujarDia();
      }));
    },
    refresh: refrescar,
  };
})(window.SoyaCore = window.SoyaCore || {});
