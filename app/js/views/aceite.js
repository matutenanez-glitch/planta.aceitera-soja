/*
 * Vista: Aceite por operador y turno.
 *
 * Sale de los cierres de turno (Producción): quién estuvo en cada turno y
 * cuánto aceite pasó. Los despachos de aceite se muestran en kg de balanza.
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt } = SoyaCore.ui;
  const store = SoyaCore.store;

  const DIA = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const SIN_OPERADOR = 'Sin operador';

  const ms = SoyaCore.ui.fechaMs;
  const ddmm = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };

  let periodo = '7d';

  function rango(clave) {
    const ahora = Date.now();
    const hoy = new Date(ahora);
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    let inicio = inicioHoy - 6 * DIA;
    let fin = ahora + 1;
    if (clave === '30d') inicio = inicioHoy - 29 * DIA;
    if (clave === 'mes') inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
    if (clave === 'mesAnterior') {
      inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).getTime();
      fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
    }
    return { inicio, fin, hastaHoy: fin > ahora };
  }

  /** Hora de inicio de un turno a partir de su nombre: "Turno 3 (00:00 - 08:00)" → 0. */
  const horaInicio = (turno) => { const m = /\((\d{1,2}):/.exec(turno); return m ? Number(m[1]) : 99; };
  const nombreCorto = (turno) => String(turno).replace(/\s*\(.*\)/, '');
  const franja = (turno) => { const m = /\(([^)]*)\)/.exec(turno); return m ? m[1] : ''; };

  function kpi(titulo, valor, sub) {
    return el('div', { className: 'glass-panel rounded-xl p-5' }, [
      el('p', { className: 'text-[11px] font-bold tracking-wide text-slate-400 uppercase', text: titulo }),
      el('p', { className: 'mt-1 text-2xl font-black text-white', text: valor }),
      el('p', { className: 'mt-1 text-[11px] text-slate-500', text: sub }),
    ]);
  }

  function vacio(tbody, columnas, texto) {
    tbody.replaceChildren(el('tr', null, [el('td', { className: 'empty', text: texto, attrs: { colspan: String(columnas) } })]));
  }

  function dibujar() {
    const { inicio, fin, hastaHoy } = rango(periodo);
    $('#ac-periodo-rango').textContent = `${ddmm(inicio)} al ${hastaHoy ? 'hoy' : ddmm(fin - 1)}`;

    const enPeriodo = (r) => { const t = ms(r.fecha); return t >= inicio && t < fin; };
    const turnos = store.todos('produccion').filter(enPeriodo);
    const despachos = store.todos('despachosAceite').filter(enPeriodo);
    const kgDe = SoyaCore.views.despachoAceite.kgDe;

    const aceite = turnos.reduce((s, r) => s + (Number(r.aceite) || 0), 0);
    const expeller = turnos.reduce((s, r) => s + (Number(r.expeller) || 0), 0);
    const despKg = despachos.reduce((s, r) => s + kgDe(r), 0);
    const operadoresDistintos = new Set(turnos.map((r) => String(r.operador || SIN_OPERADOR).trim().toLowerCase())).size;

    $('#ac-kpis').replaceChildren(
      kpi('Aceite producido', fmt.litros(aceite), `${turnos.length} cierre${turnos.length === 1 ? '' : 's'} de turno`),
      kpi('Promedio por turno', turnos.length ? fmt.litros(aceite / turnos.length) : '—', `${operadoresDistintos} operador${operadoresDistintos === 1 ? '' : 'es'}`),
      kpi('Expeller producido', fmt.kg(expeller), 'según los cierres de turno'),
      kpi('Aceite despachado', fmt.kg(despKg), `${despachos.length} camión${despachos.length === 1 ? '' : 'es'} (≈ ${fmt.entero(despKg / SoyaCore.config.densidadAceite)} L)`),
    );

    // ---- Por operador ----
    const porOperador = new Map();
    turnos.forEach((r) => {
      const nombre = String(r.operador || '').trim() || SIN_OPERADOR;
      const clave = nombre.toLowerCase();
      const o = porOperador.get(clave) || { nombre, turnos: 0, aceite: 0, expeller: 0 };
      o.turnos++;
      o.aceite += Number(r.aceite) || 0;
      o.expeller += Number(r.expeller) || 0;
      porOperador.set(clave, o);
    });
    const operadores = [...porOperador.values()].sort((a, b) => b.aceite - a.aceite);
    const maximo = Math.max(1, ...operadores.map((o) => o.aceite));
    if (!operadores.length) vacio($('#ac-operadores'), 5, 'No hay cierres de turno en este período.');
    else $('#ac-operadores').replaceChildren(...operadores.map((o) => {
      const barra = el('span', { className: 'block h-1.5 rounded-full bg-brand-500' });
      barra.style.width = Math.max((o.aceite / maximo) * 100, 2) + '%';
      return el('tr', null, [
        el('td', { className: 'font-semibold ' + (o.nombre === SIN_OPERADOR ? 'text-slate-500 italic' : 'text-slate-200'), text: o.nombre }),
        el('td', { className: 'num', text: fmt.entero(o.turnos) }),
        el('td', null, [
          el('div', { className: 'flex items-center gap-3' }, [
            el('span', { className: 'w-16 shrink-0 text-right tabular-nums', text: fmt.entero(o.aceite) }),
            el('span', { className: 'block h-1.5 flex-1 rounded-full bg-slate-800' }, [barra]),
          ]),
        ]),
        el('td', { className: 'num', text: fmt.entero(o.aceite / o.turnos) }),
        el('td', { className: 'num', text: fmt.entero(o.expeller) }),
      ]);
    }));

    // ---- Por turno (franja horaria) ----
    const nombresTurno = [...new Set([...SoyaCore.config.turnos, ...turnos.map((r) => r.turno)])].sort((a, b) => horaInicio(a) - horaInicio(b));
    $('#ac-turnos').replaceChildren(...nombresTurno.map((nt) => {
      const deEse = turnos.filter((r) => r.turno === nt);
      const total = deEse.reduce((s, r) => s + (Number(r.aceite) || 0), 0);
      return el('tr', null, [
        el('td', null, [el('span', { className: 'font-semibold text-slate-200', text: nombreCorto(nt) }), el('span', { className: 'ml-2 text-[11px] text-slate-500', text: franja(nt) })]),
        el('td', { className: 'num', text: fmt.entero(deEse.length) }),
        el('td', { className: 'num', text: fmt.entero(total) }),
        el('td', { className: 'num', text: deEse.length ? fmt.entero(total / deEse.length) : '-' }),
      ]);
    }));

    // ---- Turno por turno (día × turno) ----
    $('#ac-grilla-cabecera').replaceChildren(el('tr', null, [
      el('th', { text: 'Día', attrs: { scope: 'col' } }),
      ...nombresTurno.map((nt) => el('th', { attrs: { scope: 'col' } }, [
        el('span', { className: 'block', text: nombreCorto(nt) }),
        el('span', { className: 'block text-[10px] font-normal text-slate-500', text: franja(nt) }),
      ])),
      el('th', { className: 'num', text: 'Total del día (L)', attrs: { scope: 'col' } }),
    ]));

    const porDia = new Map();
    turnos.forEach((r) => {
      const d = String(r.fecha).slice(0, 10);
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(r);
    });
    const dias = [...porDia.keys()].sort().reverse();
    if (!dias.length) { vacio($('#ac-grilla'), nombresTurno.length + 2, 'No hay cierres de turno en este período.'); return; }
    $('#ac-grilla').replaceChildren(...dias.map((d) => {
      const registros = porDia.get(d);
      const f = new Date(ms(d + ' 00:00'));
      const celdas = nombresTurno.map((nt) => {
        const enTurno = registros.filter((r) => r.turno === nt);
        if (!enTurno.length) return el('td', { className: 'text-slate-600', text: '—' });
        return el('td', { className: 'align-top' }, enTurno.map((r) => el('div', { className: 'py-0.5' }, [
          el('span', { className: 'block font-semibold ' + (r.operador ? 'text-slate-200' : 'text-slate-500 italic'), text: r.operador || SIN_OPERADOR }),
          el('span', { className: 'block text-xs text-brand-300 tabular-nums', text: `${fmt.entero(r.aceite)} L` }),
          el('span', { className: 'block text-[10px] text-slate-500 tabular-nums', text: `expeller ${fmt.kg(r.expeller)}` }),
        ])));
      });
      const total = registros.reduce((s, r) => s + (Number(r.aceite) || 0), 0);
      return el('tr', null, [
        el('td', { className: 'align-top font-semibold text-slate-300', text: `${DIAS[f.getDay()]} ${ddmm(f.getTime())}` }),
        ...celdas,
        el('td', { className: 'num align-top font-semibold text-brand-300', text: fmt.entero(total) }),
      ]);
    }));
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.aceite = {
    init() {
      $$('#view-aceite [data-periodo]').forEach((b) => b.addEventListener('click', () => {
        periodo = b.dataset.periodo;
        $$('#view-aceite [data-periodo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        dibujar();
      }));
      store.alCambiar((c) => ['produccion', 'despachosAceite', '*'].includes(c) && !$('#view-aceite').hidden && dibujar());
    },
    refresh: dibujar,
  };
})(window.SoyaCore = window.SoyaCore || {});
