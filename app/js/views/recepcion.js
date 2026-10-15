/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 *
 * Recepción en dos pasos: cuando llegan varios camiones, primero se pesan
 * llenos (bruto) y quedan "en planta". Cuando descargan, se pesan vacíos y se
 * carga la tara: ahí se calcula el neto y se puede sacar el comprobante en PDF.
 * También se carga la humedad de cada camión (muestra de laboratorio).
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

  // ---------- Panel del día y camiones en planta ----------
  function actualizarHoy() {
    const deHoy = store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()));
    const soja = deHoy.filter((c) => esSoja(c) && !enPlanta(c));
    $('#rec-hoy-kg').textContent = fmt.kg(soja.reduce((s, c) => s + (Number(c.neto) || 0), 0));
    $('#rec-hoy-camiones').textContent = fmt.entero(soja.length);
    $('#rec-hoy-humedad').textContent = fmt.porcentaje(humedadPonderada(soja));
    dibujarEnPlanta();
  }

  function dibujarEnPlanta() {
    const pendientes = store.todos('ingresos').filter(enPlanta).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    $('#rec-en-planta').hidden = !pendientes.length;
    $('#rec-en-planta-titulo').textContent = pendientes.length === 1 ? 'En planta, esperando la tara: 1 camión' : `En planta, esperando la tara: ${pendientes.length} camiones`;
    $('#rec-en-planta-lista').replaceChildren(...pendientes.map((c) => {
      const boton = el('button', { className: 'btn w-auto shrink-0 bg-sky-500 px-3 py-1.5 text-xs text-slate-950 hover:bg-sky-400', attrs: { type: 'button', 'data-cargar-tara': c.id } }, [
        el('i', { attrs: { 'data-lucide': 'scale' }, className: 'h-3.5 w-3.5' }),
        el('span', { text: 'Cargar tara' }),
      ]);
      boton.addEventListener('click', () => abrirTara(c));
      return el('li', { className: 'flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3', attrs: { 'data-id': c.id } }, [
        el('div', { className: 'min-w-0' }, [
          el('p', { className: 'flex flex-wrap items-center gap-2' }, [
            el('span', { className: 'truncate font-semibold text-slate-100', text: c.empresa }),
            c.patente ? el('span', { className: 'rounded border border-slate-600 px-1.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase', text: c.patente }) : null,
          ]),
          el('p', { className: 'truncate text-xs text-slate-400', text: `${c.conductor || '-'} · ${c.carga || 'Soja'}` }),
          el('p', { className: 'text-xs text-slate-300 tabular-nums', text: `Bruto ${fmt.kg(c.bruto)} · entró a las ${String(c.fecha).slice(11, 16)} (${hace(c.fecha)})` }),
        ]),
        boton,
      ]);
    }));
    SoyaCore.icons.render($('#rec-en-planta-lista'));
  }

  // ---------- Diálogo "Cargar la tara" ----------
  let taraId = null;

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
    $('#tara-kg').value = '';
    $('#tara-humedad').value = tieneHumedad(r) ? r.humedad : '';
    $('#tara-humedad').required = esSoja(r);
    netoTara();
    $('#tara-dialogo').showModal();
    $('#tara-kg').focus();
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
        neto,
        humedad: isNaN(h) ? (tieneHumedad(r) ? r.humedad : null) : h,
        fechaTara: ahora(),
      });
      if (!guardado) return;
      cerrar();
      toast(`Tara cargada: neto ${fmt.kg(neto)}.`, 'ok', { texto: 'Comprobante', fn: () => abrirComprobante(guardado) });
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
        el('span', { className: 'block truncate text-[11px] text-slate-500', text: [r.conductor, r.patente ? String(r.patente).toUpperCase() : null].filter(Boolean).join(' · ') }),
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
    let sinHumedadAntes = false; // camión de soja cargado antes de la v2.18, sin humedad
    let fechaTaraAntes = null;

    const actualizarNeto = () => {
      if (recepcion && tara.value === '') salida.textContent = num(bruto) > 0 ? 'Falta la tara' : '0 kg';
      else { const n = neto(); salida.textContent = fmt.kg(n > 0 ? n : 0); }
      if (recepcion) {
        humedadObligatoria();
        if (!editor || !editor.id) $('#in-enviar').textContent = tara.value === '' ? 'Registrar entrada (sin tara)' : 'Registrar Ingreso';
      }
    };

    // La humedad es obligatoria para la soja al completar la pesada (con tara). Al corregir
    // un camión de soja viejo que no tenía humedad (antes se anotaba en la secadora), no se obliga.
    function humedadObligatoria() {
      if (!recepcion) return;
      const exento = editor && editor.id && sinHumedadAntes;
      $('#in-humedad').required = esSoja({ carga: $('#in-carga').value || 'Soja' }) && tara.value !== '' && !exento;
    }

    bruto.addEventListener('input', actualizarNeto);
    tara.addEventListener('input', actualizarNeto);

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
          sinHumedadAntes = esSoja(r) && !tieneHumedad(r) && !enPlanta(r); // completo y viejo, sin humedad
          fechaTaraAntes = r.fechaTara || null;
        }
        actualizarNeto();
      },
      alTerminar: () => { sinHumedadAntes = false; fechaTaraAntes = null; actualizarNeto(); },
    });

    if (recepcion) $('#in-carga').addEventListener('input', humedadObligatoria);

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
        mensajes = conTara
          ? { nuevo: mensaje, accion: { texto: 'Comprobante', fn: abrirComprobante } }
          : { nuevo: 'Entrada registrada: queda en planta esperando la tara.' };
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
      setInterval(() => !$('#view-recepcion').hidden && dibujarEnPlanta(), 60000); // "hace N min"
    }
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.recepcion = {
    init: () => {
      balanza('in', 'ingresos', 'form-ingreso', 'Ingreso registrado.');
      initTara();
    },
    refresh: actualizarHoy, // al entrar se recalcula "hoy"
    esSoja,
    tieneHumedad,
    enPlanta,
    humedadPonderada,
  };
  SoyaCore.views.despacho = {
    init: () => balanza('out', 'despachos', 'form-despacho', 'Despacho registrado.'),
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
