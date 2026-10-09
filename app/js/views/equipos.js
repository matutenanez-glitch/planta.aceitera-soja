/*
 * Vista: Estado de Equipos.
 *
 * Una tarjeta por equipo (prensas, extrusores, reductores, bombas) con el
 * estado en que quedó en su último mantenimiento, qué se hizo y hace cuánto.
 * Al tocar una tarjeta se ve el historial y se puede registrar un mantenimiento.
 * A la derecha, lo pendiente para el próximo sábado (día de mantenimiento).
 */
(function (SoyaCore) {
  'use strict';

  const { $, el } = SoyaCore.ui;
  const store = SoyaCore.store;
  const { equipos, estadosEquipo: estados } = SoyaCore.config;
  const icons = SoyaCore.icons;
  const parse = (f) => SoyaCore.circuito.parseFecha(f);

  const ESTILO = {
    operativo:     { tarjeta: 'estado-operativo',     chip: 'chip-operativo',     icono: 'circle-check' },
    observaciones: { tarjeta: 'estado-observaciones', chip: 'chip-observaciones', icono: 'circle-alert' },
    fuera:         { tarjeta: 'estado-fuera',         chip: 'chip-fuera',         icono: 'circle-x' },
    sin:           { tarjeta: 'estado-sin',           chip: 'chip-sin',           icono: 'info' },
  };
  const etiquetaEstado = (e) => (e === 'sin' ? 'Sin registros' : estados[e].etiqueta);

  let filtro = 'todos';
  let abierto = null; // { tipo, equipo }

  function chipEstado(estado, extraClase) {
    const st = ESTILO[estado];
    const chip = el('span', { className: `chip ${st.chip} ${extraClase || ''}` }, [
      el('i', { attrs: { 'data-lucide': st.icono }, className: 'h-3 w-3' }),
      el('span', { text: etiquetaEstado(estado) }),
    ]);
    return chip;
  }

  function haceDias(ms) {
    const dias = Math.floor((Date.now() - ms) / 86400000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'hace 1 día';
    return `hace ${dias} días`;
  }
  const fechaCorta = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}`;

  /** Estado de cada equipo según su historial. */
  function calcularEstados() {
    const porEquipo = {};
    store.todos('mantenimiento').forEach((r) => (porEquipo[r.equipo] = porEquipo[r.equipo] || []).push(r));
    const lista = [];
    Object.entries(equipos).forEach(([tipo, def]) => {
      def.lista.forEach((equipo) => {
        const historial = (porEquipo[equipo] || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
        const ultimo = historial[historial.length - 1] || null;
        lista.push({
          tipo,
          equipo,
          historial,
          ultimo,
          estado: ultimo ? SoyaCore.views.mantenimiento.estadoDe(ultimo) : 'sin',
          ultimoMs: ultimo ? parse(ultimo.fecha) : null,
        });
      });
    });
    return lista;
  }

  function tarjeta(e) {
    const st = ESTILO[e.estado];
    const lineas = e.ultimo
      ? [
          el('p', { className: 'text-[11px] text-slate-400', text: `${fechaCorta(e.ultimo.fecha)} · ${haceDias(e.ultimoMs)}` }),
          el('p', { className: 'truncate text-xs text-slate-300', text: e.ultimo.tarea, attrs: { title: e.ultimo.tarea } }),
          el('p', { className: 'text-[10px] text-slate-500', text: `${e.historial.length} intervención${e.historial.length === 1 ? '' : 'es'}` }),
        ]
      : [el('p', { className: 'text-[11px] text-slate-500 italic', text: 'Todavía no tiene mantenimientos cargados.' })];
    return el('button', {
      className: `equipo-card ${st.tarjeta}`,
      attrs: { type: 'button', 'data-equipo': e.equipo, 'aria-label': `${e.equipo}: ${etiquetaEstado(e.estado)}. Ver historial` },
    }, [
      el('div', { className: 'flex items-start justify-between gap-2' }, [
        el('span', { className: 'text-sm leading-snug font-bold break-words text-white', text: e.equipo }),
      ]),
      chipEstado(e.estado, 'self-start'),
      ...lineas,
    ]);
  }

  function dibujarFiltros(lista) {
    const cuenta = (k) => (k === 'todos' ? lista.length : lista.filter((e) => e.estado === k).length);
    const opciones = [['todos', 'Todos'], ['operativo', 'Operativos'], ['observaciones', 'Con observaciones'], ['fuera', 'Fuera de servicio'], ['sin', 'Sin registros']];
    $('#eq-filtros').replaceChildren(...opciones.map(([k, nombre]) => {
      const b = el('button', { className: 'seg', text: `${nombre} (${cuenta(k)})`, attrs: { type: 'button', 'aria-pressed': String(filtro === k), 'data-filtro': k } });
      b.addEventListener('click', () => { filtro = k; dibujar(); });
      return b;
    }));
  }

  function dibujarGrupos(lista) {
    const grupos = Object.entries(equipos).map(([tipo, def]) => {
      const items = lista.filter((e) => e.tipo === tipo && (filtro === 'todos' || e.estado === filtro));
      if (!items.length) return null;
      const fuera = items.filter((e) => e.estado === 'fuera').length;
      return el('section', { attrs: { 'aria-label': def.etiqueta } }, [
        el('h3', { className: 'mb-3 flex items-baseline gap-2 text-sm font-bold tracking-wide text-slate-300 uppercase' }, [
          el('span', { text: def.etiqueta }),
          el('span', { className: 'text-xs font-normal tracking-normal text-slate-500 normal-case', text: `${items.length} equipo${items.length === 1 ? '' : 's'}${fuera ? ` · ${fuera} fuera de servicio` : ''}` }),
        ]),
        el('div', { className: 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3' }, items.map(tarjeta)),
      ]);
    }).filter(Boolean);
    $('#eq-grupos').replaceChildren(...(grupos.length ? grupos : [el('p', { className: 'text-sm text-slate-500 italic', text: 'No hay equipos con ese estado.' })]));
  }

  /** Próximo sábado (o hoy, si hoy es sábado). */
  function proximoDiaMantenimiento() {
    const d = new Date();
    const falta = (SoyaCore.config.diaMantenimiento - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + falta);
    return { fecha: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, esHoy: falta === 0 };
  }

  function itemLista(e, texto, chip) {
    const b = el('button', { className: 'flex w-full flex-col items-start gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/60', attrs: { type: 'button', 'data-equipo': e.equipo } }, [
      el('span', { className: 'font-semibold text-slate-200', text: e.equipo }),
      el('span', { className: 'line-clamp-2 text-[11px] text-slate-500', text: texto }),
      chip,
    ]);
    return el('li', null, [b]);
  }

  function dibujarSabado(lista) {
    const { fecha, esHoy } = proximoDiaMantenimiento();
    $('#eq-sabado-fecha').textContent = esHoy ? `Para hoy, sábado ${fecha}` : `Para el sábado ${fecha}`;

    const pendientes = lista
      .filter((e) => e.estado === 'fuera' || e.estado === 'observaciones')
      .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'fuera' ? -1 : 1));
    $('#eq-pendientes').replaceChildren(...(pendientes.length
      ? pendientes.map((e) => itemLista(e, e.ultimo.observaciones || e.ultimo.tarea, chipEstado(e.estado)))
      : [el('li', { className: 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200', text: 'Ningún equipo quedó con observaciones ni fuera de servicio.' })]));

    const antiguos = lista
      .filter((e) => e.estado !== 'fuera' && e.estado !== 'observaciones')
      .sort((a, b) => (a.ultimoMs ?? -Infinity) - (b.ultimoMs ?? -Infinity))
      .slice(0, 5);
    $('#eq-antiguos').replaceChildren(...antiguos.map((e) => itemLista(e, e.ultimo ? `último: ${fechaCorta(e.ultimo.fecha)} (${haceDias(e.ultimoMs)})` : 'nunca registrado', el('span'))));
    icons.render($('#view-equipos aside'));
  }

  function dibujar() {
    const lista = calcularEstados();
    dibujarFiltros(lista);
    dibujarGrupos(lista);
    dibujarSabado(lista);
    icons.render($('#eq-grupos'));
    if (abierto && $('#eq-dialogo').open) abrir(abierto.equipo); // refrescar el historial abierto
  }

  // ---------- Historial de un equipo ----------
  function abrir(equipo) {
    const e = calcularEstados().find((x) => x.equipo === equipo);
    if (!e) return;
    abierto = { tipo: e.tipo, equipo: e.equipo };
    $('#eq-dialogo-titulo').textContent = e.equipo;
    $('#eq-dialogo-sub').textContent = `${equipos[e.tipo].etiqueta} · ${e.historial.length} intervención${e.historial.length === 1 ? '' : 'es'}${e.ultimo ? ` · último mantenimiento ${haceDias(e.ultimoMs)}` : ''}`;
    $('#eq-dialogo-estado').replaceWith(Object.assign(chipEstado(e.estado), { id: 'eq-dialogo-estado' }));
    $('#eq-dialogo-historial').replaceChildren(...(e.historial.length
      ? e.historial.slice().reverse().map((r) => el('li', { className: 'rounded-xl border border-slate-800 bg-slate-950/40 p-3' }, [
          el('div', { className: 'flex flex-wrap items-center justify-between gap-2' }, [
            el('span', { className: 'font-mono text-[11px] text-slate-500 tabular-nums', text: r.fecha }),
            chipEstado(SoyaCore.views.mantenimiento.estadoDe(r)),
          ]),
          el('p', { className: 'mt-1.5 font-semibold text-slate-200', text: r.tarea }),
          el('p', { className: 'mt-0.5 text-xs text-slate-400', text: `Repuestos: ${r.repuestos || 'Ninguno'}` }),
          r.observaciones ? el('p', { className: 'mt-0.5 text-xs text-slate-400', text: `Observaciones: ${r.observaciones}` }) : null,
        ]))
      : [el('li', { className: 'text-sm text-slate-500 italic', text: 'Sin mantenimientos cargados para este equipo.' })]));
    icons.render($('#eq-dialogo'));
    if (!$('#eq-dialogo').open) $('#eq-dialogo').showModal();
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.equipos = {
    init() {
      $('#view-equipos').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-equipo]');
        if (b && !b.closest('dialog')) abrir(b.dataset.equipo);
      });
      $('#eq-dialogo-cerrar').addEventListener('click', () => $('#eq-dialogo').close());
      $('#eq-dialogo').addEventListener('close', () => { abierto = null; });
      $('#eq-dialogo').addEventListener('click', (ev) => { if (ev.target === $('#eq-dialogo')) $('#eq-dialogo').close(); }); // clic afuera
      $('#eq-dialogo-registrar').addEventListener('click', () => {
        const { tipo, equipo } = abierto;
        $('#eq-dialogo').close();
        SoyaCore.navegar('mantenimiento');
        SoyaCore.views.mantenimiento.nuevoPara(tipo, equipo);
      });
      store.alCambiar((c) => (c === 'mantenimiento' || c === '*') && dibujar());
      dibujar();
    },
    refresh: dibujar,
  };
})(window.SoyaCore = window.SoyaCore || {});
