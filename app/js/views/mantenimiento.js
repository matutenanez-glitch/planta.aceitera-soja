/*
 * Vista: Mantenimientos, en tres partes.
 *
 * 1. Mantenimiento de la semana: un tilde por equipo, por lugar (Línea 1,
 *    Línea 2, …; ver config.lugares). Tildar guarda un registro corto
 *    ("Mantenimiento hecho", rutina: true). Un equipo queda tildado si tiene
 *    cualquier mantenimiento cargado esa semana (de lunes a domingo).
 * 2. Qué se usó: aceite, grasa y repuestos. Salen del stock (usados: [{ itemId,
 *    nombre, unidad, cantidad }]) y se descuentan solos (ver views/stock.js). Lo
 *    que no está en el stock va como texto. Dos formas (2.27):
 *    - "Todo el mantenimiento" (la de siempre): lo que se usó en el mantenimiento,
 *      sin ir equipo por equipo (hay unos 35). Se guarda con general: true, sin
 *      equipo, y no tilda ningún equipo.
 *    - "Un equipo": para algo puntual (un cambio de crapodinas en una prensa). El
 *      equipo queda tildado en la semana.
 * 3. Historial de todos los registros, para corregir o borrar.
 *
 * Cada registro guarda el equipo (equipoId), su lugar, su nombre y su tipo
 * (los de todo el mantenimiento: general: true, equipo "Todo el mantenimiento").
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, ahora, toast, fillSelect, num, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const { store, turnos } = SoyaCore;
  const planta = SoyaCore.planta;
  const estados = SoyaCore.config.estadosEquipo;
  const stock = SoyaCore.views.stock;
  /** Los registros anteriores a la v2.11 no tenían estado: se toman como operativos. */
  const estadoDe = (r) => (r && estados[r.estado] ? r.estado : 'operativo');
  /** Registro del tilde semanal (no dice cómo quedó el equipo). */
  const esTilde = (r) => !!(r && r.rutina === true);
  /** Lo que se usó en todo el mantenimiento, sin un equipo. */
  const esGeneral = (r) => !!(r && r.general === true);
  const TAREA_TILDE = 'Mantenimiento hecho';
  const NOMBRE_GENERAL = 'Todo el mantenimiento';
  /** Cómo quedó el equipo, para mostrar ("-" en los tildes y en lo de todo el mantenimiento). */
  const quedoTexto = (r) => (esTilde(r) || esGeneral(r) ? '-' : estados[estadoDe(r)].etiqueta);

  /** Lo que se usó en un registro como texto: lo del stock con su cantidad y lo otro. */
  function textoRepuestos(r) {
    const partes = stock.usosDe(r).map((u) => {
      const item = store.buscar('stock', u.itemId);
      return `${item ? item.nombre : u.nombre} (${stock.cantidadTexto(u.cantidad, item ? item.unidad : u.unidad)})`;
    });
    const otros = r.repuestos && r.repuestos !== 'Ninguno' ? r.repuestos : '';
    if (otros) partes.push(otros);
    return partes.join(' · ') || (esTilde(r) ? '-' : 'Nada');
  }

  // =====================================================================
  // 1. Mantenimiento de la semana
  // =====================================================================
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  /** Lunes (YYYY-MM-DD) de la semana de un día. */
  function lunesDe(iso) {
    const d = turnos.fechaDia(iso);
    return turnos.sumarDias(iso, -((d.getDay() + 6) % 7));
  }
  const corta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const conDia = (fecha) => `${DIAS[turnos.fechaDia(String(fecha).slice(0, 10)).getDay()]} ${corta(String(fecha))}`;
  const enSemana = (r, lunes) => { const d = String(r.fecha).slice(0, 10); return d >= lunes && d <= turnos.sumarDias(lunes, 6); };

  let semana = lunesDe(SoyaCore.ui.hoy());
  /** Tilde que hay que volver a enfocar después de redibujar (para usar con teclado). */
  let focoPendiente = null;
  const esSemanaActual = () => semana === lunesDe(SoyaCore.ui.hoy());

  /** Registros de la semana por equipo: Map equipoId → [registros]. */
  function registrosDeSemana(lunes) {
    const porEquipo = new Map();
    store.todos('mantenimiento').filter((r) => enSemana(r, lunes)).forEach((r) => {
      const eq = planta.de(r);
      if (!eq) return;
      if (!porEquipo.has(eq.id)) porEquipo.set(eq.id, []);
      porEquipo.get(eq.id).push(r);
    });
    return porEquipo;
  }

  /** Todo lo que se usó en la semana (de todos los registros), sumado por repuesto. */
  function usadosDeSemana(lunes) {
    const porItem = new Map();
    store.todos('mantenimiento').filter((r) => enSemana(r, lunes)).forEach((r) => stock.usosDe(r).forEach((u) => {
      const previo = porItem.get(u.itemId);
      if (previo) previo.cantidad = stock.redondear(previo.cantidad + Number(u.cantidad));
      else porItem.set(u.itemId, { itemId: u.itemId, nombre: u.nombre, unidad: u.unidad, cantidad: Number(u.cantidad) });
    }));
    return [...porItem.values()].map((u) => {
      const item = store.buscar('stock', u.itemId);
      return `${item ? item.nombre : u.nombre} ${stock.cantidadTexto(u.cantidad, item ? item.unidad : u.unidad)}`;
    });
  }

  /** Fecha para un tilde: ahora si es esta semana; si no, el sábado de esa semana. */
  function fechaTilde() {
    if (esSemanaActual()) return ahora();
    const dia = turnos.sumarDias(semana, (SoyaCore.config.diaMantenimiento + 6) % 7);
    return `${dia} 12:00`;
  }

  function tildar(eq) {
    return store.agregar('mantenimiento', {
      fecha: fechaTilde(), lugar: eq.lugar, equipoId: eq.id, equipo: eq.nombre, tipo: eq.tipo,
      tarea: TAREA_TILDE, rutina: true, usados: [], repuestos: '', estado: '', observaciones: '',
    });
  }

  /** Destildar: borra los tildes de esa semana. Si tiene algo más cargado, no se puede. */
  function destildar(eq, registros) {
    const otros = registros.filter((r) => !esTilde(r));
    if (otros.length) {
      toast(`${eq.nombre} tiene cargado ${otros.length === 1 ? 'un mantenimiento' : `${otros.length} mantenimientos`} esta semana (en el historial). Para destildarlo, borralo ahí.`, 'aviso');
      return false;
    }
    registros.forEach((r) => store.borrar('mantenimiento', r.id));
    return true;
  }

  function dibujarSemana() {
    const domingo = turnos.sumarDias(semana, 6);
    $('#semana-rango').textContent = esSemanaActual()
      ? `Esta semana · ${corta(semana)} al ${corta(domingo)}`
      : `Semana del ${corta(semana)} al ${corta(domingo)}`;
    $('#semana-siguiente').disabled = esSemanaActual();

    const porEquipo = registrosDeSemana(semana);
    const lugares = planta.lugares();
    const total = lugares.reduce((s, l) => s + l.equipos.length, 0);
    const hechos = lugares.reduce((s, l) => s + l.equipos.filter((e) => porEquipo.has(e.id)).length, 0);
    $('#semana-total').textContent = `${hechos} de ${total} equipos`;
    $('#semana-barra').style.width = `${total ? Math.round((hechos / total) * 100) : 0}%`;

    $('#semana-lugares').replaceChildren(...lugares.map((l) => {
      const hechosLugar = l.equipos.filter((e) => porEquipo.has(e.id)).length;
      const completo = hechosLugar === l.equipos.length;
      const todos = el('button', { className: 'btn-sm', text: 'Tildar todos', attrs: { type: 'button', 'data-tildar-todos': l.id } });
      todos.hidden = completo;
      return el('section', { className: 'rounded-xl border bg-slate-950/40 p-3 ' + (completo ? 'border-emerald-500/40' : 'border-slate-800'), attrs: { 'aria-label': l.nombre, 'data-lugar': l.id } }, [
        el('div', { className: 'mb-2 flex items-center justify-between gap-2' }, [
          el('h4', { className: 'font-semibold text-slate-100', text: l.nombre }),
          el('div', { className: 'flex items-center gap-2' }, [
            el('span', { className: 'text-xs font-bold tabular-nums ' + (completo ? 'text-emerald-300' : 'text-slate-400'), attrs: { 'data-cuenta': '' }, text: `${hechosLugar} de ${l.equipos.length}` }),
            todos,
          ]),
        ]),
        el('ul', { className: 'space-y-0.5' }, l.equipos.map((e) => {
          const regs = porEquipo.get(e.id) || [];
          const hecho = regs.length > 0;
          const conUsos = regs.some((r) => stock.usosDe(r).length || (r.repuestos && r.repuestos !== 'Ninguno'));
          const ultimo = regs.map((r) => r.fecha).sort().pop();
          const caja = el('input', { className: 'check-equipo', attrs: { type: 'checkbox', 'data-tilde': e.id, 'aria-label': `${e.nombre} (${l.nombre}): mantenimiento hecho` } });
          caja.checked = hecho;
          return el('li', null, [
            el('label', { className: 'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-800/60' + (hecho ? ' text-slate-100' : ' text-slate-300') }, [
              caja,
              el('span', { className: 'min-w-0 flex-1 leading-snug', text: e.nombre }),
              conUsos ? el('i', { attrs: { 'data-lucide': 'package-minus', title: 'Con repuestos o consumibles cargados' }, className: 'h-3.5 w-3.5 shrink-0 text-brand-400' }) : null,
              el('span', { className: 'shrink-0 text-[11px] tabular-nums text-slate-500', text: hecho ? conDia(ultimo) : '' }),
            ]),
          ]);
        })),
      ]);
    }));
    SoyaCore.icons.render($('#semana-lugares'));
    const usados = usadosDeSemana(semana);
    $('#semana-usados').textContent = usados.length ? usados.join(' · ') : 'Todavía no se anotaron repuestos en esta semana.';
    if (focoPendiente) {
      const caja = document.querySelector(`#semana-lugares [data-tilde="${focoPendiente}"]`);
      if (caja) caja.focus();
      focoPendiente = null;
    }
  }

  function initSemana() {
    $('#semana-anterior').addEventListener('click', () => { semana = turnos.sumarDias(semana, -7); dibujarSemana(); });
    $('#semana-siguiente').addEventListener('click', () => { if (!esSemanaActual()) { semana = turnos.sumarDias(semana, 7); dibujarSemana(); } });
    $('#semana-lugares').addEventListener('change', (ev) => {
      const caja = ev.target.closest('[data-tilde]');
      const eq = caja && planta.buscar(caja.dataset.tilde);
      if (!eq) return;
      const regs = registrosDeSemana(semana).get(eq.id) || [];
      focoPendiente = eq.id;
      if (caja.checked && !regs.length) tildar(eq);
      else if (!caja.checked && regs.length && !destildar(eq, regs)) caja.checked = true;
    });
    $('#semana-lugares').addEventListener('click', (ev) => {
      const boton = ev.target.closest('[data-tildar-todos]');
      const lugar = boton && planta.lugar(boton.dataset.tildarTodos);
      if (!lugar) return;
      const porEquipo = registrosDeSemana(semana);
      const nuevos = lugar.equipos.filter((e) => !porEquipo.has(e.id)).map(tildar).filter(Boolean);
      if (nuevos.length) {
        toast(`${lugar.nombre}: ${nuevos.length === 1 ? '1 equipo tildado' : `${nuevos.length} equipos tildados`}.`, 'ok', {
          texto: 'Deshacer',
          fn: () => nuevos.forEach((r) => store.borrar('mantenimiento', r.id)),
        });
      }
    });
  }

  // =====================================================================
  // 2. Qué se usó
  // =====================================================================
  const CLASES = {
    aceite:   { etiqueta: 'Aceite',   icono: 'droplet', categoria: 'Aceite', elegir: 'Elegí el aceite…',   vacio: 'No hay aceites cargados en el stock.' },
    grasa:    { etiqueta: 'Grasa',    icono: 'beaker',  categoria: 'Grasa',  elegir: 'Elegí la grasa…',    vacio: 'No hay grasas cargadas en el stock.' },
    repuesto: { etiqueta: 'Repuesto', icono: 'cog',     categoria: null,     elegir: 'Elegí el repuesto…', vacio: 'No hay repuestos cargados en el stock.' },
  };
  const claseDe = (item) => (item && item.categoria === 'Aceite' ? 'aceite' : item && item.categoria === 'Grasa' ? 'grasa' : 'repuesto');

  /** Equipos que ya no están en la lista (registros viejos sin equivalencia). */
  const OTROS = '_otros';
  /** Al editar uno de esos registros: su nombre y su tipo, para guardarlo igual. */
  let equipoViejo = null;
  /** La 2.21.0 llamó "extrusoras" a las prensas. */
  const TIPO_ANTERIOR = { Extrusora: 'Prensa' };

  // ---- Para qué: todo el mantenimiento (por defecto) o un equipo ----
  let para = 'general';
  const AYUDA_PARA = {
    general: 'Lo que se usó en el mantenimiento, sin elegir equipo por equipo. No tilda ningún equipo: eso se hace arriba.',
    equipo: 'Para algo puntual de un equipo (por ejemplo, un cambio de crapodinas). El equipo queda tildado en la semana.',
  };
  function ponerPara(modo) {
    para = modo === 'equipo' ? 'equipo' : 'general';
    document.querySelectorAll('[data-para]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.para === para)));
    $('#mant-para-ayuda').textContent = AYUDA_PARA[para];
    $('#mant-equipo-campos').hidden = para === 'general';
    $('#mant-estado-campo').hidden = para === 'general';
    $('#mant-obs-campo').classList.toggle('col-span-2', para === 'general');
    $('#mant-tarea').placeholder = para === 'general' ? 'Ej: Mantenimiento del sábado' : 'Ej: Cambio de aceite, cambio de crapodinas, desarme completo';
    actualizarUsados();
  }

  /** Tipo del equipo elegido: decide qué repuestos del stock se ofrecen primero. */
  function tipoElegido() {
    if (para === 'general') return null;
    const eq = planta.buscar($('#mant-equipo').value);
    if (eq) return eq.tipo;
    return equipoViejo ? TIPO_ANTERIOR[equipoViejo.tipo] || equipoViejo.tipo || null : null;
  }

  /**
   * Al editar un registro, lo que ya usaba está descontado del stock: para mostrar
   * cuánto hay "antes" de este registro se le vuelve a sumar.
   */
  let usadosAntes = new Map();
  const disponibleAntes = (itemId, hay) => stock.redondear((hay.get(itemId) || 0) + (usadosAntes.get(itemId) || 0));

  /** Lo del stock que corresponde a una clase (aceite, grasa o repuesto), por nombre. */
  function itemsDe(clase) {
    const items = store.todos('stock').slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    return items.filter((i) => claseDe(i) === clase);
  }

  function llenarOpciones(select, clase, elegido, hay) {
    const items = itemsDe(clase);
    const opcion = (i) => el('option', { text: `${i.nombre} · hay ${stock.cantidadTexto(disponibleAntes(i.id, hay), i.unidad)}`, attrs: { value: i.id } });
    const frag = document.createDocumentFragment();
    frag.appendChild(el('option', { text: CLASES[clase].elegir, attrs: { value: '' } }));
    if (clase === 'repuesto' && para === 'general') {
      // Todo el mantenimiento: agrupados por para qué son (prensas, cajas reductoras…).
      const categorias = [...new Set(items.map((i) => i.categoria))].sort((a, b) => (a === 'General') - (b === 'General') || stock.categoriaCorta(a).localeCompare(stock.categoriaCorta(b), 'es'));
      categorias.forEach((cat) => frag.appendChild(el('optgroup', { attrs: { label: cat === 'General' ? 'Generales' : `Para ${stock.categoriaCorta(cat)}` } }, items.filter((i) => i.categoria === cat).map(opcion))));
    } else if (clase === 'repuesto') {
      // Primero los del tipo del equipo, después los generales y el resto.
      const tipo = tipoElegido();
      [
        { etiqueta: `Para ${stock.categoriaCorta(tipo)}`, items: tipo ? items.filter((i) => i.categoria === tipo) : [] },
        { etiqueta: 'Generales', items: items.filter((i) => i.categoria === 'General') },
        { etiqueta: 'De otros sectores', items: items.filter((i) => i.categoria !== tipo && i.categoria !== 'General') },
      ].filter((g) => g.items.length).forEach((g) => frag.appendChild(el('optgroup', { attrs: { label: g.etiqueta } }, g.items.map(opcion))));
    } else {
      items.forEach((i) => frag.appendChild(opcion(i)));
    }
    // Algo que se sacó del stock después de usarlo: se sigue mostrando.
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
    if (!select || !select.value) return null;
    const item = store.buscar('stock', select.value);
    const opcion = select.selectedOptions[0];
    return {
      itemId: select.value,
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
      const input = li.querySelector('input');
      if (!input) return;
      const u = usados[i];
      const aviso = li.querySelector('[data-aviso]');
      const item = u && store.buscar('stock', u.itemId);
      input.step = stock.paso(u ? u.unidad : li.dataset.clase === 'repuesto' ? 'unidades' : 'litros');
      input.min = stock.minimoPositivo(u ? u.unidad : li.dataset.clase === 'repuesto' ? 'unidades' : 'litros');
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
    $('#mant-usados-vacio').hidden = filas().length > 0;
  }

  function botonQuitar(li) {
    const quitar = el('button', { className: 'btn-icon shrink-0', attrs: { type: 'button', 'aria-label': 'Quitar', title: 'Quitar' } }, [el('i', { attrs: { 'data-lucide': 'x' }, className: 'h-3.5 w-3.5' })]);
    quitar.addEventListener('click', () => { li.remove(); actualizarAvisos(); });
    return quitar;
  }

  function etiquetaClase(clase) {
    return el('span', { className: 'flex items-center gap-1.5 text-xs font-semibold text-slate-300' }, [
      el('i', { attrs: { 'data-lucide': CLASES[clase].icono }, className: 'h-3.5 w-3.5 text-brand-400' }),
      el('span', { text: CLASES[clase].etiqueta }),
    ]);
  }

  /** Agrega una fila de aceite, grasa o repuesto (vacía o con lo que ya tenía el registro). */
  function agregarFila(clase, uso) {
    const li = el('li', { className: 'uso-fila', attrs: { 'data-clase': clase } });
    const hay = stock.existencias();
    li.append(el('div', { className: 'flex items-center justify-between gap-2' }, [etiquetaClase(clase), botonQuitar(li)]));
    if (!uso && !itemsDe(clase).length) {
      // No hay nada de eso en el stock: se ofrece cargarlo.
      const cargar = el('button', { className: 'link-btn', text: 'Cargarlo en Stock', attrs: { type: 'button' } });
      cargar.addEventListener('click', () => { SoyaCore.navegar('stock'); stock.abrirNuevo(CLASES[clase].categoria || ''); });
      li.append(el('p', { className: 'text-xs text-slate-400' }, [el('span', { text: CLASES[clase].vacio + ' ' }), cargar]));
    } else {
      const select = el('select', { className: 'field py-1.5', attrs: { required: '', 'aria-label': CLASES[clase].etiqueta } });
      const input = el('input', { className: 'field w-20 shrink-0 py-1.5', attrs: { type: 'number', required: '', min: '0.01', step: 'any', inputmode: 'decimal', 'aria-label': 'Cantidad usada', placeholder: 'Cant.' } });
      llenarOpciones(select, clase, uso || null, hay);
      input.value = uso ? uso.cantidad : clase === 'repuesto' ? '1' : '';
      select.addEventListener('change', actualizarAvisos);
      input.addEventListener('input', actualizarAvisos);
      li.append(
        select,
        el('div', { className: 'flex items-center gap-2' }, [
          input,
          el('span', { className: 'shrink-0 text-xs text-slate-400', attrs: { 'data-unidad': '' } }),
          el('p', { attrs: { 'data-aviso': '', 'aria-live': 'polite' } }),
        ]),
      );
    }
    $('#mant-usados').appendChild(li);
    SoyaCore.icons.render(li);
    actualizarAvisos();
    return li;
  }

  /** Rehace las opciones (cambió el equipo o el stock) sin perder lo elegido. */
  function actualizarUsados() {
    const hay = stock.existencias();
    filas().forEach((li) => {
      const select = li.querySelector('select');
      if (!select) return;
      const elegido = select.value ? leerFila(li) : null;
      llenarOpciones(select, li.dataset.clase, elegido, hay);
    });
    actualizarAvisos();
  }

  /** Lo usado en el formulario, juntando lo mismo si se eligió dos veces. */
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
    (usados || []).forEach((u) => agregarFila(claseDe(store.buscar('stock', u.itemId)), u));
    actualizarAvisos();
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

  // =====================================================================
  // 3. Historial
  // =====================================================================
  const COLUMNAS = [
    { key: 'fecha' },
    {
      className: 'min-w-40 whitespace-normal',
      render: (r) => {
        if (esGeneral(r)) {
          return el('div', null, [
            el('p', { className: 'text-slate-200', text: NOMBRE_GENERAL }),
            el('p', { className: 'text-[11px] text-slate-500', text: 'No es de un equipo' }),
          ]);
        }
        const eq = planta.de(r);
        return el('div', null, [
          el('p', { className: 'text-slate-200', text: eq ? eq.nombre : r.equipo || '-' }),
          el('p', { className: 'text-[11px] text-slate-500', text: eq ? eq.lugarNombre : 'Ya no está en la lista' }),
        ]);
      },
    },
    {
      className: 'max-w-56 truncate',
      render: (r) => (esTilde(r)
        ? el('span', { className: 'flex items-center gap-1 text-emerald-300' }, [el('i', { attrs: { 'data-lucide': 'check' }, className: 'h-3.5 w-3.5' }), el('span', { text: r.tarea || TAREA_TILDE })])
        : el('span', { text: r.tarea || '-', attrs: { title: r.tarea || '' } })),
    },
    { key: 'repuestos', className: 'max-w-56 truncate', format: (_, r) => textoRepuestos(r) },
    { key: 'estado', format: (_, r) => quedoTexto(r) },
    { key: 'observaciones', className: 'max-w-56 truncate' },
  ];

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.mantenimiento = {
    init() {
      initSemana();

      llenarLugares(false);
      fillSelect($('#mant-estado'), Object.entries(estados).map(([value, def]) => ({ value, label: def.etiqueta })), 'operativo');
      document.querySelectorAll('[data-para]').forEach((b) => b.addEventListener('click', () => ponerPara(b.dataset.para)));
      $('#semana-anotar').addEventListener('click', () => {
        ponerPara('general');
        $('#form-mantenimiento').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        document.querySelector('[data-agregar-uso="aceite"]').focus();
      });
      $('#mant-lugar').addEventListener('change', actualizarEquipos);
      $('#mant-equipo').addEventListener('change', actualizarUsados);
      document.querySelectorAll('[data-agregar-uso]').forEach((b) => b.addEventListener('click', () => {
        const li = agregarFila(b.dataset.agregarUso, null);
        const foco = li.querySelector('select') || li.querySelector('button');
        if (foco) foco.focus();
      }));
      actualizarEquipos();
      ponerPara('general');

      let editor;
      const tabla = tablaRegistros({
        tbody: $('#tbody-mantenimiento'),
        caption: $('#caption-mantenimiento'),
        coleccion: 'mantenimiento',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
        mensajeBorrado: (r) => (stock.usosDe(r).length ? 'Registro borrado. Lo que se usó volvió al stock.' : 'Registro borrado.'),
        // Los tildes de la semana son muchos: se ven solo si se pide.
        filtrar: (r) => !esTilde(r) || $('#mant-ver-tildes').checked,
        vacio: () => ($('#mant-ver-tildes').checked ? 'Sin mantenimientos todavía.' : 'Sin mantenimientos con detalle todavía. Para ver también los tildes, marcá "Mostrar también los tildes de la semana".'),
      });
      $('#mant-ver-tildes').addEventListener('change', () => tabla.dibujar());
      editor = editorFormulario($('#form-mantenimiento'), {
        tabla,
        tituloEdicion: (r) => `Corrigiendo: ${esGeneral(r) ? NOMBRE_GENERAL : planta.nombreDe(r)}`,
        rellenar(r) {
          usadosAntes = new Map();
          stock.usosDe(r).forEach((u) => usadosAntes.set(u.itemId, (usadosAntes.get(u.itemId) || 0) + Number(u.cantidad)));
          ponerPara(esGeneral(r) ? 'general' : 'equipo');
          const eq = planta.de(r);
          equipoViejo = eq || esGeneral(r) ? null : { nombre: r.equipo || '-', tipo: r.tipo || '' };
          llenarLugares(!eq && !esGeneral(r));
          if (!esGeneral(r)) {
            $('#mant-lugar').value = eq ? eq.lugar : OTROS;
            actualizarEquipos();
            $('#mant-equipo').value = eq ? eq.id : OTROS;
          }
          $('#mant-tarea').value = esTilde(r) ? '' : r.tarea || '';
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
        const general = para === 'general';
        if (general && !usados.length && !otros) {
          toast('Agregá lo que se usó: aceite, grasa, repuestos u "Otros".', 'error');
          document.querySelector('[data-agregar-uso="aceite"]').focus();
          return;
        }
        const eq = general ? null : planta.buscar($('#mant-equipo').value);
        const equipo = general
          ? { general: true, lugar: '', equipoId: '', equipo: NOMBRE_GENERAL, tipo: '' }
          : eq
            ? { general: false, lugar: eq.lugar, equipoId: eq.id, equipo: eq.nombre, tipo: eq.tipo }
            : { general: false, lugar: '', equipoId: '', equipo: equipoViejo ? equipoViejo.nombre : '', tipo: equipoViejo ? equipoViejo.tipo : '' };
        const guardado = guardarRegistro('mantenimiento', editor, {
          ...equipo,
          tarea: $('#mant-tarea').value.trim() || 'Mantenimiento',
          rutina: false,
          usados,
          repuestos: otros,
          estado: general ? '' : $('#mant-estado').value,
          observaciones: $('#mant-obs').value.trim(),
        }, { nuevo: general
          ? (usados.length ? 'Guardado lo que se usó en el mantenimiento: se descontó del stock.' : 'Guardado lo que se usó en el mantenimiento.')
          : (usados.length ? 'Guardado. Lo que se usó se descontó del stock.' : 'Mantenimiento guardado.') });
        if (guardado) stock.avisarSiFalta(usados.map((u) => u.itemId));
      });

      store.alCambiar((c) => {
        if (c === 'mantenimiento' || c === '*') { tabla.dibujar(); dibujarSemana(); }
        if (c === 'stock' || c === 'stockMovimientos' || c === 'mantenimiento' || c === '*') actualizarUsados();
        if (c === 'stock') { tabla.dibujar(); dibujarSemana(); } // nombres de los repuestos
      });
      tabla.dibujar();
      dibujarSemana();
    },
    refresh() {
      // Al entrar se vuelve a la semana actual si cambió (por ejemplo, pasó la medianoche del domingo).
      dibujarSemana();
    },
    /** Prepara "Qué se usó" para un equipo (lo usa el tablero de Estado de Equipos). */
    nuevoPara(equipoId) {
      const eq = planta.buscar(equipoId);
      if (!eq) return;
      ponerPara('equipo');
      $('#mant-lugar').value = eq.lugar;
      actualizarEquipos();
      $('#mant-equipo').value = eq.id;
      actualizarUsados();
      $('#form-mantenimiento').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      document.querySelector('[data-agregar-uso="aceite"]').focus();
    },
    estadoDe,
    esTilde,
    esGeneral,
    quedoTexto,
    textoRepuestos,
    lunesDe,
    enSemana,
  };
})(window.SoyaCore = window.SoyaCore || {});
