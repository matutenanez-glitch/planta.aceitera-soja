/*
 * Vista: Estado de Equipos.
 *
 * Un pantallazo por lugar (Línea 1, Línea 2, Tanques de aceite, Exteriores):
 * cuántos equipos están operativos, con observaciones o fuera de servicio, cuándo
 * fue el último mantenimiento del lugar y, equipo por equipo, lo último que se le
 * hizo. Al tocar un equipo se ve su historial y se puede registrar un mantenimiento.
 * A la derecha, lo pendiente para el próximo sábado (día de mantenimiento).
 */
(function (SoyaCore) {
  'use strict';

  const { $, el } = SoyaCore.ui;
  const store = SoyaCore.store;
  const planta = SoyaCore.planta;
  const { estadosEquipo: estados } = SoyaCore.config;
  const icons = SoyaCore.icons;
  const parse = SoyaCore.ui.fechaMs;

  const ESTILO = {
    operativo:     { chip: 'chip-operativo',     icono: 'circle-check', texto: 'text-emerald-300' },
    observaciones: { chip: 'chip-observaciones', icono: 'circle-alert', texto: 'text-amber-300' },
    fuera:         { chip: 'chip-fuera',         icono: 'circle-x',     texto: 'text-red-300' },
    sin:           { chip: 'chip-sin',           icono: 'info',         texto: 'text-slate-400' },
  };
  const ORDEN_ESTADOS = ['operativo', 'observaciones', 'fuera', 'sin'];
  const etiquetaEstado = (e) => (e === 'sin' ? 'Sin registros' : estados[e].etiqueta);
  const PLURAL = { operativo: 'operativos', observaciones: 'con observaciones', fuera: 'fuera de servicio', sin: 'sin registros' };

  /** Equipos con registros que ya no están en config.lugares (nombres viejos sin equivalencia). */
  const OTROS = '_otros';
  const NOMBRE_OTROS = 'Otros equipos con registros (ya no están en la lista)';

  let filtro = 'todos';
  let abierto = null; // clave del equipo cuyo historial está abierto

  function chipEstado(estado, extraClase) {
    const st = ESTILO[estado];
    return el('span', { className: `chip ${st.chip} ${extraClase || ''}` }, [
      el('i', { attrs: { 'data-lucide': st.icono }, className: 'h-3 w-3' }),
      el('span', { text: etiquetaEstado(estado) }),
    ]);
  }

  /** Días de calendario entre la fecha y hoy (algo de ayer a las 23:00 es "ayer", no "hoy"). */
  function haceDias(ms) {
    const medianoche = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    const dias = Math.round((medianoche(Date.now()) - medianoche(ms)) / 86400000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return `hace ${dias} días`;
  }
  const fechaCorta = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}`;
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const conDia = (f) => `${DIAS[new Date(parse(f)).getDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`;
  const intervenciones = (n) => `${n} intervención${n === 1 ? '' : 'es'}`;

  /** Estado de cada equipo según su historial, agrupado por lugar. */
  function calcularEstados() {
    const porClave = new Map();
    store.todos('mantenimiento').forEach((r) => {
      const k = planta.claveDe(r);
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(r);
    });
    const item = (clave, nombre, lugar, lugarNombre, tipo) => {
      const historial = (porClave.get(clave) || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      const ultimo = historial[historial.length - 1] || null;
      return {
        clave, nombre, lugar, lugarNombre, tipo, historial, ultimo,
        completo: lugar === OTROS ? nombre : `${lugarNombre} · ${nombre}`,
        estado: ultimo ? SoyaCore.views.mantenimiento.estadoDe(ultimo) : 'sin',
        ultimoMs: ultimo ? parse(ultimo.fecha) : null,
      };
    };
    const lugares = planta.lugares().map((l) => ({
      id: l.id,
      nombre: l.nombre,
      equipos: l.equipos.map((e) => item(e.id, e.nombre, l.id, l.nombre, e.tipo)),
    }));
    const otros = [...porClave.keys()].filter((k) => k.startsWith('otro:')).sort()
      .map((k) => item(k, k.slice(5) || '-', OTROS, NOMBRE_OTROS, porClave.get(k)[0].tipo || ''));
    if (otros.length) lugares.push({ id: OTROS, nombre: NOMBRE_OTROS, equipos: otros });
    return lugares;
  }
  const todos = (lugares) => lugares.flatMap((l) => l.equipos);

  function dibujarFiltros(lista) {
    const cuenta = (k) => (k === 'todos' ? lista.length : lista.filter((e) => e.estado === k).length);
    const opciones = [['todos', 'Todos'], ['operativo', 'Operativos'], ['observaciones', 'Con observaciones'], ['fuera', 'Fuera de servicio'], ['sin', 'Sin registros']];
    $('#eq-filtros').replaceChildren(...opciones.map(([k, nombre]) => {
      const b = el('button', { className: 'seg', text: `${nombre} (${cuenta(k)})`, attrs: { type: 'button', 'aria-pressed': String(filtro === k), 'data-filtro': k } });
      b.addEventListener('click', () => { filtro = k; dibujar(); });
      return b;
    }));
  }

  /** Fila de un equipo: nombre, estado, último mantenimiento y qué se hizo. */
  function fila(e) {
    const st = ESTILO[e.estado];
    const nombre = el('button', {
      className: 'text-left font-semibold text-slate-100 hover:text-brand-300 hover:underline',
      text: e.nombre,
      attrs: { type: 'button', 'data-equipo': e.clave, 'aria-label': `${e.completo}: ${etiquetaEstado(e.estado)}. Ver historial` },
    });
    return el('tr', { className: 'cursor-pointer', attrs: { 'data-equipo': e.clave } }, [
      el('td', { className: 'min-w-44 whitespace-normal' }, [nombre]),
      el('td', null, [chipEstado(e.estado)]),
      el('td', { className: 'tabular-nums ' + (e.ultimo ? 'text-slate-300' : 'text-slate-500'), text: e.ultimo ? `${fechaCorta(e.ultimo.fecha)} · ${haceDias(e.ultimoMs)}` : '-' }),
      el('td', { className: 'max-w-64 truncate ' + (e.ultimo ? st.texto : 'text-slate-500'), text: e.ultimo ? e.ultimo.tarea : '-', attrs: { title: e.ultimo ? e.ultimo.tarea : '' } }),
    ]);
  }

  /** Panel de un lugar: resumen arriba y la lista de sus equipos. */
  function panelLugar(l) {
    const visibles = l.equipos.filter((e) => filtro === 'todos' || e.estado === filtro);
    if (!visibles.length) return null;
    const cuenta = Object.fromEntries(ORDEN_ESTADOS.map((k) => [k, l.equipos.filter((e) => e.estado === k).length]));
    const registros = l.equipos.flatMap((e) => e.historial);
    const ultimo = registros.reduce((m, r) => (!m || String(r.fecha) > String(m.fecha) ? r : m), null);
    const alerta = cuenta.fuera ? 'ring-1 ring-red-500/50' : cuenta.observaciones ? 'ring-1 ring-amber-400/40' : '';

    const resumen = el('div', { className: 'mt-3 flex flex-wrap items-center gap-2' }, ORDEN_ESTADOS.filter((k) => cuenta[k]).map((k) =>
      el('span', { className: `chip ${ESTILO[k].chip}` }, [
        el('i', { attrs: { 'data-lucide': ESTILO[k].icono }, className: 'h-3 w-3' }),
        el('span', { text: `${cuenta[k]} ${cuenta[k] === 1 && k === 'operativo' ? 'operativo' : PLURAL[k]}` }),
      ])));

    const tabla = el('div', { className: 'mt-4 overflow-x-auto' }, [
      el('table', { className: 'data-table' }, [
        el('thead', null, [el('tr', null, [
          el('th', { attrs: { scope: 'col' }, text: 'Equipo' }),
          el('th', { attrs: { scope: 'col' }, text: 'Estado' }),
          el('th', { attrs: { scope: 'col' }, text: 'Último mantenimiento' }),
          el('th', { attrs: { scope: 'col' }, text: 'Qué se hizo' }),
        ])]),
        el('tbody', null, visibles.map(fila)),
      ]),
    ]);

    return el('section', { className: `glass-panel rounded-2xl p-5 ${alerta}`, attrs: { 'aria-label': l.nombre, 'data-lugar': l.id } }, [
      el('div', { className: 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1' }, [
        el('h3', { className: 'text-base font-bold text-white', text: l.nombre }),
        el('p', { className: 'text-xs text-slate-400', attrs: { 'data-resumen': '' }, text: [
          `${l.equipos.length} equipo${l.equipos.length === 1 ? '' : 's'}`,
          ultimo ? `último mantenimiento: ${conDia(ultimo.fecha)} (${haceDias(parse(ultimo.fecha))})` : 'sin mantenimientos cargados',
          registros.length ? intervenciones(registros.length) : '',
        ].filter(Boolean).join(' · ') }),
      ]),
      resumen,
      tabla,
    ]);
  }

  function dibujarLugares(lugares) {
    const bloques = lugares.map(panelLugar).filter(Boolean);
    $('#eq-grupos').replaceChildren(...(bloques.length ? bloques : [el('p', { className: 'text-sm text-slate-500 italic', text: 'No hay equipos con ese estado.' })]));
  }

  /** Próximo sábado (o hoy, si hoy es sábado). */
  function proximoDiaMantenimiento() {
    const d = new Date();
    const falta = (SoyaCore.config.diaMantenimiento - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + falta);
    return { fecha: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, esHoy: falta === 0 };
  }

  function itemLista(e, texto, chip) {
    const b = el('button', { className: 'flex w-full flex-col items-start gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/60', attrs: { type: 'button', 'data-equipo': e.clave } }, [
      el('span', { className: 'text-[11px] text-slate-500', text: e.lugar === OTROS ? 'Otros' : e.lugarNombre }),
      el('span', { className: 'font-semibold text-slate-200', text: e.nombre }),
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
      .filter((e) => e.lugar !== OTROS && e.estado !== 'fuera' && e.estado !== 'observaciones')
      .sort((a, b) => (a.ultimoMs ?? -Infinity) - (b.ultimoMs ?? -Infinity))
      .slice(0, 5);
    $('#eq-antiguos').replaceChildren(...antiguos.map((e) => itemLista(e, e.ultimo ? `último: ${fechaCorta(e.ultimo.fecha)} (${haceDias(e.ultimoMs)})` : 'nunca registrado', el('span'))));
    icons.render($('#view-equipos aside'));
  }

  function dibujar() {
    const lugares = calcularEstados();
    const lista = todos(lugares);
    dibujarFiltros(lista);
    dibujarLugares(lugares);
    dibujarSabado(lista);
    icons.render($('#eq-grupos'));
    if (abierto && $('#eq-dialogo').open) abrir(abierto); // refrescar el historial abierto
  }

  // ---------- Historial de un equipo ----------
  function abrir(clave) {
    const e = todos(calcularEstados()).find((x) => x.clave === clave);
    if (!e) return;
    abierto = clave;
    $('#eq-dialogo-titulo').textContent = e.nombre;
    $('#eq-dialogo-sub').textContent = [
      e.lugar === OTROS ? 'Ya no está en la lista de equipos' : e.lugarNombre,
      e.lugar === OTROS ? '' : planta.etiquetaTipo(e.tipo),
      intervenciones(e.historial.length),
      e.ultimo ? `último mantenimiento ${haceDias(e.ultimoMs)}` : '',
    ].filter(Boolean).join(' · ');
    $('#eq-dialogo-estado').replaceWith(Object.assign(chipEstado(e.estado), { id: 'eq-dialogo-estado' }));
    $('#eq-dialogo-registrar').hidden = e.lugar === OTROS;
    $('#eq-dialogo-historial').replaceChildren(...(e.historial.length
      ? e.historial.slice().reverse().map((r) => el('li', { className: 'rounded-xl border border-slate-800 bg-slate-950/40 p-3' }, [
          el('div', { className: 'flex flex-wrap items-center justify-between gap-2' }, [
            el('span', { className: 'font-mono text-[11px] text-slate-500 tabular-nums', text: r.fecha }),
            chipEstado(SoyaCore.views.mantenimiento.estadoDe(r)),
          ]),
          el('p', { className: 'mt-1.5 font-semibold text-slate-200', text: r.tarea }),
          el('p', { className: 'mt-0.5 text-xs text-slate-400', text: `Repuestos: ${SoyaCore.views.mantenimiento.textoRepuestos(r)}` }),
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
        const clave = abierto;
        $('#eq-dialogo').close();
        SoyaCore.navegar('mantenimiento');
        SoyaCore.views.mantenimiento.nuevoPara(clave);
      });
      store.alCambiar((c) => (c === 'mantenimiento' || c === '*') && dibujar());
      dibujar();
    },
    refresh: dibujar,
  };
})(window.SoyaCore = window.SoyaCore || {});
