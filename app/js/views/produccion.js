/*
 * Vista: Producción por turnos (cierre de turno).
 *
 * Un cierre por turno y por día, con un solo operador. El aceite se carga en
 * litros con botones de tanques (1 tanque = config.litrosPorTanque; hasta
 * config.maxTanquesPorTurno por turno).
 *
 * Arriba se listan los turnos que faltan cargar. Un turno olvidado se puede
 * cargar días después: se guarda en el día de su turno y no toca los demás.
 * Si ese turno no se trabajó (parada, feriado), se marca "No se trabajó".
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt, num, toast, ahora, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;
  const T = SoyaCore.turnos;
  const cfg = SoyaCore.config;

  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const pad = (n) => String(n).padStart(2, '0');
  /** "sáb 11/10/2026" */
  const diaCorto = (iso) => { const d = T.fechaDia(iso); return `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const sinAnio = (iso) => diaCorto(iso).slice(0, -5);
  const MAX_LITROS = cfg.maxTanquesPorTurno * cfg.litrosPorTanque;
  const DOCE_HORAS = 12 * 3600000;

  /** Litros arriba y, debajo y más chico, a cuántos tanques equivalen. */
  const aceiteConTanques = (r) => (r.sinProduccion
    ? el('span', { className: 'text-slate-500', text: '—' })
    : el('span', null, [
      el('span', { className: 'block', text: fmt.entero(r.aceite) }),
      el('span', { className: 'block text-[11px] text-slate-500', text: T.textoTanques(r.aceite) }),
    ]));

  const COLUMNAS = [
    { key: 'dia', format: (_, r) => sinAnio(T.diaDe(r)) },
    { key: 'turno', format: (v) => T.corto(v) },
    // los registros anteriores a la v2.13 no tienen operador
    { key: 'operador', format: (v, r) => (r.sinProduccion ? 'No se trabajó' : v || 'Sin operador') },
    { key: 'aceite', render: aceiteConTanques, className: 'num' },
    { key: 'expeller', format: (v, r) => (r.sinProduccion ? '—' : fmt.entero(v)), className: 'num' },
  ];

  let editor;
  let diaTocado = false;

  /** Sugerencias para el campo Operador: los nombres ya usados, el más reciente primero. */
  function actualizarOperadores() {
    const vistos = new Map();
    store.todos('produccion').slice().reverse().forEach((r) => {
      const n = String(r.operador || '').trim();
      if (n && !vistos.has(n.toLowerCase())) vistos.set(n.toLowerCase(), n);
    });
    $('#lista-operadores').replaceChildren(...[...vistos.values()].map((n) => el('option', { attrs: { value: n } })));
  }

  const cargados = () => new Set(store.todos('produccion').map((r) => T.clave(T.diaDe(r), r.turno)));

  /** Avisa cuando se está cargando un turno de días anteriores. */
  function reflejarDia() {
    const dia = $('#prod-dia').value;
    const t = T.porEtiqueta($('#prod-turno').value);
    const atrasado = !editor.id && T.esDia(dia) && !!t && Date.now() > T.finMs(t, dia) + DOCE_HORAS;
    const aviso = $('#prod-atrasado');
    aviso.hidden = !atrasado;
    aviso.textContent = atrasado ? `Turno atrasado: se guarda en el ${diaCorto(dia)}, sin tocar los demás días.` : '';
  }

  /** Propone el turno que falta cargar más cercano a la hora actual. */
  function proponer() {
    const s = T.sugerir(cargados());
    $('#prod-dia').value = s.dia;
    $('#prod-turno').value = s.etiqueta;
    $('#prod-dia').max = T.isoDia(new Date());
    diaTocado = false;
    reflejarDia();
  }

  /** Marca el botón de tanques que coincide, muestra a cuántos tanques equivalen y controla el máximo. */
  function reflejarAceite() {
    const input = $('#prod-aceite');
    const litros = num(input);
    $$('#prod-tanques [data-tanques]').forEach((b) => b.setAttribute('aria-pressed', String(litros === Number(b.dataset.tanques) * cfg.litrosPorTanque)));
    const texto = litros > 0 ? T.textoTanques(litros) : '';
    $('#prod-aceite-tanques').textContent = texto ? (texto.startsWith('≈') ? texto : '= ' + texto) : '';
    input.setCustomValidity(litros > MAX_LITROS
      ? `En un turno se pasan hasta ${cfg.maxTanquesPorTurno} tanques (${fmt.entero(MAX_LITROS)} L). Revisá los litros.`
      : '');
  }

  function formularioVacio() {
    return !editor.id && !$('#prod-operador').value && !$('#prod-aceite').value && !$('#prod-expeller').value;
  }

  /** Abre el formulario listo para cargar un turno puntual. */
  function nuevoPara(turno, dia) {
    editor.terminar();
    $('#prod-turno').value = turno;
    $('#prod-dia').value = dia;
    diaTocado = true;
    reflejarDia();
    reflejarAceite();
    $('#prod-operador').focus();
  }

  /** Guarda que esos turnos de ese día no se trabajaron (parada, feriado). Se puede deshacer. */
  function marcarSinProduccion(dia, etiquetas) {
    const creados = etiquetas
      .map((turno) => store.agregar('produccion', { fecha: ahora(), dia, turno, sinProduccion: true, operador: '', aceite: 0, expeller: 0 }))
      .filter(Boolean);
    if (!creados.length) return;
    const que = creados.length === 1 ? `el ${T.corto(creados[0].turno)}` : `${creados.length} turnos`;
    toast(`Marcado: ${que} del ${sinAnio(dia)} no se trabajó.`, 'info', {
      texto: 'Deshacer',
      fn: () => creados.forEach((r) => store.borrar('produccion', r.id)),
    });
  }

  // ---------- Turnos sin cargar ----------
  function dibujarFaltantes() {
    const control = T.control(store.todos('produccion'));
    const dias = control.diasConFaltantes(T.sumarDias(control.hoy, -29), control.hoy);
    const total = dias.reduce((n, d) => n + d.faltan.length, 0);
    $('#prod-faltan').hidden = total === 0;
    if (!total) return;
    $('#prod-faltan-titulo').textContent = total === 1 ? 'Falta cargar 1 turno' : `Faltan cargar ${total} turnos`;

    const MAX_DIAS = 8;
    const items = dias.slice(0, MAX_DIAS).map((d) => {
      const etiquetas = d.faltan.map((x) => x.turno.etiqueta);
      const cargar = etiquetas.map((et) => {
        const b = el('button', { className: 'btn-falta', attrs: { type: 'button', 'data-cargar': et } }, [
          el('i', { attrs: { 'data-lucide': 'pencil' }, className: 'h-3 w-3' }),
          el('span', { text: `Cargar ${T.corto(et)}` }),
        ]);
        b.addEventListener('click', () => nuevoPara(et, d.dia));
        return b;
      });
      const noSeTrabajo = el('button', {
        className: 'btn-falta btn-falta-neutro',
        text: etiquetas.length === 1 ? 'No se trabajó' : `No se trabajó (${etiquetas.length} turnos)`,
        attrs: { type: 'button', 'data-sin-produccion': '', title: 'Marcar que en este turno no hubo producción (parada, feriado). Se puede deshacer.' },
      });
      noSeTrabajo.addEventListener('click', () => marcarSinProduccion(d.dia, etiquetas));
      return el('li', { className: 'flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5', attrs: { 'data-dia': d.dia } }, [
        el('span', { className: 'w-24 shrink-0 font-semibold text-slate-200', text: sinAnio(d.dia) }),
        el('div', { className: 'flex flex-1 flex-wrap gap-2' }, cargar),
        noSeTrabajo,
      ]);
    });
    if (dias.length > MAX_DIAS) {
      const ver = el('button', { className: 'link-btn', text: 'Ver todos en Aceite por Turno', attrs: { type: 'button', 'data-ir': 'aceite' } });
      items.push(el('li', { className: 'py-2.5 text-xs text-slate-400' }, [
        el('span', { text: `Y ${dias.length - MAX_DIAS} día${dias.length - MAX_DIAS === 1 ? '' : 's'} más con turnos sin cargar. ` }),
        ver,
      ]));
    }
    $('#prod-faltan-lista').replaceChildren(...items);
    SoyaCore.icons.render($('#prod-faltan-lista'));
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.produccion = {
    init() {
      fillSelect($('#prod-turno'), cfg.turnos.map((t) => ({ value: t, label: T.corto(t) })));
      $('#prod-litros-tanque').textContent = fmt.entero(cfg.litrosPorTanque);
      $('#prod-max-tanques').textContent = String(cfg.maxTanquesPorTurno);
      const botones = Array.from({ length: cfg.maxTanquesPorTurno }, (_, i) => i + 1);
      $('#prod-tanques').replaceChildren(...botones.map((n) => el('button', {
        className: 'seg px-1 py-3 text-base whitespace-nowrap',
        text: `${n} tanque${n === 1 ? '' : 's'}`,
        attrs: { type: 'button', 'data-tanques': String(n), 'aria-pressed': 'false', title: `${fmt.entero(n * cfg.litrosPorTanque)} L` },
      })));
      $('#prod-tanques').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tanques]');
        if (!b) return;
        $('#prod-aceite').value = Number(b.dataset.tanques) * cfg.litrosPorTanque;
        reflejarAceite();
      });
      $('#prod-aceite').addEventListener('input', reflejarAceite);
      $('#prod-dia').addEventListener('input', () => { diaTocado = true; reflejarDia(); });
      $('#prod-turno').addEventListener('change', () => {
        if (!editor.id && !diaTocado) $('#prod-dia').value = T.ultimoDia($('#prod-turno').value);
        reflejarDia();
      });

      const tabla = tablaRegistros({
        tbody: $('#tbody-produccion'),
        caption: $('#caption-produccion'),
        coleccion: 'produccion',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-produccion'), {
        tabla,
        tituloEdicion: (r) => `Editando el ${T.corto(r.turno)} del ${diaCorto(T.diaDe(r))}${r.sinProduccion ? ' (marcado "No se trabajó")' : ''}`,
        rellenar(r) {
          $('#prod-dia').value = T.diaDe(r);
          $('#prod-turno').value = T.normalizarEtiqueta(r.turno);
          $('#prod-operador').value = r.operador || '';
          $('#prod-aceite').value = r.sinProduccion ? '' : r.aceite ?? '';
          $('#prod-expeller').value = r.sinProduccion ? '' : r.expeller ?? '';
          reflejarDia();
          reflejarAceite();
        },
        alTerminar() { proponer(); reflejarAceite(); },
      });

      $('#form-produccion').addEventListener('submit', (e) => {
        e.preventDefault();
        const dia = $('#prod-dia').value;
        const turno = $('#prod-turno').value;
        const nombre = `${T.corto(turno)} del ${diaCorto(dia)}`;

        if (T.inicioMs(T.porEtiqueta(turno), dia) > Date.now()) {
          toast(`El ${nombre} todavía no empezó. Revisá el día y el turno.`, 'error');
          $('#prod-dia').focus();
          return;
        }
        const repetido = store.todos('produccion').find((r) => r.id !== editor.id && r.turno === turno && T.diaDe(r) === dia);
        if (repetido) {
          const detalle = repetido.sinProduccion ? 'marcado "No se trabajó"' : `${repetido.operador || 'sin operador'}, ${fmt.entero(repetido.aceite)} L`;
          toast(`El ${nombre} ya está cargado (${detalle}).`, 'error', {
            texto: 'Editarlo',
            fn: () => editor.editar(repetido),
          });
          return;
        }

        guardarRegistro('produccion', editor, {
          dia,
          turno,
          operador: $('#prod-operador').value.trim().replace(/\s+/g, ' '),
          aceite: num($('#prod-aceite')),
          expeller: num($('#prod-expeller')),
          sinProduccion: false,
        }, { nuevo: `Cierre del ${nombre} guardado.` });
      });

      store.alCambiar((c) => {
        if (c === 'produccion' || c === '*') {
          tabla.dibujar();
          actualizarOperadores();
          dibujarFaltantes();
          if (formularioVacio() && !diaTocado) proponer();
        }
      });
      tabla.dibujar();
      actualizarOperadores();
      dibujarFaltantes();
      proponer();
      reflejarAceite();
    },

    /** Al volver a la pantalla: actualiza los faltantes y, si el formulario está sin tocar, propone el turno de ahora. */
    refresh() {
      dibujarFaltantes();
      if (formularioVacio() && !diaTocado) proponer();
    },

    nuevoPara,
    marcarSinProduccion,
  };
})(window.SoyaCore = window.SoyaCore || {});
