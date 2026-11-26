/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 *
 * Recepción: cada viaje pasa dos veces por la balanza, lleno (bruto) y vacío
 * (tara), en cualquier orden. Se carga el peso que se tenga; el viaje queda en
 * "Camiones de hoy" hasta que se carga el otro, y ahí se calcula el neto.
 * Mientras falta un peso, el viaje no suma a los totales. La humedad es opcional.
 *
 * Varios viajes (2.25.1): con la flecha "Otro viaje" se carga el viaje siguiente
 * del mismo camión (sus datos ya puestos; ningún peso es obligatorio por separado
 * y se ofrece la tara anterior). Cada viaje es un registro, así los totales no
 * cambian. Los viajes de un mismo camión en el día (misma patente, o mismo chofer
 * si no hay patente, y misma carga) salen juntos en un solo comprobante.
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, num, hoy, ahora, fechaMs, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;

  /** Un ingreso es de soja si su carga dice "soja" (o no tiene carga: datos viejos). */
  const esSoja = (c) => String(c.carga || 'Soja').toLowerCase().includes('soja');
  const tieneHumedad = (c) => c.humedad != null && c.humedad !== '' && !isNaN(Number(c.humedad));
  /** Viaje al que todavía le falta un peso (no tiene neto). */
  const enPlanta = (c) => c.neto == null || c.neto === '' || isNaN(Number(c.neto));
  /** Se pesó primero vacío: tiene la tara y le falta el bruto. */
  const faltaBruto = (c) => enPlanta(c) && !(Number(c.bruto) > 0) && Number(c.tara) > 0;
  const hhmm = (f) => String(f || '').slice(11, 16);

  // ---------- El mismo camión ----------
  /*
   * Se reconoce por la patente; si alguno de los dos viajes no tiene patente, por el
   * nombre del chofer. Sin importar espacios, guiones, acentos ni mayúsculas.
   */
  const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function mismoCamion(a, b) {
    const pa = normal(a.patente);
    const pb = normal(b.patente);
    if (pa && pb) return pa === pb;
    const ca = normal(a.conductor);
    return !!ca && ca === normal(b.conductor);
  }
  const horaDe = (r) => hhmm(r.fechaTara || r.fecha);

  /** La última tara de hoy de ese camión (o null). */
  function taraDeHoy(datos, excluirId) {
    if (!normal(datos.patente) && !normal(datos.conductor)) return null;
    return store.todos('ingresos')
      .filter((c) => c.id !== excluirId && String(c.fecha).startsWith(hoy()) && Number(c.tara) > 0 && mismoCamion(c, datos))
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
  const textoViajes = (n) => (n === 1 ? '1 viaje' : `${n} viajes`);
  const esUltimo = (r) => { const v = viajesDe(r); return v[v.length - 1].id === r.id; };

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

  /** Aviso al completar un viaje, con el comprobante (de todos los viajes del día). */
  function avisoCompleto(r) {
    const viajes = completos(viajesDe(r));
    const texto = viajes.length > 1
      ? `Viaje ${viajes.findIndex((v) => v.id === r.id) + 1} completo: neto ${fmt.kg(r.neto)}. En el día lleva ${textoViajes(viajes.length)}, ${fmt.kg(netoDe(viajes))}.`
      : `Pesada completa: neto ${fmt.kg(r.neto)}.`;
    toast(texto, 'ok', { texto: 'Comprobante', fn: () => abrirComprobante(r) });
  }

  // ---------- Panel del día: camiones de hoy ----------
  function actualizarHoy() {
    const deHoy = store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()));
    const soja = deHoy.filter((c) => esSoja(c) && !enPlanta(c));
    $('#rec-hoy-kg').textContent = fmt.kg(soja.reduce((s, c) => s + (Number(c.neto) || 0), 0));
    $('#rec-hoy-camiones').textContent = fmt.entero(soja.length);
    $('#rec-hoy-humedad').textContent = fmt.porcentaje(humedadPonderada(soja));
    dibujarEnPlanta();
  }

  const patenteChip = (c) => (c.patente ? el('span', { className: 'rounded border border-slate-600 px-1.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase', text: c.patente }) : null);

  function tarjetaPendiente(c) {
    const viajes = viajesDe(c);
    const n = viajes.findIndex((v) => v.id === c.id) + 1;
    const bruto = faltaBruto(c);
    const boton = el('button', {
      className: 'btn w-auto shrink-0 bg-sky-500 px-3 py-1.5 text-xs text-slate-950 hover:bg-sky-400',
      attrs: { type: 'button', [bruto ? 'data-cargar-bruto' : 'data-cargar-tara']: c.id },
    }, [icono('scale'), el('span', { text: bruto ? 'Cargar bruto' : 'Cargar tara' })]);
    boton.addEventListener('click', () => abrirTara(c));
    const previa = bruto ? null : taraDeHoy(c, c.id);
    return el('li', { className: 'flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3', attrs: { 'data-id': c.id } }, [
      el('div', { className: 'min-w-0' }, [
        el('p', { className: 'flex flex-wrap items-center gap-2' }, [
          el('span', { className: 'truncate font-semibold text-slate-100', text: c.empresa }),
          patenteChip(c),
          el('span', { className: 'chip border-sky-400/50 text-sky-300', text: bruto ? 'Falta el bruto' : 'Falta la tara' }),
          n > 1 ? el('span', { className: 'chip border-slate-600 text-slate-300', text: `Viaje ${n}` }) : null,
        ]),
        el('p', { className: 'truncate text-xs text-slate-400', text: `${c.conductor || '-'} · ${c.carga || 'Soja'}` }),
        el('p', { className: 'text-xs text-slate-300 tabular-nums', text: `${bruto ? `Tara ${fmt.kg(c.tara)}` : `Bruto ${fmt.kg(c.bruto)}`} · a las ${hhmm(c.fecha)} (${hace(c.fecha)})` }),
        previa ? el('p', { className: 'mt-0.5 flex items-center gap-1 text-xs font-semibold text-sky-300', attrs: { 'data-tara-previa': '' } }, [
          icono('refresh-cw', 'h-3 w-3'),
          el('span', { text: `Ya tiene tara de hoy: ${fmt.kg(previa.tara)} (${horaDe(previa)})` }),
        ]) : null,
      ]),
      boton,
    ]);
  }

  function filaPesado(c) {
    const viajes = completos(viajesDe(c));
    const otro = el('button', { className: 'btn w-auto shrink-0 bg-brand-500 px-2.5 py-1 text-xs text-slate-900 hover:bg-brand-400', attrs: { type: 'button', 'data-otro-viaje': c.id, title: 'Cargar otro viaje de este camión' } }, [icono('redo-2'), el('span', { text: 'Otro viaje' })]);
    otro.addEventListener('click', () => abrirOtroViaje(c));
    const comp = el('button', { className: 'btn-sm shrink-0', attrs: { type: 'button', 'data-comprobante': c.id, title: viajes.length > 1 ? 'Un comprobante con todos los viajes' : 'Comprobante de pesada' } }, [icono('file-text'), el('span', { text: 'Comprobante' })]);
    comp.addEventListener('click', () => abrirComprobante(c));
    return el('li', { className: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2', attrs: { 'data-id': c.id, 'data-pesado': '' } }, [
      el('div', { className: 'min-w-0' }, [
        el('p', { className: 'flex flex-wrap items-center gap-2 text-sm' }, [
          el('span', { className: 'truncate font-semibold text-slate-100', text: c.empresa }),
          patenteChip(c),
          el('span', { className: 'truncate text-xs text-slate-400', text: `${c.conductor || '-'} · ${c.carga || 'Soja'}` }),
        ]),
        el('p', { className: 'text-xs text-slate-300 tabular-nums', attrs: { 'data-resumen-viajes': '' }, text: `${textoViajes(viajes.length)} · neto ${fmt.kg(netoDe(viajes))} · último a las ${hhmm(c.fecha)}` }),
      ]),
      el('div', { className: 'flex items-center gap-2' }, [comp, otro]),
    ]);
  }

  const MAX_PESADOS = 6;
  let verTodos = false;

  function dibujarEnPlanta() {
    const pendientes = store.todos('ingresos').filter(enPlanta).sort(porFecha);
    // Camiones de hoy con el último viaje completo (uno por camión), el más reciente primero.
    const pesados = store.todos('ingresos')
      .filter((c) => diaDe(c) === hoy() && !enPlanta(c) && esUltimo(c))
      .sort((a, b) => porFecha(b, a));
    $('#rec-en-planta').hidden = !pendientes.length && !pesados.length;
    $('#rec-en-planta-titulo').textContent = [
      'Camiones de hoy',
      [pendientes.length ? `${pendientes.length} ${pendientes.length === 1 ? 'espera' : 'esperan'} un peso` : '', pesados.length ? `${pesados.length} ya ${pesados.length === 1 ? 'pesado' : 'pesados'}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean).join(': ');
    $('#rec-en-planta-lista').replaceChildren(...pendientes.map(tarjetaPendiente));
    $('#rec-pesados').hidden = !pesados.length;
    const visibles = verTodos ? pesados : pesados.slice(0, MAX_PESADOS);
    $('#rec-pesados-lista').replaceChildren(...visibles.map(filaPesado));
    const mas = $('#rec-pesados-mas');
    mas.hidden = pesados.length <= MAX_PESADOS;
    mas.textContent = verTodos ? 'Ver menos' : `Ver los ${pesados.length} camiones`;
    SoyaCore.icons.render($('#rec-en-planta'));
  }

  // ---------- Diálogo para completar la pesada (la tara o el bruto que falta) ----------
  let taraId = null;
  let taraPrevia = null; // el viaje de hoy del que se tomó la tara (o null)
  let modoBruto = false; // true: falta el bruto (se pesó primero vacío)

  function netoTara() {
    const r = store.buscar('ingresos', taraId);
    const x = num($('#tara-kg'));
    const n = r && !isNaN(x) ? (modoBruto ? x - Number(r.tara) : Number(r.bruto) - x) : NaN;
    $('#tara-neto').textContent = n > 0 ? fmt.kg(n) : '-';
  }

  function abrirTara(r) {
    taraId = r.id;
    modoBruto = faltaBruto(r);
    $('#tara-titulo-texto').textContent = modoBruto ? 'Cargar el bruto' : 'Cargar la tara';
    $('#tara-kg-label').textContent = modoBruto ? 'Bruto (kg)' : 'Tara (kg)';
    $('#tara-sub').textContent = `${r.empresa}${r.patente ? ' · ' + r.patente : ''}`;
    const fila = (k, v) => [el('dt', { className: 'text-slate-500', text: k }), el('dd', { className: 'text-slate-200', text: v })];
    $('#tara-datos').replaceChildren(
      ...fila('Chofer', r.conductor || '-'),
      ...fila('Carga', r.carga || 'Soja'),
      ...(modoBruto ? fila('Tara', fmt.kg(r.tara)) : fila('Bruto', fmt.kg(r.bruto))),
      ...fila('Pesado', `${String(r.fecha).slice(8, 10)}/${String(r.fecha).slice(5, 7)} a las ${hhmm(r.fecha)} (${hace(r.fecha)})`),
    );
    // Si al camión le falta la tara y ya se taró hoy, la tara queda puesta.
    taraPrevia = modoBruto ? null : taraDeHoy(r, r.id);
    $('#tara-kg').value = taraPrevia ? taraPrevia.tara : '';
    $('#tara-previa').hidden = !taraPrevia;
    if (taraPrevia) {
      $('#tara-previa').replaceChildren(
        icono('refresh-cw', 'mt-0.5 h-3.5 w-3.5 shrink-0'),
        el('span', { text: `Este camión ya se taró hoy a las ${horaDe(taraPrevia)} con ${fmt.kg(taraPrevia.tara)}: la tara ya está puesta. Si lo pesaste de nuevo, cambiala.` }),
      );
      SoyaCore.icons.render($('#tara-previa'));
    }
    $('#tara-humedad').value = tieneHumedad(r) ? r.humedad : '';
    $('#tara-guardar').textContent = modoBruto ? 'Guardar bruto' : 'Guardar tara';
    netoTara();
    $('#tara-dialogo').showModal();
    // Con la tara puesta, solo falta guardar.
    if (taraPrevia) $('#tara-guardar').focus();
    else $('#tara-kg').focus();
  }

  function initTara() {
    const dialogo = $('#tara-dialogo');
    const cerrar = () => dialogo.close();
    $('#tara-cerrar').addEventListener('click', cerrar);
    $('#tara-cancelar').addEventListener('click', cerrar);
    $('#tara-kg').addEventListener('input', netoTara);
    $('#form-tara').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = store.buscar('ingresos', taraId);
      if (!r) { cerrar(); return; }
      const x = num($('#tara-kg'));
      const neto = modoBruto ? x - Number(r.tara) : Number(r.bruto) - x;
      if (!(neto > 0)) {
        toast(modoBruto ? 'El bruto tiene que ser mayor que la tara.' : 'La tara tiene que ser menor que el bruto.', 'error');
        $('#tara-kg').focus();
        return;
      }
      const h = num($('#tara-humedad'));
      const cambios = modoBruto
        ? { bruto: x, neto, fechaBruto: ahora() }
        : { tara: x, taraDe: taraPrevia && Number(taraPrevia.tara) === x ? taraPrevia.taraDe || taraPrevia.id : null, neto, fechaTara: ahora() };
      cambios.humedad = isNaN(h) ? null : h;
      const guardado = store.actualizar('ingresos', r.id, cambios);
      if (!guardado) return;
      cerrar();
      avisoCompleto(guardado);
    });
  }

  // ---------- Diálogo "Otro viaje" (flecha): el viaje siguiente del mismo camión ----------
  let viajeBase = null; // el último viaje del camión
  let taraAnterior = null; // la última tara de hoy de ese camión

  function actualizarViaje() {
    const b = num($('#viaje-bruto'));
    const t = num($('#viaje-tara'));
    const hayB = b > 0;
    const hayT = t > 0;
    $('#viaje-neto').textContent = hayB && hayT ? (b - t > 0 ? fmt.kg(b - t) : '-') : hayB ? 'Falta la tara' : hayT ? 'Falta el bruto' : '-';
    $('#viaje-guardar').textContent = hayB && hayT ? 'Guardar viaje' : hayB ? 'Guardar (falta la tara)' : hayT ? 'Guardar (falta el bruto)' : 'Guardar viaje';
    $('#viaje-usar-tara').hidden = !taraAnterior || t === Number(taraAnterior.tara);
  }

  function abrirOtroViaje(c) {
    viajeBase = c;
    const viajes = viajesDe(c);
    taraAnterior = taraDeHoy(c);
    $('#viaje-titulo-texto').textContent = `Viaje ${viajes.length + 1}`;
    $('#viaje-sub').textContent = [c.empresa, c.patente, c.conductor].filter(Boolean).join(' · ');
    $('#viaje-lista').replaceChildren(...viajes.map((v, i) => el('li', { className: 'flex items-center justify-between gap-3 px-3 py-1.5 tabular-nums' }, [
      el('span', { className: 'text-slate-400', text: `Viaje ${i + 1} · ${hhmm(v.fecha)}` }),
      enPlanta(v)
        ? el('span', { className: 'text-sky-300', text: faltaBruto(v) ? 'falta el bruto' : 'falta la tara' })
        : el('span', { className: 'text-slate-300', text: `bruto ${fmt.kg(v.bruto)} · neto ` }, [el('b', { className: 'text-slate-100', text: fmt.kg(v.neto) })]),
    ])), el('li', { className: 'flex items-center justify-between gap-3 px-3 py-1.5 font-semibold' }, [
      el('span', { className: 'text-slate-300', text: 'Total hasta ahora' }),
      el('span', { className: 'text-brand-300', text: fmt.kg(netoDe(completos(viajes))) }),
    ]));
    $('#viaje-bruto').value = '';
    $('#viaje-tara').value = '';
    $('#viaje-humedad').value = '';
    $('#viaje-usar-tara').textContent = taraAnterior ? `Usar la tara anterior (${fmt.kg(taraAnterior.tara)})` : '';
    actualizarViaje();
    $('#viaje-dialogo').showModal();
    $('#viaje-bruto').focus();
  }

  function initViaje() {
    const dialogo = $('#viaje-dialogo');
    const cerrar = () => dialogo.close();
    $('#viaje-cerrar').addEventListener('click', cerrar);
    $('#viaje-cancelar').addEventListener('click', cerrar);
    ['#viaje-bruto', '#viaje-tara'].forEach((s) => $(s).addEventListener('input', actualizarViaje));
    $('#viaje-usar-tara').addEventListener('click', () => {
      if (!taraAnterior) return;
      $('#viaje-tara').value = taraAnterior.tara;
      actualizarViaje();
      $(num($('#viaje-bruto')) > 0 ? '#viaje-guardar' : '#viaje-bruto').focus();
    });
    $('#form-viaje').addEventListener('submit', (e) => {
      e.preventDefault();
      const base = viajeBase && (store.buscar('ingresos', viajeBase.id) || viajeBase);
      if (!base) { cerrar(); return; }
      const b = num($('#viaje-bruto'));
      const t = num($('#viaje-tara'));
      const hayB = b > 0;
      const hayT = t > 0;
      if (!hayB && !hayT) { toast('Cargá el bruto (lleno) o la tara (vacío): con uno alcanza.', 'error'); $('#viaje-bruto').focus(); return; }
      if (hayB && hayT && !(b - t > 0)) { toast('La tara tiene que ser menor que el bruto.', 'error'); $('#viaje-tara').focus(); return; }
      const h = num($('#viaje-humedad'));
      const momento = ahora();
      const nuevo = store.agregar('ingresos', {
        fecha: momento,
        empresa: base.empresa,
        conductor: base.conductor,
        patente: base.patente || '',
        carga: base.carga || 'Soja',
        humedad: isNaN(h) ? null : h,
        bruto: hayB ? b : null,
        tara: hayT ? t : null,
        neto: hayB && hayT ? b - t : null,
        fechaTara: hayT ? momento : null,
        taraDe: hayT && taraAnterior && t === Number(taraAnterior.tara) ? taraAnterior.taraDe || taraAnterior.id : null,
      });
      if (!nuevo) return;
      cerrar();
      const n = viajesDe(nuevo).findIndex((v) => v.id === nuevo.id) + 1;
      if (!enPlanta(nuevo)) avisoCompleto(nuevo);
      else toast(`Viaje ${n} registrado: ${hayB ? 'falta la tara' : 'falta el bruto'}. Se completa en "Camiones de hoy".`, 'ok');
    });
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
    let taraDe = null; // id del viaje de hoy del que se usó la tara (mismo camión)
    let sugerida = null;

    const actualizarNeto = () => {
      if (recepcion && (bruto.value === '' || tara.value === '')) {
        salida.textContent = bruto.value !== '' ? 'Falta la tara' : tara.value !== '' ? 'Falta el bruto' : '0 kg';
      } else {
        const n = neto();
        salida.textContent = fmt.kg(n > 0 ? n : 0);
      }
      if (recepcion && (!editor || !editor.id)) {
        $('#in-enviar').textContent = bruto.value !== '' && tara.value === '' ? 'Registrar (falta la tara)'
          : bruto.value === '' && tara.value !== '' ? 'Registrar (falta el bruto)' : 'Registrar Ingreso';
      }
    };

    // ---- La tara del mismo camión (solo en Recepción, al cargar uno nuevo) ----
    function usarTara(viaje) {
      tara.value = viaje.tara;
      taraDe = viaje.taraDe || viaje.id;
      actualizarNeto();
      actualizarSugerencia();
    }
    function actualizarSugerencia() {
      if (!recepcion) return;
      const caja = $('#in-tara-sugerida');
      sugerida = editor && editor.id ? null : taraDeHoy({ patente: $('#in-patente').value, conductor: $(`#${prefijo}-conductor`).value });
      caja.hidden = !sugerida;
      if (!sugerida) { taraDe = null; return; }
      const usada = num(tara) === Number(sugerida.tara);
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
    }

    const tabla = tablaRegistros({
      tbody: $(`#tbody-${coleccion}`),
      caption: $(`#caption-${coleccion}`),
      coleccion,
      columnas: COLUMNAS[coleccion],
      onEditar: (r) => editor.editar(r),
      acciones: recepcion ? [
        { accion: 'tara', icono: 'scale', etiqueta: 'Cargar el peso que falta', mostrar: enPlanta, fn: abrirTara },
        { accion: 'comprobante', icono: 'file-text', etiqueta: 'Comprobante PDF', mostrar: (r) => !enPlanta(r), fn: abrirComprobante },
        { accion: 'otro-viaje', icono: 'redo-2', etiqueta: 'Otro viaje de este camión', mostrar: (r) => !enPlanta(r) && diaDe(r) === hoy() && esUltimo(r), fn: abrirOtroViaje },
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
          taraDe = r.taraDe || null;
        }
        actualizarNeto();
        actualizarSugerencia();
      },
      alTerminar: () => { fechaTaraAntes = null; fechaBrutoAntes = null; taraDe = null; actualizarNeto(); actualizarSugerencia(); },
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
        registro.taraDe = conTara && taraDe ? taraDe : null;
        mensajes = conBruto && conTara
          ? { nuevo: mensaje, accion: { texto: 'Comprobante', fn: abrirComprobante } }
          : { nuevo: `Pesada registrada: ${conBruto ? 'falta la tara' : 'falta el bruto'}. Se completa en "Camiones de hoy" cuando vuelve a la balanza.` };
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
      $('#rec-pesados-mas').addEventListener('click', () => { verTodos = !verTodos; dibujarEnPlanta(); });
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
    faltaBruto,
    humedadPonderada,
    viajesDe,
    abrirOtroViaje,
  };
  SoyaCore.views.despacho = {
    init: () => balanza('out', 'despachos', 'form-despacho', 'Despacho registrado.'),
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
