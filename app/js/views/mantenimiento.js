/*
 * Vista: Mantenimiento de los equipos, por lugar (Línea 1, Línea 2, Tanques de
 * aceite, Exteriores; ver config.lugares). Cada registro guarda el equipo
 * (equipoId), su lugar, su nombre y su tipo.
 *
 * Los repuestos del stock que se usaron se guardan en el registro
 * (usados: [{ itemId, nombre, unidad, cantidad }]) y se descuentan solos del
 * stock (ver views/stock.js). Los que no están en el stock van como texto
 * en "Otros repuestos".
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fillSelect, num, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const { store } = SoyaCore;
  const planta = SoyaCore.planta;
  const estados = SoyaCore.config.estadosEquipo;
  const stock = SoyaCore.views.stock;
  /** Los registros anteriores a la v2.11 no tenían estado: se toman como operativos. */
  const estadoDe = (r) => (r && estados[r.estado] ? r.estado : 'operativo');

  /** Repuestos de un registro como texto: los del stock con su cantidad y los otros. */
  function textoRepuestos(r) {
    const partes = stock.usosDe(r).map((u) => {
      const item = store.buscar('stock', u.itemId);
      return `${item ? item.nombre : u.nombre} (${stock.cantidadTexto(u.cantidad, item ? item.unidad : u.unidad)})`;
    });
    const otros = r.repuestos && r.repuestos !== 'Ninguno' ? r.repuestos : '';
    if (otros) partes.push(otros);
    return partes.join(' · ') || 'Ninguno';
  }

  const COLUMNAS = [
    { key: 'fecha' },
    {
      className: 'min-w-40 whitespace-normal',
      render: (r) => {
        const eq = planta.de(r);
        return el('div', null, [
          el('p', { className: 'text-slate-200', text: eq ? eq.nombre : r.equipo || '-' }),
          el('p', { className: 'text-[11px] text-slate-500', text: eq ? eq.lugarNombre : 'Ya no está en la lista' }),
        ]);
      },
    },
    { key: 'tarea', className: 'max-w-56 truncate' },
    { key: 'repuestos', className: 'max-w-56 truncate', format: (_, r) => textoRepuestos(r) },
    { key: 'estado', format: (_, r) => estados[estadoDe(r)].etiqueta },
    { key: 'observaciones', className: 'max-w-56 truncate' },
  ];

  /** Equipos que ya no están en la lista (registros viejos sin equivalencia). */
  const OTROS = '_otros';
  /** Al editar uno de esos registros: su nombre y su tipo, para guardarlo igual. */
  let equipoViejo = null;
  /** Hasta la 2.20 las extrusoras se llamaban prensas. */
  const TIPO_ANTERIOR = { Prensa: 'Extrusora' };

  /** Tipo del equipo elegido: decide qué repuestos del stock se ofrecen primero. */
  function tipoElegido() {
    const eq = planta.buscar($('#mant-equipo').value);
    if (eq) return eq.tipo;
    return equipoViejo ? TIPO_ANTERIOR[equipoViejo.tipo] || equipoViejo.tipo || null : null;
  }

  // ---------- Repuestos del stock que se usaron ----------
  /**
   * Al editar un registro, lo que ya usaba está descontado del stock: para mostrar
   * cuánto hay "antes" de este registro se le vuelve a sumar.
   */
  let usadosAntes = new Map();

  function disponibleAntes(itemId, hay) {
    return stock.redondear((hay.get(itemId) || 0) + (usadosAntes.get(itemId) || 0));
  }

  /** Opciones del selector de repuestos: primero los del tipo del equipo, después los generales y el resto. */
  function llenarOpciones(select, elegido, hay) {
    const tipo = tipoElegido();
    const items = store.todos('stock').slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const grupos = [
      { etiqueta: `Para ${stock.categoriaCorta(tipo)}`, items: tipo ? items.filter((i) => i.categoria === tipo) : [] },
      { etiqueta: 'Generales', items: items.filter((i) => i.categoria === 'General') },
      { etiqueta: 'De otros sectores', items: items.filter((i) => i.categoria !== tipo && i.categoria !== 'General') },
    ];
    const frag = document.createDocumentFragment();
    frag.appendChild(el('option', { text: 'Elegí un repuesto…', attrs: { value: '' } }));
    grupos.filter((g) => g.items.length).forEach((g) => {
      const og = el('optgroup', { attrs: { label: g.etiqueta } });
      g.items.forEach((i) => og.appendChild(el('option', {
        text: `${i.nombre} · hay ${stock.cantidadTexto(disponibleAntes(i.id, hay), i.unidad)}`,
        attrs: { value: i.id },
      })));
      frag.appendChild(og);
    });
    // Un repuesto que se sacó del stock después de usarlo: se sigue mostrando.
    if (elegido && !store.buscar('stock', elegido.itemId)) {
      frag.appendChild(el('option', { text: `${elegido.nombre} (ya no está en el stock)`, attrs: { value: elegido.itemId, 'data-nombre': elegido.nombre, 'data-unidad': elegido.unidad || 'unidades' } }));
    }
    select.replaceChildren(frag);
    select.value = elegido ? elegido.itemId : '';
  }

  const filas = () => Array.from($('#mant-usados').children);

  /** Lee una fila: { itemId, nombre, unidad, cantidad } o null si está incompleta. */
  function leerFila(li) {
    const select = li.querySelector('select');
    const itemId = select.value;
    if (!itemId) return null;
    const item = store.buscar('stock', itemId);
    const opcion = select.selectedOptions[0];
    return {
      itemId,
      nombre: item ? item.nombre : opcion.dataset.nombre || opcion.textContent,
      unidad: item ? item.unidad || 'unidades' : opcion.dataset.unidad || 'unidades',
      cantidad: stock.redondear(num(li.querySelector('input'))),
    };
  }

  /** Debajo de cada fila: cuánto va a quedar en stock. */
  function actualizarAvisos() {
    const hay = stock.existencias();
    const usados = filas().map(leerFila);
    filas().forEach((li, i) => {
      const u = usados[i];
      const aviso = li.querySelector('[data-aviso]');
      const input = li.querySelector('input');
      const item = u && store.buscar('stock', u.itemId);
      input.step = stock.paso(u ? u.unidad : 'unidades');
      input.min = stock.minimoPositivo(u ? u.unidad : 'unidades');
      li.querySelector('[data-unidad]').textContent = u ? u.unidad : '';
      if (!item || !(u.cantidad > 0)) { aviso.textContent = ''; return; }
      const enEsteRegistro = usados.reduce((s, x) => s + (x && x.itemId === u.itemId && x.cantidad > 0 ? x.cantidad : 0), 0);
      const queda = stock.redondear(disponibleAntes(u.itemId, hay) - enEsteRegistro);
      const e = stock.estado(item, queda);
      aviso.className = 'min-w-0 flex-1 text-[11px] leading-snug ' + (queda < 0 ? 'text-red-300' : e === 'ok' ? 'text-slate-400' : 'text-amber-300');
      aviso.textContent = queda < 0
        ? `En el stock figuran ${stock.cantidadTexto(disponibleAntes(u.itemId, hay), item.unidad)}: va a quedar en negativo. Después revisá el conteo en Stock.`
        : `Va a quedar ${stock.cantidadTexto(queda, item.unidad)} en stock${e === 'ok' ? '.' : ': hay que reponer.'}`;
    });
  }

  function agregarFila(uso) {
    const select = el('select', { className: 'field min-w-0 flex-1', attrs: { required: '', 'aria-label': 'Repuesto del stock' } });
    const input = el('input', { className: 'field w-20 shrink-0 py-1.5', attrs: { type: 'number', required: '', min: '1', step: '1', inputmode: 'decimal', 'aria-label': 'Cantidad usada', placeholder: 'Cant.' } });
    const quitar = el('button', { className: 'btn-icon shrink-0', attrs: { type: 'button', 'aria-label': 'Quitar este repuesto', title: 'Quitar' } }, [el('i', { attrs: { 'data-lucide': 'x' }, className: 'h-3.5 w-3.5' })]);
    const li = el('li', { className: 'uso-fila' }, [
      el('div', { className: 'flex items-center gap-1' }, [select, quitar]),
      el('div', { className: 'flex items-center gap-2' }, [
        input,
        el('span', { className: 'shrink-0 text-xs text-slate-400', attrs: { 'data-unidad': '' } }),
        el('p', { attrs: { 'data-aviso': '', 'aria-live': 'polite' } }),
      ]),
    ]);
    llenarOpciones(select, uso || null, stock.existencias());
    input.value = uso ? uso.cantidad : '1';
    select.addEventListener('change', actualizarAvisos);
    input.addEventListener('input', actualizarAvisos);
    quitar.addEventListener('click', () => { li.remove(); actualizarUsados(); });
    $('#mant-usados').appendChild(li);
    SoyaCore.icons.render(li);
    actualizarAvisos();
    return li;
  }

  /** Rehace las opciones (cambió el sector o el stock) sin perder lo elegido. */
  function actualizarUsados() {
    const hay = stock.existencias();
    filas().forEach((li) => {
      const select = li.querySelector('select');
      const elegido = select.value ? leerFila(li) : null;
      llenarOpciones(select, elegido, hay);
    });
    const sinStock = !store.todos('stock').length;
    $('#mant-usados-vacio').hidden = !sinStock;
    $('#mant-agregar-uso').hidden = sinStock;
    actualizarAvisos();
  }

  /** Lo usado en el formulario, juntando el mismo repuesto si se eligió dos veces. */
  function usadosDelFormulario() {
    const porItem = new Map();
    filas().map(leerFila).filter((u) => u && u.cantidad > 0).forEach((u) => {
      const previo = porItem.get(u.itemId);
      if (previo) previo.cantidad = stock.redondear(previo.cantidad + u.cantidad);
      else porItem.set(u.itemId, u);
    });
    return [...porItem.values()];
  }

  function limpiarUsados(usados) {
    $('#mant-usados').replaceChildren();
    (usados || []).forEach((u) => agregarFila(u));
    actualizarUsados();
  }

  /** Llena los lugares; con un registro viejo sin equivalencia agrega "Otros". */
  function llenarLugares(conOtros) {
    const actual = $('#mant-lugar').value;
    const opciones = planta.lugares().map((l) => ({ value: l.id, label: l.nombre }));
    if (conOtros) opciones.push({ value: OTROS, label: 'Otros (ya no están en la lista)' });
    fillSelect($('#mant-lugar'), opciones);
    if ([...$('#mant-lugar').options].some((o) => o.value === actual)) $('#mant-lugar').value = actual;
  }

  /** Equipos del lugar elegido, en el orden de config.lugares. */
  function actualizarEquipos() {
    const lugar = planta.lugar($('#mant-lugar').value);
    const opciones = lugar
      ? lugar.equipos.map((e) => ({ value: e.id, label: e.nombre }))
      : equipoViejo ? [{ value: OTROS, label: equipoViejo.nombre }] : [];
    fillSelect($('#mant-equipo'), opciones);
    actualizarUsados();
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.mantenimiento = {
    init() {
      llenarLugares(false);
      fillSelect($('#mant-estado'), Object.entries(estados).map(([value, def]) => ({ value, label: def.etiqueta })), 'operativo');
      $('#mant-lugar').addEventListener('change', actualizarEquipos);
      $('#mant-equipo').addEventListener('change', actualizarUsados);
      $('#mant-agregar-uso').addEventListener('click', () => {
        const li = agregarFila(null);
        li.querySelector('select').focus();
      });
      actualizarEquipos();

      let editor;
      const tabla = tablaRegistros({
        tbody: $('#tbody-mantenimiento'),
        caption: $('#caption-mantenimiento'),
        coleccion: 'mantenimiento',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
        mensajeBorrado: (r) => (stock.usosDe(r).length ? 'Registro borrado. Sus repuestos volvieron al stock.' : 'Registro borrado.'),
      });
      editor = editorFormulario($('#form-mantenimiento'), {
        tabla,
        rellenar(r) {
          usadosAntes = new Map();
          stock.usosDe(r).forEach((u) => usadosAntes.set(u.itemId, (usadosAntes.get(u.itemId) || 0) + Number(u.cantidad)));
          const eq = planta.de(r);
          equipoViejo = eq ? null : { nombre: r.equipo || '-', tipo: r.tipo || '' };
          llenarLugares(!eq);
          $('#mant-lugar').value = eq ? eq.lugar : OTROS;
          actualizarEquipos();
          $('#mant-equipo').value = eq ? eq.id : OTROS;
          $('#mant-tarea').value = r.tarea || '';
          $('#mant-piezas').value = r.repuestos === 'Ninguno' ? '' : r.repuestos || '';
          $('#mant-obs').value = r.observaciones || '';
          $('#mant-estado').value = estadoDe(r);
          limpiarUsados(stock.usosDe(r));
        },
        alTerminar() {
          usadosAntes = new Map();
          equipoViejo = null;
          llenarLugares(false);
          limpiarUsados();
          actualizarEquipos();
        },
      });

      $('#form-mantenimiento').addEventListener('submit', (e) => {
        e.preventDefault();
        const usados = usadosDelFormulario();
        const otros = $('#mant-piezas').value.trim();
        const eq = planta.buscar($('#mant-equipo').value);
        const equipo = eq
          ? { lugar: eq.lugar, equipoId: eq.id, equipo: eq.nombre, tipo: eq.tipo }
          : { lugar: '', equipoId: '', equipo: equipoViejo ? equipoViejo.nombre : '', tipo: equipoViejo ? equipoViejo.tipo : '' };
        const guardado = guardarRegistro('mantenimiento', editor, {
          ...equipo,
          tarea: $('#mant-tarea').value.trim(),
          usados,
          repuestos: otros || (usados.length ? '' : 'Ninguno'),
          estado: $('#mant-estado').value,
          observaciones: $('#mant-obs').value.trim(),
        }, { nuevo: usados.length ? 'Mantenimiento guardado. Los repuestos se descontaron del stock.' : 'Registro de mantenimiento guardado.' });
        if (guardado) stock.avisarSiFalta(usados.map((u) => u.itemId));
      });

      store.alCambiar((c) => {
        if (c === 'mantenimiento' || c === '*') tabla.dibujar();
        if (c === 'stock' || c === 'stockMovimientos' || c === 'mantenimiento' || c === '*') actualizarUsados();
        if (c === 'stock') tabla.dibujar(); // los nombres de los repuestos
      });
      tabla.dibujar();
    },
    refresh() {},
    /** Prepara el formulario para un equipo (lo usa el tablero de Estado de Equipos). */
    nuevoPara(equipoId) {
      const eq = planta.buscar(equipoId);
      if (!eq) return;
      $('#mant-lugar').value = eq.lugar;
      actualizarEquipos();
      $('#mant-equipo').value = eq.id;
      actualizarUsados();
      $('#mant-tarea').focus();
    },
    estadoDe,
    textoRepuestos,
  };
})(window.SoyaCore = window.SoyaCore || {});
