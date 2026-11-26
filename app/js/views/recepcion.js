/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 *
 * Recepción en dos pasos: cuando llegan varios camiones, primero se pesan
 * llenos (bruto) y quedan "en planta". Cuando descargan, se pesan vacíos y se
 * carga la tara: ahí se calcula el neto y se puede sacar el comprobante en PDF.
 * La humedad (muestra de laboratorio) es opcional.
 *
 * Camión de varios viajes (2.25): si "Va a volver hoy", el camión no se cierra:
 * queda en "Camiones en curso" con "+ Otro viaje" (solo el bruto, con la misma
 * tara) y "Terminar". Cada viaje es un registro (así los totales no cambian) con
 * `vuelve: true` si después de ese viaje el camión vuelve. Los viajes de un mismo
 * camión en el mismo día (misma patente, o mismo chofer si no hay patente, y misma
 * carga) salen juntos en un solo comprobante.
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, num, hoy, ahora, fechaMs, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;

  /** Un ingreso es de soja si su carga dice "soja" (o no tiene carga: datos viejos). */
  const esSoja = (c) => String(c.carga || 'Soja').toLowerCase().includes('soja');
  const tieneHumedad = (c) => c.humedad != null && c.humedad !== '' && !isNaN(Number(c.humedad));
  /** Camión que se pesó lleno y todavía no tiene tara (no tiene neto). */
  const enPlanta = (c) => c.neto == null || c.neto === '' || isNaN(Number(c.neto));

  // ---------- La tara del mismo camión ----------
  /*
   * Un camión puede venir hasta 3 veces en el día: su tara (vacío) es la misma, así
   * que no hace falta pesarlo vacío cada vez. Se reconoce por la patente; si alguno
   * de los dos viajes no tiene patente, por el nombre del chofer.
   */
  const normal = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function mismoCamion(a, b) {
    const pa = normal(a.patente);
    const pb = normal(b.patente);
    if (pa && pb) return pa === pb;
    const ca = normal(a.conductor);
    return !!ca && ca === normal(b.conductor);
  }
  const horaDe = (r) => String(r.fechaTara || r.fecha).slice(11, 16);

  /** La última tara de hoy de ese camión (o null). */
  function taraDeHoy(datos, excluirId) {
    if (!normal(datos.patente) && !normal(datos.conductor)) return null;
    return store.todos('ingresos')
      .filter((c) => c.id !== excluirId && String(c.fecha).startsWith(hoy()) && !enPlanta(c) && Number(c.tara) > 0 && mismoCamion(c, datos))
      .sort((a, b) => String(a.fechaTara || a.fecha).localeCompare(String(b.fechaTara || b.fecha)))
      .pop() || null;
  }

  // ---------- Los viajes del mismo camión en el día ----------
  const diaDe = (r) => String(r.fecha).slice(0, 10);
  const porFecha = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id));

  /** Todos los viajes de ese camión en el día de r (con r), en orden. */
  function viajesDe(r) {
    if (!r) return [];
    if (!normal(r.patente) && !normal(r.conductor)) return [r];
    const carga = normal(r.carga || 'Soja');
    return store.todos('ingresos')
      .filter((c) => c.id === r.id || (diaDe(c) === diaDe(r) && normal(c.carga || 'Soja') === carga && mismoCamion(c, r)))
      .sort(porFecha);
  }
  const completos = (viajes) => viajes.filter((v) => !enPlanta(v));
  const netoDe = (viajes) => viajes.reduce((s, v) => s + (Number(v.neto) || 0), 0);

  /** Camiones de hoy que ya completaron un viaje y van a volver: su último viaje. */
  function vanAVolver() {
    return store.todos('ingresos')
      .filter((c) => diaDe(c) === hoy() && c.vuelve && !enPlanta(c))
      .filter((c) => { const v = viajesDe(c); return v[v.length - 1].id === c.id; })
      .sort(porFecha);
  }

  /** Humedad promedio de varios camiones, ponderada por los kg de cada uno. */
  function humedadPonderada(camiones) {
    const conDato = camiones.filter(tieneHumedad);
    const kg = conDato.reduce((s, c) => s + (Number(c.neto) || 0), 0);
    if (!conDato.length) return null;
    if (!kg) return conDato.reduce((s, c) => s + Number(c.humedad), 0) / conDato.length;
    return conDato.reduce((s, c) => s + Number(c.humedad) * (Number(c.neto) || 0), 0) / kg;
  }

  function hace(fecha) {
    const min = Math.round((Date.now() - fechaMs(fecha)) / 60000);
    if (isNaN(min)) return '';
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
    return `el ${String(fecha).slice(8, 10)}/${String(fecha).slice(5, 7)}`;
  }

  const abrirComprobante = (r) => SoyaCore.comprobantes.abrirPesada(r);
  const icono = (nombre, clase) => el('i', { attrs: { 'data-lucide': nombre }, className: clase || 'h-3.5 w-3.5' });
  const textoViajes = (n) => (n === 1 ? '1 viaje' : `${n} viajes`);

  /** Al terminar: si hizo más de un viaje, sale directo el comprobante con todos. */
  function alTerminarCamion(r, mensaje) {
    const viajes = completos(viajesDe(r));
    if (viajes.length > 1) {
      abrirComprobante(r);
      toast(`${mensaje} Terminó: ${textoViajes(viajes.length)}, neto ${fmt.kg(netoDe(viajes))}.`, 'ok');
    } else {
      toast(`${mensaje}`, 'ok', { texto: 'Comprobante', fn: () => abrirComprobante(r) });
    }
  }

  // ---------- Panel del día y camiones en planta ----------
  function actualizarHoy() {
    const deHoy = store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()));
    const soja = deHoy.filter((c) => esSoja(c) && !enPlanta(c));
    $('#rec-hoy-kg').textContent = fmt.kg(soja.reduce((s, c) => s + (Number(c.neto) || 0), 0));
    $('#rec-hoy-camiones').textContent = fmt.entero(soja.length);
    $('#rec-hoy-humedad').textContent = fmt.porcentaje(humedadPonderada(soja));
    dibujarEnPlanta();
  }

  function cabeceraCamion(c, chips) {
    return [
      el('p', { className: 'flex flex-wrap items-center gap-2' }, [
        el('span', { className: 'truncate font-semibold text-slate-100', text: c.empresa }),
        c.patente ? el('span', { className: 'rounded border border-slate-600 px-1.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase', text: c.patente }) : null,
        ...chips,
      ]),
      el('p', { className: 'truncate text-xs text-slate-400', text: `${c.conductor || '-'} · ${c.carga || 'Soja'}` }),
    ];
  }

  function tarjetaPendiente(c) {
    const viajes = viajesDe(c);
    const n = viajes.findIndex((v) => v.id === c.id) + 1;
    const boton = el('button', { className: 'btn w-auto shrink-0 bg-sky-500 px-3 py-1.5 text-xs text-slate-950 hover:bg-sky-400', attrs: { type: 'button', 'data-cargar-tara': c.id } }, [icono('scale'), el('span', { text: 'Cargar tara' })]);
    boton.addEventListener('click', () => abrirTara(c));
    const previa = taraDeHoy(c, c.id);
    return el('li', { className: 'flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3', attrs: { 'data-id': c.id } }, [
      el('div', { className: 'min-w-0' }, [
        ...cabeceraCamion(c, [
          el('span', { className: 'chip border-sky-400/50 text-sky-300', text: 'Espera la tara' }),
          n > 1 ? el('span', { className: 'chip border-slate-600 text-slate-300', text: `Viaje ${n}` }) : null,
        ]),
        el('p', { className: 'text-xs text-slate-300 tabular-nums', text: `Bruto ${fmt.kg(c.bruto)} · entró a las ${String(c.fecha).slice(11, 16)} (${hace(c.fecha)})` }),
        previa ? el('p', { className: 'mt-0.5 flex items-center gap-1 text-xs font-semibold text-sky-300', attrs: { 'data-tara-previa': '' } }, [
          icono('refresh-cw', 'h-3 w-3'),
          el('span', { text: `Ya tiene tara de hoy: ${fmt.kg(previa.tara)} (${horaDe(previa)})` }),
        ]) : null,
      ]),
      boton,
    ]);
  }

  function tarjetaVuelve(c) {
    const viajes = completos(viajesDe(c));
    const otro = el('button', { className: 'btn w-auto shrink-0 bg-brand-500 px-3 py-1.5 text-xs text-slate-900 hover:bg-brand-400', attrs: { type: 'button', 'data-otro-viaje': c.id } }, [icono('plus'), el('span', { text: 'Otro viaje' })]);
    otro.addEventListener('click', () => abrirOtroViaje(c));
    // Terminar pide un segundo toque, así no se cierra por error.
    const fin = el('button', { className: 'btn-cancelar shrink-0 px-3 py-1.5 text-xs', attrs: { type: 'button', 'data-terminar': c.id } }, [el('span', { text: 'Terminar' })]);
    let armado = null;
    fin.addEventListener('click', () => {
      if (armado) { clearTimeout(armado); armado = null; terminar(c); return; }
      fin.firstChild.textContent = 'Tocá de nuevo para terminar';
      fin.classList.add('border-amber-400', 'text-amber-200');
      armado = setTimeout(() => { armado = null; fin.firstChild.textContent = 'Terminar'; fin.classList.remove('border-amber-400', 'text-amber-200'); }, 4000);
    });
    return el('li', { className: 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/40 bg-slate-900/60 p-3', attrs: { 'data-id': c.id, 'data-vuelve': '' } }, [
      el('div', { className: 'min-w-0' }, [
        ...cabeceraCamion(c, [el('span', { className: 'chip border-brand-500/60 text-brand-300', text: 'Va a volver' })]),
        el('p', { className: 'text-xs text-slate-300 tabular-nums', attrs: { 'data-resumen-viajes': '' }, text: `${textoViajes(viajes.length)} · neto ${fmt.kg(netoDe(viajes))} · tara ${fmt.kg(c.tara)}` }),
        el('p', { className: 'text-[11px] text-slate-500', text: `Último viaje: entró a las ${String(c.fecha).slice(11, 16)} (${hace(c.fecha)})` }),
      ]),
      el('div', { className: 'flex items-center gap-2' }, [fin, otro]),
    ]);
  }

  function dibujarEnPlanta() {
    const pendientes = store.todos('ingresos').filter(enPlanta).sort(porFecha);
    const vuelven = vanAVolver();
    const total = pendientes.length + vuelven.length;
    $('#rec-en-planta').hidden = !total;
    $('#rec-en-planta-titulo').textContent = [
      'Camiones en curso',
      [pendientes.length ? `${pendientes.length} esperando la tara` : '', vuelven.length ? `${vuelven.length} ${vuelven.length === 1 ? 'va' : 'van'} a volver` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean).join(': ');
    $('#rec-en-planta-lista').replaceChildren(...pendientes.map(tarjetaPendiente), ...vuelven.map(tarjetaVuelve));
    SoyaCore.icons.render($('#rec-en-planta-lista'));
  }

  // ---------- Terminar un camión de varios viajes ----------
  function terminar(c) {
    const guardado = store.actualizar('ingresos', c.id, { vuelve: false });
    if (!guardado) return;
    const viajes = completos(viajesDe(guardado));
    abrirComprobante(guardado);
    toast(`Terminado: ${textoViajes(viajes.length)}, neto ${fmt.kg(netoDe(viajes))}.`, 'ok');
  }

  // ---------- Diálogo "Otro viaje" (solo el bruto, con la misma tara) ----------
  let viajeBase = null; // el último viaje del camión

  function netoViaje() {
    const n = num($('#viaje-bruto')) - num($('#viaje-tara'));
    $('#viaje-neto').textContent = n > 0 ? fmt.kg(n) : '-';
  }
  function textoBotonViaje() {
    $('#viaje-guardar').textContent = $('#viaje-vuelve').checked ? 'Guardar viaje' : 'Guardar y terminar';
  }

  function abrirOtroViaje(c) {
    viajeBase = c;
    const viajes = completos(viajesDe(c));
    $('#viaje-titulo-texto').textContent = `Viaje ${viajes.length + 1}`;
    $('#viaje-sub').textContent = [c.empresa, c.patente, c.conductor].filter(Boolean).join(' · ');
    $('#viaje-lista').replaceChildren(...viajes.map((v, i) => el('li', { className: 'flex items-center justify-between gap-3 px-3 py-1.5 tabular-nums' }, [
      el('span', { className: 'text-slate-400', text: `Viaje ${i + 1} · ${String(v.fecha).slice(11, 16)}` }),
      el('span', { className: 'text-slate-300', text: `bruto ${fmt.kg(v.bruto)} · neto ` }, [el('b', { className: 'text-slate-100', text: fmt.kg(v.neto) })]),
    ])), el('li', { className: 'flex items-center justify-between gap-3 px-3 py-1.5 font-semibold' }, [
      el('span', { className: 'text-slate-300', text: 'Total hasta ahora' }),
      el('span', { className: 'text-brand-300', text: fmt.kg(netoDe(viajes)) }),
    ]));
    $('#viaje-bruto').value = '';
    $('#viaje-tara').value = c.tara;
    $('#viaje-humedad').value = '';
    $('#viaje-vuelve').checked = true;
    textoBotonViaje();
    netoViaje();
    $('#viaje-dialogo').showModal();
    $('#viaje-bruto').focus();
  }

  function initViaje() {
    const dialogo = $('#viaje-dialogo');
    const cerrar = () => dialogo.close();
    $('#viaje-cerrar').addEventListener('click', cerrar);
    $('#viaje-cancelar').addEventListener('click', cerrar);
    ['#viaje-bruto', '#viaje-tara'].forEach((s) => $(s).addEventListener('input', netoViaje));
    $('#viaje-vuelve').addEventListener('change', textoBotonViaje);
    $('#form-viaje').addEventListener('submit', (e) => {
      e.preventDefault();
      const base = viajeBase && (store.buscar('ingresos', viajeBase.id) || viajeBase);
      if (!base) { cerrar(); return; }
      const b = num($('#viaje-bruto'));
      const t = num($('#viaje-tara'));
      if (!(b > 0)) { toast('Falta el peso bruto.', 'error'); $('#viaje-bruto').focus(); return; }
      if (!(b - t > 0)) { toast('La tara tiene que ser menor que el bruto.', 'error'); $('#viaje-tara').focus(); return; }
      const h = num($('#viaje-humedad'));
      const vuelve = $('#viaje-vuelve').checked;
      const momento = ahora();
      const nuevo = store.agregar('ingresos', {
        fecha: momento,
        empresa: base.empresa,
        conductor: base.conductor,
        patente: base.patente || '',
        carga: base.carga || 'Soja',
        humedad: isNaN(h) ? null : h,
        bruto: b,
        tara: t,
        neto: b - t,
        fechaTara: momento,
        taraDe: t === Number(base.tara) ? base.taraDe || base.id : null,
        vuelve,
      });
      if (!nuevo) return;
      cerrar();
      const n = completos(viajesDe(nuevo)).length;
      if (vuelve) toast(`Viaje ${n} guardado: neto ${fmt.kg(b - t)}. Sigue abierto para el próximo viaje.`, 'ok');
      else alTerminarCamion(nuevo, `Viaje ${n} guardado.`);
    });
  }

  // ---------- Diálogo "Cargar la tara" ----------
  let taraId = null;
  let taraPrevia = null; // el viaje de hoy del que se tomó la tara (o null)

  function netoTara() {
    const r = store.buscar('ingresos', taraId);
    const t = num($('#tara-kg'));
    const n = r && !isNaN(t) ? Number(r.bruto) - t : NaN;
    $('#tara-neto').textContent = n > 0 ? fmt.kg(n) : '-';
  }

  function abrirTara(r) {
    taraId = r.id;
    $('#tara-sub').textContent = `${r.empresa}${r.patente ? ' · ' + r.patente : ''}`;
    const fila = (k, v) => [el('dt', { className: 'text-slate-500', text: k }), el('dd', { className: 'text-slate-200', text: v })];
    $('#tara-datos').replaceChildren(
      ...fila('Chofer', r.conductor || '-'),
      ...fila('Carga', r.carga || 'Soja'),
      ...fila('Bruto', fmt.kg(r.bruto)),
      ...fila('Entró', `${String(r.fecha).slice(8, 10)}/${String(r.fecha).slice(5, 7)} a las ${String(r.fecha).slice(11, 16)} (${hace(r.fecha)})`),
    );
    // Si el camión ya se taró hoy, la tara ya queda puesta.
    taraPrevia = taraDeHoy(r, r.id);
    $('#tara-kg').value = taraPrevia ? taraPrevia.tara : '';
    $('#tara-previa').hidden = !taraPrevia;
    if (taraPrevia) {
      $('#tara-previa').replaceChildren(
        el('i', { attrs: { 'data-lucide': 'refresh-cw' }, className: 'mt-0.5 h-3.5 w-3.5 shrink-0' }),
        el('span', { text: `Este camión ya se taró hoy a las ${horaDe(taraPrevia)} con ${fmt.kg(taraPrevia.tara)}: la tara ya está puesta. Si lo pesaste de nuevo, cambiala.` }),
      );
      SoyaCore.icons.render($('#tara-previa'));
    }
    $('#tara-humedad').value = tieneHumedad(r) ? r.humedad : '';
    $('#tara-vuelve').checked = !!r.vuelve;
    textoBotonTara();
    netoTara();
    $('#tara-dialogo').showModal();
    // Con la tara puesta, solo falta guardar.
    if (taraPrevia) $('#tara-guardar').focus();
    else $('#tara-kg').focus();
  }
  function textoBotonTara() {
    $('#tara-guardar').textContent = $('#tara-vuelve').checked ? 'Guardar tara (vuelve)' : 'Guardar tara';
  }

  function initTara() {
    const dialogo = $('#tara-dialogo');
    const cerrar = () => dialogo.close();
    $('#tara-cerrar').addEventListener('click', cerrar);
    $('#tara-cancelar').addEventListener('click', cerrar);
    $('#tara-kg').addEventListener('input', netoTara);
    $('#tara-vuelve').addEventListener('change', textoBotonTara);
    $('#form-tara').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = store.buscar('ingresos', taraId);
      if (!r) { cerrar(); return; }
      const t = num($('#tara-kg'));
      const neto = Number(r.bruto) - t;
      if (!(neto > 0)) {
        toast('La tara tiene que ser menor que el bruto.', 'error');
        $('#tara-kg').focus();
        return;
      }
      const h = num($('#tara-humedad'));
      const guardado = store.actualizar('ingresos', r.id, {
        tara: t,
        taraDe: taraPrevia && Number(taraPrevia.tara) === t ? taraPrevia.id : null,
        neto,
        humedad: isNaN(h) ? null : h,
        fechaTara: ahora(),
        vuelve: $('#tara-vuelve').checked,
      });
      if (!guardado) return;
      cerrar();
      if (guardado.vuelve) toast(`Tara cargada: neto ${fmt.kg(neto)}. Queda abierto para el próximo viaje.`, 'ok');
      else alTerminarCamion(guardado, `Tara cargada: neto ${fmt.kg(neto)}.`);
    });
  }

  // ---------- Formularios de balanza ----------
  const netoCelda = (r) => (enPlanta(r)
    ? el('span', { className: 'chip chip-sin border-sky-400/50 text-sky-300', text: 'Falta tara' })
    : el('span', { text: fmt.entero(r.neto) }));

  const COLUMNAS = {
    ingresos: [
      { key: 'fecha', format: (v) => `${String(v).slice(8, 10)}/${String(v).slice(5, 7)} ${String(v).slice(11, 16)}` },
      // Empresa arriba y, más chico, chofer y patente: así la tabla entra sin barra de desplazamiento.
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
    let taraDe = null; // id del viaje de hoy del que se usó la tara (mismo camión)
    let sugerida = null;

    const actualizarNeto = () => {
      if (recepcion && tara.value === '') salida.textContent = num(bruto) > 0 ? 'Falta la tara' : '0 kg';
      else { const n = neto(); salida.textContent = fmt.kg(n > 0 ? n : 0); }
      if (recepcion && (!editor || !editor.id)) {
        $('#in-enviar').textContent = tara.value === '' ? 'Registrar entrada (sin tara)' : $('#in-vuelve').checked ? 'Registrar viaje (vuelve)' : 'Registrar Ingreso';
      }
    };

    // ---- La tara del mismo camión (solo en Recepción, al cargar uno nuevo) ----
    function usarTara(viaje) {
      tara.value = viaje.tara;
      taraDe = viaje.id;
      actualizarNeto();
      actualizarSugerencia();
    }
    function actualizarSugerencia() {
      if (!recepcion) return;
      const caja = $('#in-tara-sugerida');
      sugerida = editor && editor.id ? null : taraDeHoy({ patente: $('#in-patente').value, conductor: $(`#${prefijo}-conductor`).value });
      caja.hidden = !sugerida;
      if (!sugerida) { taraDe = null; return; }
      const usada = taraDe === sugerida.id && num(tara) === Number(sugerida.tara);
      $('#in-tara-sugerida-texto').textContent = usada
        ? `Es la tara de su viaje de hoy a las ${horaDe(sugerida)} (${fmt.kg(sugerida.tara)}).`
        : `Este camión ya se taró hoy a las ${horaDe(sugerida)}: ${fmt.kg(sugerida.tara)}.`;
      $('#in-tara-usar').hidden = usada;
    }

    bruto.addEventListener('input', actualizarNeto);
    tara.addEventListener('input', () => {
      if (taraDe && (!sugerida || num(tara) !== Number(sugerida.tara))) taraDe = null;
      actualizarNeto();
      actualizarSugerencia();
    });
    if (recepcion) {
      ['#in-patente', `#${prefijo}-conductor`].forEach((sel) => $(sel).addEventListener('input', actualizarSugerencia));
      $('#in-tara-usar').addEventListener('click', () => { if (sugerida) usarTara(sugerida); });
      $('#in-vuelve').addEventListener('change', actualizarNeto);
    }

    const tabla = tablaRegistros({
      tbody: $(`#tbody-${coleccion}`),
      caption: $(`#caption-${coleccion}`),
      coleccion,
      columnas: COLUMNAS[coleccion],
      onEditar: (r) => editor.editar(r),
      acciones: recepcion ? [
        { accion: 'tara', icono: 'scale', etiqueta: 'Cargar tara', mostrar: enPlanta, fn: abrirTara },
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
        bruto.value = r.bruto != null ? r.bruto : r.neto;
        tara.value = r.tara != null ? r.tara : (r.bruto != null ? '' : 0);
        if (recepcion) {
          $('#in-carga').value = r.carga || 'Soja';
          $('#in-patente').value = r.patente || '';
          $('#in-humedad').value = tieneHumedad(r) ? r.humedad : '';
          $('#in-vuelve').checked = !!r.vuelve;
          fechaTaraAntes = r.fechaTara || null;
          taraDe = r.taraDe || null;
        }
        actualizarNeto();
        actualizarSugerencia();
      },
      alTerminar: () => {
        fechaTaraAntes = null; taraDe = null;
        if (recepcion) $('#in-vuelve').checked = false;
        actualizarNeto(); actualizarSugerencia();
      },
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = num(bruto);
      if (!(b > 0)) {
        toast('Falta el peso bruto.', 'error');
        bruto.focus();
        return;
      }
      const conTara = !(recepcion && tara.value === '');
      const n = neto();
      if (conTara && !(n > 0)) {
        toast('El peso neto debe ser mayor a 0 (revisá bruto y tara).', 'error');
        tara.focus();
        return;
      }
      const registro = {
        empresa: $(`#${prefijo}-empresa`).value.trim(),
        conductor: $(`#${prefijo}-conductor`).value.trim(),
        bruto: b,
        tara: conTara ? num(tara) : null,
        neto: conTara ? n : null,
      };
      let mensajes = { nuevo: mensaje };
      if (recepcion) {
        registro.carga = $('#in-carga').value.trim() || 'Soja';
        registro.patente = $('#in-patente').value.trim().toUpperCase();
        const h = num($('#in-humedad'));
        registro.humedad = isNaN(h) ? null : h;
        registro.fechaTara = conTara ? fechaTaraAntes || ahora() : null;
        registro.taraDe = conTara && taraDe ? taraDe : null;
        registro.vuelve = $('#in-vuelve').checked;
        mensajes = !conTara
          ? { nuevo: `Entrada registrada: queda en planta esperando la tara${registro.vuelve ? ' (y va a volver)' : ''}.` }
          : registro.vuelve
            ? { nuevo: 'Ingreso registrado: queda abierto en "Camiones en curso" para el próximo viaje.' }
            : { nuevo: mensaje, accion: { texto: 'Comprobante', fn: abrirComprobante } };
      }
      if (guardarRegistro(coleccion, editor, registro, mensajes)) $(`#${prefijo}-empresa`).focus();
    });

    store.alCambiar((c) => {
      if (c !== coleccion && c !== '*') return;
      tabla.dibujar();
      if (recepcion) { actualizarHoy(); actualizarSugerencia(); }
    });
    tabla.dibujar();
    actualizarNeto();
    if (recepcion) {
      actualizarHoy();
      setInterval(() => !$('#view-recepcion').hidden && dibujarEnPlanta(), 60000); // "hace N min"
    }
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.recepcion = {
    init: () => {
      balanza('in', 'ingresos', 'form-ingreso', 'Ingreso registrado.');
      initTara();
      initViaje();
    },
    refresh: actualizarHoy, // al entrar se recalcula "hoy"
    esSoja,
    tieneHumedad,
    enPlanta,
    humedadPonderada,
    viajesDe,
    abrirOtroViaje,
    terminar,
  };
  SoyaCore.views.despacho = {
    init: () => balanza('out', 'despachos', 'form-despacho', 'Despacho registrado.'),
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
