/*
 * Vista: Stock de repuestos (piezas para prensas, extrusores, reductores,
 * bombas y cosas generales como lubricantes o herramientas).
 *
 * La cantidad de cada repuesto NO se guarda en el repuesto: se calcula
 * sumando sus movimientos (cantidad inicial, compras, salidas y correcciones
 * por conteo) y restando lo que se usó en los mantenimientos. Así:
 *   - al cargar en Mantenimientos que una prensa usó un repuesto, se descuenta solo;
 *   - si después se corrige o se borra ese mantenimiento, el stock se acomoda solo;
 *   - dos PCs que cargan a la vez no se pisan: cada una agrega su movimiento.
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt, ahora, num, fillSelect, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const { config, store } = SoyaCore;

  // ---------- Categorías y unidades ----------
  /** "Para" qué es cada repuesto: los tipos de equipo y las categorías extra. */
  const CATEGORIAS = {};
  Object.entries(config.tiposEquipo).forEach(([k, etiqueta]) => { CATEGORIAS[k] = { corta: etiqueta, larga: etiqueta }; });
  Object.entries(config.stock.categoriasExtra).forEach(([k, etiqueta]) => { CATEGORIAS[k] = { corta: etiqueta.split(' (')[0], larga: etiqueta }; });
  const ORDEN_CATEGORIAS = Object.keys(CATEGORIAS);
  const categoriaCorta = (k) => (CATEGORIAS[k] ? CATEGORIAS[k].corta : k || '-');

  const SINGULAR = { unidades: 'unidad', juegos: 'juego', litros: 'litro', metros: 'metro' };
  const entera = (unidad) => config.stock.unidadesEnteras.includes(unidad || 'unidades');
  const nf2 = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 2 });
  /** Evita restos como 0,30000000000000004 al sumar decimales. */
  const redondear = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
  const numero = (n) => nf2.format(redondear(n));
  /** "1 unidad", "12 unidades", "2,5 litros". */
  function cantidadTexto(n, unidad) {
    const u = unidad || 'unidades';
    return `${numero(n)} ${Math.abs(redondear(n)) === 1 && SINGULAR[u] ? SINGULAR[u] : u}`;
  }
  /** Paso de los campos de cantidad: de a uno para unidades y juegos. */
  const paso = (unidad) => (entera(unidad) ? '1' : 'any');
  /** Cantidad mínima mayor que cero que se puede cargar. */
  const minimoPositivo = (unidad) => (entera(unidad) ? '1' : '0.01');

  // ---------- Cantidades ----------
  /** Repuestos que usó un mantenimiento: [{ itemId, nombre, unidad, cantidad }]. */
  const usosDe = (r) => (r && Array.isArray(r.usados) ? r.usados.filter((u) => u && u.itemId && Number(u.cantidad) > 0) : []);

  /** Cantidad actual de todos los repuestos: Map itemId → cantidad. */
  function existencias() {
    const hay = new Map();
    const sumar = (id, n) => hay.set(id, (hay.get(id) || 0) + (Number(n) || 0));
    store.todos('stockMovimientos').forEach((m) => sumar(m.itemId, m.cantidad));
    store.todos('mantenimiento').forEach((r) => usosDe(r).forEach((u) => sumar(u.itemId, -u.cantidad)));
    hay.forEach((n, id) => hay.set(id, redondear(n)));
    return hay;
  }
  const cantidad = (itemId) => existencias().get(itemId) || 0;

  const ESTADOS = {
    ok:   { etiqueta: 'OK',        chip: 'chip-operativo' },
    bajo: { etiqueta: 'Reponer',   chip: 'chip-observaciones' },
    sin:  { etiqueta: 'Sin stock', chip: 'chip-fuera' },
  };
  /** 'sin' si no queda ninguno, 'bajo' si llegó al mínimo, 'ok' si no. */
  function estado(item, hay) {
    if (hay <= 0) return 'sin';
    if (hay <= (Number(item.minimo) || 0)) return 'bajo';
    return 'ok';
  }
  const chipEstado = (e) => el('span', { className: 'chip ' + ESTADOS[e].chip, text: ESTADOS[e].etiqueta });

  /** Repuestos que hay que reponer, primero los que no tienen stock. */
  function paraReponer(hay) {
    const h = hay || existencias();
    return store.todos('stock')
      .map((item) => ({ item, hay: h.get(item.id) || 0, estado: estado(item, h.get(item.id) || 0) }))
      .filter((x) => x.estado !== 'ok')
      .sort((a, b) => (a.estado === b.estado ? a.item.nombre.localeCompare(b.item.nombre, 'es') : a.estado === 'sin' ? -1 : 1));
  }

  /** Texto de lo que queda, para avisos y tarjetas. */
  function textoQueda(item, hay) {
    if (hay < 0) return `Stock en negativo (${numero(hay)}): revisá el conteo`;
    if (hay === 0) return `No queda ninguno · mínimo ${numero(item.minimo || 0)}`;
    return `Quedan ${cantidadTexto(hay, item.unidad)} · mínimo ${numero(item.minimo || 0)}`;
  }

  /** Aviso si alguno de estos repuestos quedó en el mínimo o sin stock (después de usarlo). */
  function avisarSiFalta(itemIds) {
    const ids = new Set(itemIds);
    const faltan = paraReponer().filter((x) => ids.has(x.item.id));
    if (!faltan.length) return;
    const ir = { texto: 'Ver stock', fn: () => SoyaCore.navegar('stock') };
    if (faltan.length === 1) {
      const { item, hay } = faltan[0];
      toast(`Hay que reponer "${item.nombre}": ${hay > 0 ? `quedan ${cantidadTexto(hay, item.unidad)} (mínimo ${numero(item.minimo || 0)})` : hay === 0 ? 'no queda ninguno' : 'el stock quedó en negativo'}.`, 'aviso', ir);
    } else {
      toast(`Hay que reponer ${faltan.length} repuestos: ${faltan.map((x) => x.item.nombre).join(', ')}.`, 'aviso', ir);
    }
  }

  // ---------- Aviso en el menú ----------
  function actualizarAviso(faltan) {
    const badge = $('#stock-badge');
    badge.hidden = !faltan.length;
    if (!faltan.length) return;
    const sinStock = faltan.filter((x) => x.estado === 'sin').length;
    badge.classList.toggle('nav-badge-sin', sinStock > 0);
    badge.title = `${faltan.length} repuesto(s) para reponer` + (sinStock ? ` (${sinStock} sin stock)` : '');
    badge.replaceChildren(document.createTextNode(String(faltan.length)), el('span', { className: 'sr-only', text: ' para reponer' }));
  }

  // ---------- Panel "Para reponer" ----------
  function dibujarReponer(faltan) {
    $('#stock-reponer').hidden = !faltan.length;
    $('#stock-reponer-titulo').textContent = faltan.length === 1 ? 'Para reponer: 1 repuesto' : `Para reponer: ${faltan.length} repuestos`;
    $('#stock-reponer-lista').replaceChildren(...faltan.map(({ item, hay, estado: e }) => {
      const boton = el('button', { className: 'btn w-auto shrink-0 bg-amber-400 px-3 py-1.5 text-xs text-slate-950 hover:bg-amber-300', attrs: { type: 'button', 'data-cargar-compra': item.id } }, [
        el('i', { attrs: { 'data-lucide': 'package-plus' }, className: 'h-3.5 w-3.5' }),
        el('span', { text: 'Cargar compra' }),
      ]);
      boton.setAttribute('aria-label', `Cargar compra de ${item.nombre}`);
      return el('li', { className: `stock-card stock-${e}` }, [
        el('div', { className: 'min-w-0' }, [
          el('p', { className: 'truncate font-semibold text-slate-100', text: item.nombre, attrs: { title: item.nombre } }),
          el('p', { className: 'mt-0.5 text-[11px] ' + (e === 'sin' ? 'text-red-300' : 'text-amber-300'), text: `${categoriaCorta(item.categoria)} · ${textoQueda(item, hay)}` }),
        ]),
        boton,
      ]);
    }));
    SoyaCore.icons.render($('#stock-reponer-lista'));
  }

  // ---------- Filtro y búsqueda de la tabla ----------
  const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  let hayTabla = new Map();

  function ordenarYFiltrar(items) {
    const buscar = normal($('#stock-buscar').value);
    const filtro = $('#stock-filtro').value;
    const visibles = items
      .filter((i) => !buscar || [i.nombre, i.codigo, i.ubicacion].some((t) => normal(t).includes(buscar)))
      .filter((i) => !filtro || (filtro === '_reponer' ? estado(i, hayTabla.get(i.id) || 0) !== 'ok' : i.categoria === filtro))
      .sort((a, b) => {
        const ca = ORDEN_CATEGORIAS.indexOf(a.categoria);
        const cb = ORDEN_CATEGORIAS.indexOf(b.categoria);
        return ca !== cb ? (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) : String(a.nombre).localeCompare(String(b.nombre), 'es');
      });
    const total = items.length;
    $('#caption-stock').textContent = !total ? ''
      : visibles.length === total ? `${fmt.entero(total)} repuesto(s).`
      : `Mostrando ${fmt.entero(visibles.length)} de ${fmt.entero(total)} repuestos.`;
    return visibles;
  }

  const COLUMNAS = [
    {
      render: (r) => el('div', { className: 'min-w-0' }, [
        el('p', { className: 'max-w-64 truncate font-semibold text-slate-100', text: r.nombre, attrs: { title: r.nombre } }),
        r.codigo ? el('p', { className: 'max-w-64 truncate text-[11px] text-slate-500', text: r.codigo }) : null,
      ]),
    },
    { key: 'categoria', format: (v) => categoriaCorta(v) },
    { key: 'ubicacion', className: 'max-w-40 truncate text-slate-400' },
    {
      className: 'num',
      render: (r) => {
        const hay = hayTabla.get(r.id) || 0;
        const e = estado(r, hay);
        return el('span', { className: 'font-bold ' + (e === 'sin' ? 'text-red-300' : e === 'bajo' ? 'text-amber-300' : 'text-white'), text: cantidadTexto(hay, r.unidad) });
      },
    },
    { key: 'minimo', className: 'num', format: (v) => numero(v || 0) },
    { render: (r) => chipEstado(estado(r, hayTabla.get(r.id) || 0)) },
  ];

  // ---------- Diálogo: entró / salió / contamos ----------
  const TIPOS_MOV = {
    entrada: { etiqueta: 'Cuántos entraron', ayuda: 'Se suma a lo que hay.' },
    salida:  { etiqueta: 'Cuántos salieron', ayuda: 'Se resta de lo que hay. Si se usó en un equipo, mejor cargalo en Mantenimientos: así queda en qué equipo se usó y se descuenta solo.' },
    ajuste:  { etiqueta: 'Cuántos hay contados', ayuda: 'Poné lo que contaste en el depósito: la app anota la diferencia como corrección.' },
  };
  const TEXTO_MOV = { alta: 'Cantidad inicial', entrada: 'Entró', salida: 'Salió', ajuste: 'Corrección por conteo' };
  let movItemId = null;
  let movTipo = 'entrada';

  function itemMov() { return movItemId ? store.buscar('stock', movItemId) : null; }

  function previewMov() {
    const item = itemMov();
    if (!item) return;
    const hay = cantidad(item.id);
    const n = num($('#stock-mov-cantidad'));
    const queda = isNaN(n) ? NaN : movTipo === 'entrada' ? hay + n : movTipo === 'salida' ? hay - n : n;
    const salida = $('#stock-mov-queda');
    salida.textContent = isNaN(queda) ? '-' : cantidadTexto(queda, item.unidad);
    salida.className = 'text-xl font-bold ' + (isNaN(queda) ? 'text-white' : queda < 0 ? 'text-red-300' : estado(item, queda) === 'ok' ? 'text-white' : 'text-amber-300');
    $('#stock-mov-cantidad').setCustomValidity('');
  }

  function elegirTipo(tipo) {
    movTipo = tipo;
    $$('#stock-dialogo [data-mov]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mov === tipo)));
    const item = itemMov();
    const input = $('#stock-mov-cantidad');
    $('#stock-mov-label').textContent = TIPOS_MOV[tipo].etiqueta;
    $('#stock-mov-ayuda').textContent = TIPOS_MOV[tipo].ayuda;
    input.step = paso(item && item.unidad);
    input.min = tipo === 'ajuste' ? '0' : minimoPositivo(item && item.unidad);
    previewMov();
  }

  /** Movimientos y usos en mantenimiento de un repuesto, el más nuevo primero. */
  function historial(itemId) {
    const lista = store.todos('stockMovimientos').filter((m) => m.itemId === itemId).map((m) => ({
      fecha: m.fecha,
      texto: m.tipo === 'ajuste' && m.contado != null ? `Contamos ${numero(m.contado)}` : TEXTO_MOV[m.tipo] || 'Movimiento',
      detalle: m.nota || '',
      cantidad: Number(m.cantidad) || 0,
    }));
    store.todos('mantenimiento').forEach((r) => usosDe(r).filter((u) => u.itemId === itemId).forEach((u) => lista.push({
      fecha: r.fecha,
      texto: `Usado en ${SoyaCore.planta.nombreDe(r)}`,
      detalle: r.tarea || '',
      cantidad: -Number(u.cantidad),
    })));
    // Si dos movimientos tienen la misma fecha y hora, queda arriba el último que se cargó.
    return lista.reverse().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  function dibujarDialogo() {
    const item = itemMov();
    if (!item) return;
    const hay = cantidad(item.id);
    $('#stock-dialogo-nombre').textContent = item.nombre;
    $('#stock-dialogo-sub').textContent = [categoriaCorta(item.categoria), item.codigo, item.ubicacion].filter(Boolean).join(' · ');
    $('#stock-dialogo-hay').textContent = cantidadTexto(hay, item.unidad);
    const e = estado(item, hay);
    const chip = $('#stock-dialogo-chip');
    chip.className = 'chip ' + ESTADOS[e].chip;
    chip.textContent = ESTADOS[e].etiqueta;

    const movs = historial(item.id);
    const fechaCorta = (f) => `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}/${String(f).slice(2, 4)} ${String(f).slice(11, 16)}`;
    $('#stock-dialogo-historial').replaceChildren(...(movs.length ? movs.slice(0, 60).map((m) => el('li', { className: 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-3 rounded-lg bg-slate-950/40 px-3 py-1.5' }, [
      el('span', { className: 'text-slate-500 tabular-nums', text: fechaCorta(m.fecha) }),
      el('span', { className: 'min-w-0 truncate text-slate-300', text: m.detalle ? `${m.texto} · ${m.detalle}` : m.texto, attrs: { title: m.detalle ? `${m.texto} · ${m.detalle}` : m.texto } }),
      el('span', { className: 'font-bold tabular-nums ' + (m.cantidad > 0 ? 'text-emerald-300' : m.cantidad < 0 ? 'text-red-300' : 'text-slate-400'), text: (m.cantidad > 0 ? '+' : m.cantidad < 0 ? '−' : '') + numero(Math.abs(m.cantidad)) }),
    ])) : [el('li', { className: 'text-slate-500 italic', text: 'Sin movimientos todavía.' })]));
    previewMov();
  }

  function abrirMovimiento(item, tipo) {
    movItemId = item.id;
    $('#stock-mov-cantidad').value = '';
    $('#stock-mov-nota').value = '';
    elegirTipo(tipo || 'entrada');
    dibujarDialogo();
    $('#stock-dialogo').showModal();
    $('#stock-mov-cantidad').focus();
  }

  function initDialogo() {
    const dialogo = $('#stock-dialogo');
    const cerrar = () => dialogo.close();
    dialogo.addEventListener('close', () => { movItemId = null; });
    $('#stock-dialogo-cerrar').addEventListener('click', cerrar);
    $('#stock-dialogo-cancelar').addEventListener('click', cerrar);
    $$('#stock-dialogo [data-mov]').forEach((b) => b.addEventListener('click', () => { elegirTipo(b.dataset.mov); $('#stock-mov-cantidad').focus(); }));
    $('#stock-mov-cantidad').addEventListener('input', previewMov);

    $('#form-stock-mov').addEventListener('submit', (e) => {
      e.preventDefault();
      const item = itemMov();
      if (!item) { cerrar(); return; }
      const input = $('#stock-mov-cantidad');
      const n = redondear(num(input));
      const hay = cantidad(item.id);
      const invalido = (msg) => { input.setCustomValidity(msg); input.reportValidity(); };
      if (isNaN(n)) return invalido('Poné la cantidad.');
      if (movTipo !== 'ajuste' && !(n > 0)) return invalido('Poné una cantidad mayor que cero.');
      if (movTipo === 'salida' && n > hay) {
        return invalido(hay > 0
          ? `Hay ${cantidadTexto(hay, item.unidad)}: no pueden salir más. Si contaste y no coincide, usá "Contamos".`
          : 'No hay stock de este repuesto. Si contaste y no coincide, usá "Contamos".');
      }
      const delta = movTipo === 'entrada' ? n : movTipo === 'salida' ? -n : redondear(n - hay);
      if (movTipo === 'ajuste' && delta === 0) {
        cerrar();
        toast(`Coincide: hay ${cantidadTexto(hay, item.unidad)}. No hacía falta corregir nada.`, 'ok');
        return;
      }
      const mov = store.agregar('stockMovimientos', Object.assign(
        { fecha: ahora(), itemId: item.id, tipo: movTipo, cantidad: delta, nota: $('#stock-mov-nota').value.trim() },
        movTipo === 'ajuste' ? { contado: n } : {},
      ));
      if (!mov) return;
      cerrar();
      toast(`${item.nombre}: ahora hay ${cantidadTexto(cantidad(item.id), item.unidad)}.`, 'ok', {
        texto: 'Deshacer',
        fn: () => store.borrar('stockMovimientos', mov.id) && toast('Movimiento deshecho.', 'ok'),
      });
      if (movTipo !== 'entrada') avisarSiFalta([item.id]);
    });
  }

  // ---------- Pasar el stock del sistema anterior (v2.5) ----------
  /**
   * La v2.5 guardaba el stock en "soyacore_stock" como { n, c, u, q, m }. Si está
   * en esta PC y el stock nuevo está vacío, se pasa una sola vez.
   */
  function importarStockViejo() {
    const MARCA = 'soya_stock_importado';
    try {
      if (localStorage.getItem(MARCA) || store.todos('stock').length) return;
      const viejo = JSON.parse(localStorage.getItem('soyacore_stock') || 'null');
      if (!Array.isArray(viejo) || !viejo.length) return;
      const categorias = { 'Repuestos Prensas': 'Extrusora', 'Repuestos Extrusor': 'Extrusor' };
      let pasados = 0;
      viejo.forEach((s) => {
        if (!s || !String(s.n || '').trim()) return;
        const item = store.agregar('stock', {
          fecha: ahora(),
          nombre: String(s.n).trim().slice(0, 120),
          codigo: '',
          categoria: categorias[s.c] || 'General',
          unidad: 'unidades',
          minimo: Math.max(0, Number(s.m) || 0),
          ubicacion: s.u && s.u !== 'Gen' ? String(s.u).slice(0, 60) : '',
        });
        if (!item) return;
        pasados++;
        if (Number(s.q)) store.agregar('stockMovimientos', { fecha: item.fecha, itemId: item.id, tipo: 'alta', cantidad: Number(s.q), nota: 'Pasado del sistema anterior' });
      });
      localStorage.setItem(MARCA, ahora());
      if (pasados) toast(`Se pasaron ${pasados} repuestos del stock del sistema anterior.`, 'ok');
    } catch (err) {
      console.warn('[SoyaCore] No se pudo pasar el stock anterior', err);
    }
  }

  // ---------- Vista ----------
  let tabla;

  function dibujar() {
    hayTabla = existencias();
    const faltan = paraReponer(hayTabla);
    actualizarAviso(faltan);
    dibujarReponer(faltan);
    tabla.dibujar();
    if ($('#stock-dialogo').open) dibujarDialogo();
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.stock = {
    init() {
      const opcionesCategoria = ORDEN_CATEGORIAS.map((k) => ({ value: k, label: CATEGORIAS[k].larga }));
      fillSelect($('#stock-categoria'), opcionesCategoria);
      fillSelect($('#stock-unidad'), config.stock.unidades);
      fillSelect($('#stock-filtro'), [
        { value: '', label: 'Todos los sectores' },
        { value: '_reponer', label: 'Solo para reponer' },
        ...ORDEN_CATEGORIAS.map((k) => ({ value: k, label: CATEGORIAS[k].corta })),
      ]);

      // ---- Formulario de repuesto (nuevo o editar) ----
      const form = $('#form-stock');
      const inputCantidad = $('#stock-cantidad');
      let cantidadAlAbrir = null; // al editar: lo que había cuando se abrió el formulario

      const actualizarPasos = () => {
        const u = $('#stock-unidad').value;
        inputCantidad.step = cantidadAlAbrir != null && !Number.isInteger(cantidadAlAbrir) ? 'any' : paso(u);
        $('#stock-minimo').step = paso(u);
      };
      $('#stock-unidad').addEventListener('change', actualizarPasos);
      $('#stock-nombre').addEventListener('input', (e) => e.target.setCustomValidity(''));
      $('#stock-categoria').addEventListener('change', () => $('#stock-nombre').setCustomValidity(''));

      // El formulario está en una ventana: "Agregar repuesto" la abre vacía y el lápiz, con el repuesto.
      const dialogo = $('#stock-item-dialogo');
      let editor;
      const abrirItem = (r) => {
        if (!dialogo.open) dialogo.showModal();
        if (r) editor.editar(r);
        else { editor.terminar(); $('#stock-nombre').focus(); }
      };
      const cerrarItem = () => dialogo.open && dialogo.close();
      dialogo.addEventListener('close', () => editor.terminar());
      $('#stock-item-cerrar').addEventListener('click', cerrarItem);
      form.querySelector('[data-cancelar]').addEventListener('click', cerrarItem);
      $('#stock-agregar').addEventListener('click', () => abrirItem(null));

      tabla = tablaRegistros({
        tbody: $('#tbody-stock'),
        caption: null,
        coleccion: 'stock',
        columnas: COLUMNAS,
        onEditar: (r) => abrirItem(r),
        ordenar: ordenarYFiltrar,
        describir: (r) => r.nombre,
        mensajeBorrado: (r) => `"${r.nombre}" se sacó del stock.`,
        vacio: () => (!store.todos('stock').length ? 'Todavía no hay repuestos. Tocá "Agregar repuesto" para cargar el primero.'
          : $('#stock-filtro').value === '_reponer' && !$('#stock-buscar').value.trim() ? 'No hay repuestos para reponer.'
          : 'Ningún repuesto coincide con la búsqueda.'),
        claseFila: (r) => (estado(r, hayTabla.get(r.id) || 0) === 'sin' ? 'fila-stock-sin' : ''),
        acciones: [
          { accion: 'mover', icono: 'arrow-left-right', etiqueta: 'Entró / salió / contamos', fn: (r) => abrirMovimiento(r, 'entrada') },
        ],
      });

      editor = editorFormulario(form, {
        tabla,
        tituloEdicion: (r) => `Editando: ${r.nombre}`,
        rellenar(r) {
          $('#stock-nombre').value = r.nombre || '';
          $('#stock-categoria').value = CATEGORIAS[r.categoria] ? r.categoria : 'General';
          $('#stock-codigo').value = r.codigo || '';
          $('#stock-unidad').value = config.stock.unidades.includes(r.unidad) ? r.unidad : 'unidades';
          $('#stock-minimo').value = r.minimo != null ? r.minimo : '';
          $('#stock-ubicacion').value = r.ubicacion || '';
          cantidadAlAbrir = cantidad(r.id);
          inputCantidad.value = cantidadAlAbrir;
          inputCantidad.min = String(Math.min(0, cantidadAlAbrir));
          $('#stock-cantidad-label').textContent = 'Cantidad que hay ahora';
          $('#stock-cantidad-hint').hidden = false;
          actualizarPasos();
        },
        alTerminar() {
          cantidadAlAbrir = null;
          inputCantidad.min = '0';
          $('#stock-cantidad-label').textContent = 'Cantidad que hay';
          $('#stock-cantidad-hint').hidden = true;
          $('#stock-nombre').setCustomValidity('');
          actualizarPasos();
        },
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = $('#stock-nombre').value.trim().replace(/\s+/g, ' ');
        const categoria = $('#stock-categoria').value;
        const id = editor.id;
        const repetido = store.todos('stock').find((i) => i.id !== id && normal(i.nombre) === normal(nombre) && i.categoria === categoria);
        if (repetido) {
          const campo = $('#stock-nombre');
          campo.setCustomValidity(`Ya hay un "${repetido.nombre}" para ${categoriaCorta(categoria)}. Si entraron más, usá el botón Entró / salió de la tabla.`);
          campo.reportValidity();
          return;
        }
        const datos = {
          nombre,
          codigo: $('#stock-codigo').value.trim(),
          categoria,
          unidad: $('#stock-unidad').value,
          minimo: num($('#stock-minimo')),
          ubicacion: $('#stock-ubicacion').value.trim(),
        };
        const nuevaCantidad = redondear(num(inputCantidad));
        const cambioCantidad = id && cantidadAlAbrir != null && nuevaCantidad !== redondear(cantidadAlAbrir);
        const guardado = guardarRegistro('stock', editor, datos, { nuevo: `"${nombre}" agregado al stock.` });
        if (!guardado) return;
        cerrarItem();
        if (!id && nuevaCantidad) {
          store.agregar('stockMovimientos', { fecha: guardado.fecha, itemId: guardado.id, tipo: 'alta', cantidad: nuevaCantidad, nota: '' });
        } else if (cambioCantidad) {
          const delta = redondear(nuevaCantidad - cantidad(id));
          if (delta) store.agregar('stockMovimientos', { fecha: ahora(), itemId: id, tipo: 'ajuste', cantidad: delta, contado: nuevaCantidad, nota: 'Corregido al editar el repuesto' });
        }
        avisarSiFalta([guardado.id]);
      });

      // ---- Filtros, panel y diálogo ----
      $('#stock-buscar').addEventListener('input', () => tabla.dibujar());
      $('#stock-filtro').addEventListener('change', () => tabla.dibujar());
      $('#stock-reponer-lista').addEventListener('click', (e) => {
        const boton = e.target.closest('[data-cargar-compra]');
        const item = boton && store.buscar('stock', boton.dataset.cargarCompra);
        if (item) abrirMovimiento(item, 'entrada');
      });
      initDialogo();

      importarStockViejo();
      store.alCambiar((c) => ['stock', 'stockMovimientos', 'mantenimiento', '*'].includes(c) && dibujar());
      actualizarPasos();
      dibujar();
    },
    refresh() {},

    // Para Mantenimientos
    existencias,
    cantidad,
    estado,
    usosDe,
    entera,
    paso,
    minimoPositivo,
    redondear,
    cantidadTexto,
    categoriaCorta,
    avisarSiFalta,
    abrirMovimiento,
  };
})(window.SoyaCore = window.SoyaCore || {});
