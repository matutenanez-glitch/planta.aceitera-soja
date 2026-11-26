/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 *
 * Recepción (2.26): cada camión tiene una FICHA con sus viajes, uno abajo del otro
 * (escalones). En cada viaje el camión pasa dos veces por la balanza: lleno (bruto)
 * y vacío (tara), en cualquier orden, y cada peso se escribe ahí mismo en su
 * escalón. Con "+ Agregar viaje" se suma el siguiente (con su propia tara). La
 * ficha queda abierta hasta "Terminar", que la cierra y saca un solo PDF con todos
 * los viajes. Cada ficha es de un solo camión: los viajes se atan por `ficha` (el
 * id de la ficha), así no se mezclan aunque vengan varios camiones el mismo día.
 *
 * Cada viaje es un registro (así los totales, la secadora y el resumen no cambian):
 *   ficha       id de la ficha del camión (los registros viejos no tienen: su ficha es su id)
 *   terminado   true en el último viaje cuando se tocó "Terminar"
 *   fechaTara   hora de la tara; fechaBruto: hora del bruto si se pesó después de la tara
 * La humedad es opcional. Mientras falta un peso, el viaje no suma a los totales.
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt, num, hoy, ahora, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;

  /** Un ingreso es de soja si su carga dice "soja" (o no tiene carga: datos viejos). */
  const esSoja = (c) => String(c.carga || 'Soja').toLowerCase().includes('soja');
  const tieneHumedad = (c) => c.humedad != null && c.humedad !== '' && !isNaN(Number(c.humedad));
  /** Viaje al que todavía le falta un peso (no tiene neto). */
  const enPlanta = (c) => c.neto == null || c.neto === '' || isNaN(Number(c.neto));
  /** Se pesó primero vacío: tiene la tara y le falta el bruto. */
  const faltaBruto = (c) => enPlanta(c) && !(Number(c.bruto) > 0) && Number(c.tara) > 0;
  const hhmm = (f) => String(f || '').slice(11, 16);
  const diaDe = (r) => String(r.fecha).slice(0, 10);
  const horaCorta = (f) => (diaDe({ fecha: f }) === hoy() ? hhmm(f) : `${String(f).slice(8, 10)}/${String(f).slice(5, 7)} ${hhmm(f)}`);
  const porFecha = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id));

  // ---------- Fichas: los viajes de cada camión ----------
  const fichaDe = (r) => r.ficha || r.id;
  const nuevaFicha = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /** Todos los viajes de la ficha de r (con r), en orden. */
  function viajesDe(r) {
    if (!r) return [];
    const f = fichaDe(r);
    return store.todos('ingresos').filter((c) => fichaDe(c) === f).sort(porFecha);
  }
  const completos = (viajes) => viajes.filter((v) => !enPlanta(v));
  const netoDe = (viajes) => viajes.reduce((s, v) => s + (Number(v.neto) || 0), 0);
  const textoViajes = (n) => (n === 1 ? '1 viaje' : `${n} viajes`);

  /**
   * Fichas abiertas (camiones en planta) y terminadas hoy. Una ficha nueva queda
   * abierta hasta "Terminar"; un registro viejo (sin ficha) solo mientras le falta un peso.
   */
  function fichas() {
    const grupos = new Map();
    store.todos('ingresos').forEach((c) => {
      const f = fichaDe(c);
      if (!grupos.has(f)) grupos.set(f, []);
      grupos.get(f).push(c);
    });
    const abiertas = [];
    const terminadas = [];
    grupos.forEach((viajes) => {
      viajes.sort(porFecha);
      const ultimo = viajes[viajes.length - 1];
      const nueva = viajes.some((v) => v.ficha);
      if (nueva ? !ultimo.terminado : viajes.some(enPlanta)) abiertas.push(viajes);
      else if (nueva && viajes.some((v) => diaDe(v) === hoy())) terminadas.push(viajes);
    });
    abiertas.sort((a, b) => porFecha(a[0], b[0]));
    terminadas.sort((a, b) => porFecha(b[b.length - 1], a[a.length - 1]));
    return { abiertas, terminadas };
  }

  /** Humedad promedio de varios camiones, ponderada por los kg de cada uno. */
  function humedadPonderada(camiones) {
    const conDato = camiones.filter(tieneHumedad);
    const kg = conDato.reduce((s, c) => s + (Number(c.neto) || 0), 0);
    if (!conDato.length) return null;
    if (!kg) return conDato.reduce((s, c) => s + Number(c.humedad), 0) / conDato.length;
    return conDato.reduce((s, c) => s + Number(c.humedad) * (Number(c.neto) || 0), 0) / kg;
  }

  const abrirComprobante = (r) => SoyaCore.comprobantes.abrirPesada(r);
  const icono = (nombre, clase) => el('i', { attrs: { 'data-lucide': nombre }, className: clase || 'h-3.5 w-3.5' });

  // ---------- Panel del día ----------
  function actualizarHoy() {
    const deHoy = store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()));
    const soja = deHoy.filter((c) => esSoja(c) && !enPlanta(c));
    $('#rec-hoy-kg').textContent = fmt.kg(soja.reduce((s, c) => s + (Number(c.neto) || 0), 0));
    $('#rec-hoy-camiones').textContent = fmt.entero(soja.length);
    $('#rec-hoy-humedad').textContent = fmt.porcentaje(humedadPonderada(soja));
    dibujarEnPlanta();
  }

  const COLORES = ['border-l-sky-400', 'border-l-emerald-400', 'border-l-violet-400', 'border-l-amber-400', 'border-l-rose-400'];
  const borradores = new Set(); // fichas con un viaje nuevo todavía sin guardar
  const COLS = 'grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_7rem] items-center gap-2';
  const patenteChip = (c) => (c.patente ? el('span', { className: 'rounded border border-slate-600 px-1.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase', text: c.patente }) : null);
  const kgTexto = (v) => el('span', { className: 'tabular-nums text-slate-200', text: fmt.kg(v) });
  const campo = (clave, etiqueta, extra) => el('input', {
    className: 'field px-2 py-1.5 text-sm tabular-nums',
    attrs: Object.assign({ type: 'number', min: '1', step: '1', inputmode: 'numeric', 'aria-label': etiqueta, placeholder: etiqueta, 'data-clave': clave }, extra || {}),
  });

  /** Escalón de un viaje completo. */
  function filaLista(v, n) {
    return el('div', { className: `${COLS} px-3 py-2 text-sm`, attrs: { 'data-viaje': v.id } }, [
      el('span', { className: 'text-xs text-slate-400' }, [el('b', { className: 'text-slate-200', text: `Viaje ${n}` }), el('br'), el('span', { text: horaCorta(v.fecha) })]),
      kgTexto(v.bruto),
      kgTexto(v.tara),
      el('span', { className: 'text-xs text-slate-400 tabular-nums', text: tieneHumedad(v) ? fmt.porcentaje(v.humedad) : '-' }),
      el('span', { className: 'flex items-center justify-end gap-1 font-bold text-brand-300 tabular-nums' }, [el('span', { text: fmt.kg(v.neto) }), icono('check', 'h-3.5 w-3.5 text-emerald-400')]),
    ]);
  }

  /** Escalón para escribir pesos: un viaje al que le falta uno, o uno nuevo (v = null). */
  function filaEditable(f, v, n, base) {
    const nuevo = !v;
    const id = nuevo ? `${f}:nuevo` : v.id;
    const conBruto = !nuevo && Number(v.bruto) > 0;
    const conTara = !nuevo && Number(v.tara) > 0;
    const falta = conBruto ? 'tara' : 'bruto';
    const bruto = conBruto ? kgTexto(v.bruto) : campo(`${id}:bruto`, 'Bruto', !nuevo ? { 'data-completar': v.id } : { 'data-nuevo': f });
    const tara = conTara ? kgTexto(v.tara) : campo(`${id}:tara`, 'Tara', !nuevo && conBruto ? { 'data-completar': v.id } : {});
    const hum = el('input', { className: 'field px-2 py-1.5 text-sm tabular-nums', attrs: { type: 'number', min: '0', max: '100', step: '0.1', inputmode: 'decimal', 'aria-label': 'Humedad (%)', placeholder: 'Hum.', 'data-clave': `${id}:hum` } });
    if (!nuevo && tieneHumedad(v)) hum.value = v.humedad;
    const guardar = el('button', { className: 'btn w-auto bg-sky-500 px-3 py-1.5 text-xs text-slate-950 hover:bg-sky-400', attrs: { type: 'submit', 'data-guardar': id } }, [el('span', { text: 'Guardar' })]);
    const acciones = [guardar];
    if (nuevo) {
      const quitar = el('button', { className: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Quitar este viaje sin guardar', 'data-quitar': f } }, [icono('x', 'h-4 w-4')]);
      quitar.addEventListener('click', () => { borradores.delete(f); dibujarEnPlanta(); });
      acciones.push(quitar);
    }
    const form = el('form', { className: `${COLS} bg-sky-500/5 px-3 py-2`, attrs: { autocomplete: 'off', 'data-viaje': id, novalidate: '' } }, [
      el('span', { className: 'text-xs text-slate-400' }, [
        el('b', { className: 'text-slate-200', text: `Viaje ${n}` }), el('br'),
        el('span', { className: 'font-semibold text-sky-300', text: nuevo ? 'nuevo' : `falta ${falta === 'tara' ? 'la tara' : 'el bruto'}` }),
      ]),
      bruto, tara, hum,
      el('span', { className: 'flex items-center justify-end gap-1' }, acciones),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (nuevo) guardarNuevo(f, base, n, form); else completar(v, n, form);
    });
    return form;
  }

  function leer(form, sufijo) {
    const i = form.querySelector(`[data-clave$=":${sufijo}"]`);
    return i ? num(i) : NaN;
  }

  /** Guarda el peso que le faltaba a un viaje. */
  function completar(v, n, form) {
    const r = store.buscar('ingresos', v.id) || v;
    const modoBruto = faltaBruto(r);
    const x = leer(form, modoBruto ? 'bruto' : 'tara');
    if (!(x > 0)) { toast(`Escribí ${modoBruto ? 'el bruto' : 'la tara'} del viaje ${n}.`, 'error'); form.querySelector('[data-completar]').focus(); return; }
    const neto = modoBruto ? x - Number(r.tara) : Number(r.bruto) - x;
    if (!(neto > 0)) { toast(modoBruto ? 'El bruto tiene que ser mayor que la tara.' : 'La tara tiene que ser menor que el bruto.', 'error'); form.querySelector('[data-completar]').focus(); return; }
    const h = leer(form, 'hum');
    const cambios = modoBruto ? { bruto: x, neto, fechaBruto: ahora() } : { tara: x, neto, fechaTara: ahora() };
    cambios.humedad = isNaN(h) ? null : h;
    const guardado = store.actualizar('ingresos', r.id, cambios);
    if (!guardado) return;
    const viajes = completos(viajesDe(guardado));
    const abierta = fichas().abiertas.some((vs) => fichaDe(vs[0]) === fichaDe(guardado));
    toast(viajes.length > 1 || abierta
      ? `Viaje ${n} completo: neto ${fmt.kg(neto)}. Total del camión: ${fmt.kg(netoDe(viajes))}.`
      : `Pesada completa: neto ${fmt.kg(neto)}.`, 'ok', abierta ? undefined : { texto: 'Comprobante', fn: () => abrirComprobante(guardado) });
  }

  /** Guarda el viaje nuevo de una ficha (con uno o los dos pesos). */
  function guardarNuevo(f, base, n, form) {
    const b = leer(form, 'bruto');
    const t = leer(form, 'tara');
    const hayB = b > 0;
    const hayT = t > 0;
    if (!hayB && !hayT) { toast(`Escribí el bruto o la tara del viaje ${n}: con uno alcanza.`, 'error'); form.querySelector('[data-nuevo]').focus(); return; }
    if (hayB && hayT && !(b - t > 0)) { toast('La tara tiene que ser menor que el bruto.', 'error'); return; }
    const h = leer(form, 'hum');
    const momento = ahora();
    borradores.delete(f);
    const nuevo = store.agregar('ingresos', {
      fecha: momento,
      ficha: f,
      empresa: base.empresa,
      conductor: base.conductor,
      patente: base.patente || '',
      carga: base.carga || 'Soja',
      humedad: isNaN(h) ? null : h,
      bruto: hayB ? b : null,
      tara: hayT ? t : null,
      neto: hayB && hayT ? b - t : null,
      fechaTara: hayT ? momento : null,
    });
    if (!nuevo) { borradores.add(f); dibujarEnPlanta(); return; }
    toast(hayB && hayT ? `Viaje ${n} guardado: neto ${fmt.kg(b - t)}.` : `Viaje ${n} guardado: falta ${hayB ? 'la tara' : 'el bruto'}.`, 'ok');
  }

  /** Terminar: cierra la ficha (tiene que tener todos los viajes completos) y saca el PDF. */
  function terminar(viajes) {
    const actuales = viajesDe(viajes[0]);
    const pendiente = actuales.findIndex(enPlanta);
    if (pendiente >= 0) {
      toast(`Al viaje ${pendiente + 1} le falta ${faltaBruto(actuales[pendiente]) ? 'el bruto' : 'la tara'}: completalo (o borralo) antes de terminar.`, 'error');
      return;
    }
    const ultimo = actuales[actuales.length - 1];
    borradores.delete(fichaDe(ultimo));
    const guardado = store.actualizar('ingresos', ultimo.id, { terminado: true });
    if (!guardado) return;
    abrirComprobante(guardado);
    toast(`Camión terminado: ${textoViajes(actuales.length)}, neto ${fmt.kg(netoDe(actuales))}.`, 'ok');
  }

  function tarjetaFicha(viajes, n) {
    const f = fichaDe(viajes[0]);
    const c = viajes[viajes.length - 1];
    const listos = completos(viajes);
    const hayPendiente = viajes.some(enPlanta);
    const filas = viajes.map((v, i) => (enPlanta(v) ? filaEditable(f, v, i + 1, c) : filaLista(v, i + 1)));
    const borrador = borradores.has(f) && !hayPendiente;
    if (borrador) filas.push(filaEditable(f, null, viajes.length + 1, c));

    const agregar = el('button', { className: 'btn-sm disabled:cursor-not-allowed disabled:opacity-40', attrs: { type: 'button', 'data-agregar-viaje': f } }, [icono('plus'), el('span', { text: 'Agregar viaje' })]);
    agregar.disabled = hayPendiente || borrador;
    agregar.title = hayPendiente ? 'Primero completá el viaje que falta' : '';
    agregar.addEventListener('click', () => {
      borradores.add(f);
      dibujarEnPlanta();
      const i = $(`[data-nuevo="${f}"]`);
      if (i) i.focus();
    });
    const pdf = el('button', { className: 'btn-sm disabled:cursor-not-allowed disabled:opacity-40', attrs: { type: 'button', 'data-comprobante': f } }, [icono('file-text'), el('span', { text: 'PDF' })]);
    pdf.disabled = !listos.length;
    pdf.addEventListener('click', () => abrirComprobante(listos[listos.length - 1]));
    // Terminar pide un segundo toque, así no se cierra por error.
    const fin = el('button', { className: 'btn w-auto bg-brand-500 px-3 py-1.5 text-xs text-slate-900 hover:bg-brand-400', attrs: { type: 'button', 'data-terminar': f } }, [el('span', { text: 'Terminar' })]);
    let armado = null;
    fin.addEventListener('click', () => {
      if (armado) { clearTimeout(armado); armado = null; terminar(viajes); return; }
      fin.firstChild.textContent = 'Tocá de nuevo para terminar';
      armado = setTimeout(() => { armado = null; fin.firstChild.textContent = 'Terminar'; }, 4000);
    });

    return el('li', { className: `rounded-xl border border-l-4 border-slate-700 bg-slate-900/70 ${COLORES[(n - 1) % COLORES.length]}`, attrs: { 'data-ficha': f } }, [
      el('div', { className: 'flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 px-3 py-2.5' }, [
        el('div', { className: 'min-w-0' }, [
          el('p', { className: 'flex flex-wrap items-center gap-2' }, [
            el('span', { className: 'chip border-slate-500 text-slate-200', text: `Camión ${n}` }),
            el('span', { className: 'truncate font-semibold text-slate-100', text: c.empresa }),
            patenteChip(c),
          ]),
          el('p', { className: 'mt-0.5 truncate text-xs text-slate-400', text: `${c.conductor || '-'} · ${c.carga || 'Soja'} · desde las ${horaCorta(viajes[0].fecha)}` }),
        ]),
        fin,
      ]),
      el('div', { className: `${COLS} px-3 pt-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase` }, [
        el('span', { text: 'Viaje' }), el('span', { text: 'Bruto (kg)' }), el('span', { text: 'Tara (kg)' }), el('span', { text: 'Hum. %' }), el('span', { className: 'text-right', text: 'Neto' }),
      ]),
      el('div', { className: 'divide-y divide-slate-800/70' }, filas),
      el('div', { className: 'flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-3 py-2.5' }, [
        agregar,
        el('span', { className: 'flex items-center gap-3' }, [
          el('span', { className: 'text-xs text-slate-400', attrs: { 'data-total': '' } }, listos.length
            ? [el('span', { text: `Total ${textoViajes(listos.length)}: ` }), el('b', { className: 'text-sm text-brand-300 tabular-nums', text: fmt.kg(netoDe(listos)) })]
            : [el('span', { text: 'Sin viajes completos' })]),
          pdf,
        ]),
      ]),
    ]);
  }

  function filaTerminada(viajes) {
    const c = viajes[viajes.length - 1];
    const pdf = el('button', { className: 'btn-sm shrink-0', attrs: { type: 'button', 'data-comprobante': fichaDe(c) } }, [icono('file-text'), el('span', { text: 'PDF' })]);
    pdf.addEventListener('click', () => abrirComprobante(c));
    const reabrir = el('button', { className: 'btn-sm shrink-0', attrs: { type: 'button', 'data-reabrir': fichaDe(c), title: 'Volver a abrir la ficha para agregar otro viaje' } }, [icono('refresh-cw'), el('span', { text: 'Reabrir' })]);
    reabrir.addEventListener('click', () => {
      if (store.actualizar('ingresos', c.id, { terminado: false })) toast(`Se volvió a abrir la ficha de ${c.empresa}${c.patente ? ' · ' + c.patente : ''}.`, 'ok');
    });
    return el('li', { className: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2', attrs: { 'data-terminada': fichaDe(c) } }, [
      el('div', { className: 'min-w-0' }, [
        el('p', { className: 'flex flex-wrap items-center gap-2 text-sm' }, [
          el('span', { className: 'truncate font-semibold text-slate-100', text: c.empresa }),
          patenteChip(c),
          el('span', { className: 'truncate text-xs text-slate-400', text: `${c.conductor || '-'} · ${c.carga || 'Soja'}` }),
        ]),
        el('p', { className: 'text-xs text-slate-300 tabular-nums', text: `${textoViajes(viajes.length)} · neto ${fmt.kg(netoDe(viajes))}` }),
      ]),
      el('div', { className: 'flex items-center gap-2' }, [pdf, reabrir]),
    ]);
  }

  const MAX_TERMINADAS = 6;
  let verTodas = false;

  function dibujarEnPlanta() {
    // Lo que se estaba escribiendo en las fichas no se pierde al redibujar.
    const escritos = {};
    $$('#rec-en-planta [data-clave]').forEach((i) => { if (i.value !== '') escritos[i.dataset.clave] = i.value; });
    const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.clave : null;

    const { abiertas, terminadas } = fichas();
    $('#rec-en-planta').hidden = !abiertas.length && !terminadas.length;
    $('#rec-en-planta-titulo').textContent = abiertas.length ? `Camiones en planta: ${abiertas.length}` : 'Camiones en planta';
    $('#rec-en-planta-lista').replaceChildren(...abiertas.map((v, i) => tarjetaFicha(v, i + 1)));
    $('#rec-pesados').hidden = !terminadas.length;
    $('#rec-pesados-lista').replaceChildren(...(verTodas ? terminadas : terminadas.slice(0, MAX_TERMINADAS)).map(filaTerminada));
    const mas = $('#rec-pesados-mas');
    mas.hidden = terminadas.length <= MAX_TERMINADAS;
    mas.textContent = verTodas ? 'Ver menos' : `Ver los ${terminadas.length}`;

    $$('#rec-en-planta [data-clave]').forEach((i) => { if (escritos[i.dataset.clave] != null && i.value === '') i.value = escritos[i.dataset.clave]; });
    if (foco) { const i = $(`#rec-en-planta [data-clave="${foco}"]`); if (i) i.focus(); }
    SoyaCore.icons.render($('#rec-en-planta'));
  }

  /** Desde la tabla: lleva al casillero del peso que falta, en la ficha del camión. */
  function irACompletar(r) {
    dibujarEnPlanta();
    const i = $(`#rec-en-planta [data-completar="${r.id}"]`);
    if (!i) return;
    i.scrollIntoView({ block: 'center', behavior: 'smooth' });
    i.focus({ preventScroll: true });
  }

  // ---------- Formularios de balanza ----------
  const netoCelda = (r) => (enPlanta(r)
    ? el('span', { className: 'chip chip-sin border-sky-400/50 text-sky-300', text: faltaBruto(r) ? 'Falta bruto' : 'Falta tara' })
    : el('span', { text: fmt.entero(r.neto) }));

  const COLUMNAS = {
    ingresos: [
      { key: 'fecha', format: (v) => `${String(v).slice(8, 10)}/${String(v).slice(5, 7)} ${String(v).slice(11, 16)}` },
      // Empresa arriba y, más chico, chofer, patente y "viaje N de M": así la tabla entra sin barra de desplazamiento.
      { key: 'empresa', className: 'max-w-56', render: (r) => el('span', { className: 'block min-w-0' }, [
        el('span', { className: 'block truncate', text: r.empresa || '-' }),
        el('span', { className: 'block truncate text-[11px] text-slate-500', text: [r.conductor, r.patente ? String(r.patente).toUpperCase() : null, ((v) => (v.length > 1 ? `viaje ${v.findIndex((x) => x.id === r.id) + 1} de ${v.length}` : null))(viajesDe(r))].filter(Boolean).join(' · ') }),
      ]) },
      { key: 'carga', format: (v) => v || 'Soja' }, // registros viejos sin carga = Soja
      { key: 'neto', render: netoCelda, className: 'num' },
      { key: 'humedad', format: (v, r) => (tieneHumedad(r) ? fmt.porcentaje(v) : '-'), className: 'num' },
    ],
    despachos: [
      { key: 'fecha' },
      { key: 'empresa' },
      { key: 'conductor' },
      { key: 'neto', format: fmt.entero, className: 'num' },
    ],
  };

  function balanza(prefijo, coleccion, formId, mensaje) {
    const recepcion = coleccion === 'ingresos';
    const form = $('#' + formId);
    const bruto = $(`#${prefijo}-bruto`);
    const tara = $(`#${prefijo}-tara`);
    const salida = $(`#${prefijo}-neto`);
    const neto = () => num(bruto) - num(tara);
    let editor;
    let fechaTaraAntes = null;
    let fechaBrutoAntes = null;

    const actualizarNeto = () => {
      if (recepcion && (bruto.value === '' || tara.value === '')) {
        salida.textContent = bruto.value !== '' ? 'Falta la tara' : tara.value !== '' ? 'Falta el bruto' : '0 kg';
      } else {
        const n = neto();
        salida.textContent = fmt.kg(n > 0 ? n : 0);
      }
      if (recepcion && (!editor || !editor.id)) {
        $('#in-enviar').textContent = bruto.value !== '' && tara.value === '' ? 'Registrar camión (falta la tara)'
          : bruto.value === '' && tara.value !== '' ? 'Registrar camión (falta el bruto)' : 'Registrar camión';
      }
    };

    bruto.addEventListener('input', actualizarNeto);
    tara.addEventListener('input', actualizarNeto);

    const tabla = tablaRegistros({
      tbody: $(`#tbody-${coleccion}`),
      caption: $(`#caption-${coleccion}`),
      coleccion,
      columnas: COLUMNAS[coleccion],
      onEditar: (r) => editor.editar(r),
      acciones: recepcion ? [
        { accion: 'tara', icono: 'scale', etiqueta: 'Cargar el peso que falta (en su ficha)', mostrar: enPlanta, fn: irACompletar },
        { accion: 'comprobante', icono: 'file-text', etiqueta: 'Comprobante PDF', mostrar: (r) => !enPlanta(r), fn: abrirComprobante },
      ] : [],
      claseFila: recepcion ? (r) => (enPlanta(r) ? 'fila-pendiente' : '') : null,
    });
    editor = editorFormulario(form, {
      tabla,
      rellenar(r) {
        $(`#${prefijo}-empresa`).value = r.empresa || '';
        $(`#${prefijo}-conductor`).value = r.conductor || '';
        // Los registros anteriores a la v2.10 solo guardaban el neto.
        bruto.value = r.bruto != null ? r.bruto : (r.tara != null ? '' : r.neto);
        tara.value = r.tara != null ? r.tara : (r.bruto != null ? '' : 0);
        if (recepcion) {
          $('#in-carga').value = r.carga || 'Soja';
          $('#in-patente').value = r.patente || '';
          $('#in-humedad').value = tieneHumedad(r) ? r.humedad : '';
          fechaTaraAntes = r.fechaTara || null;
          fechaBrutoAntes = r.fechaBruto || null;
        }
        actualizarNeto();
      },
      alTerminar: () => { fechaTaraAntes = null; fechaBrutoAntes = null; actualizarNeto(); },
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = num(bruto);
      const conBruto = !(recepcion && bruto.value === '');
      const conTara = !(recepcion && tara.value === '');
      if (recepcion && !conBruto && !conTara) {
        toast('Cargá el bruto (lleno) o la tara (vacío): con uno alcanza.', 'error');
        bruto.focus();
        return;
      }
      if (conBruto && !(b > 0)) {
        toast('Falta el peso bruto.', 'error');
        bruto.focus();
        return;
      }
      const n = neto();
      if (conBruto && conTara && !(n > 0)) {
        toast('El peso neto debe ser mayor a 0 (revisá bruto y tara).', 'error');
        tara.focus();
        return;
      }
      const registro = {
        empresa: $(`#${prefijo}-empresa`).value.trim(),
        conductor: $(`#${prefijo}-conductor`).value.trim(),
        bruto: conBruto ? b : null,
        tara: conTara ? num(tara) : null,
        neto: conBruto && conTara ? n : null,
      };
      let mensajes = { nuevo: mensaje };
      if (recepcion) {
        registro.carga = $('#in-carga').value.trim() || 'Soja';
        registro.patente = $('#in-patente').value.trim().toUpperCase();
        const h = num($('#in-humedad'));
        registro.humedad = isNaN(h) ? null : h;
        registro.fechaTara = conTara ? fechaTaraAntes || ahora() : null;
        registro.fechaBruto = conBruto ? fechaBrutoAntes : null;
        if (!editor.id) registro.ficha = nuevaFicha(); // un camión nuevo = una ficha nueva
        mensajes = { nuevo: conBruto && conTara
          ? `Camión registrado: viaje 1 con neto ${fmt.kg(n)}. Su ficha queda en "Camiones en planta".`
          : `Camión registrado: falta ${conBruto ? 'la tara' : 'el bruto'}. Se completa en su ficha, en "Camiones en planta".` };
      }
      if (guardarRegistro(coleccion, editor, registro, mensajes)) $(`#${prefijo}-empresa`).focus();
    });

    store.alCambiar((c) => {
      if (c !== coleccion && c !== '*') return;
      tabla.dibujar();
      if (recepcion) actualizarHoy();
    });
    tabla.dibujar();
    actualizarNeto();
    if (recepcion) {
      actualizarHoy();
      $('#rec-pesados-mas').addEventListener('click', () => { verTodas = !verTodas; dibujarEnPlanta(); });
    }
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.recepcion = {
    init: () => balanza('in', 'ingresos', 'form-ingreso', 'Ingreso registrado.'),
    refresh: actualizarHoy, // al entrar se recalcula "hoy"
    esSoja,
    tieneHumedad,
    enPlanta,
    faltaBruto,
    humedadPonderada,
    viajesDe,
    fichaDe,
  };
  SoyaCore.views.despacho = {
    init: () => balanza('out', 'despachos', 'form-despacho', 'Despacho registrado.'),
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
