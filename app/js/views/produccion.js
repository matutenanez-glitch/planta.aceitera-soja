/*
 * Vista: Producción por turnos (cierre de turno).
 *
 * Un cierre por turno y por día, con un solo operador. El aceite se carga en
 * litros con botones de tanques (1 tanque = config.litrosPorTanque).
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt, num, toast, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;
  const T = SoyaCore.turnos;
  const cfg = SoyaCore.config;

  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const pad = (n) => String(n).padStart(2, '0');
  /** "sáb 11/10/2026" */
  const diaCorto = (iso) => { const d = T.fechaDia(iso); return `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };

  /** Litros arriba y, debajo y más chico, a cuántos tanques equivalen. */
  const aceiteConTanques = (r) => el('span', null, [
    el('span', { className: 'block', text: fmt.entero(r.aceite) }),
    el('span', { className: 'block text-[11px] text-slate-500', text: T.textoTanques(r.aceite) }),
  ]);

  const COLUMNAS = [
    { key: 'dia', format: (_, r) => diaCorto(T.diaDe(r)).slice(0, -5) }, // sin el año, para que entre la tabla
    { key: 'turno', format: (v) => T.corto(v) },
    { key: 'operador', format: (v) => v || 'Sin operador' }, // los registros anteriores a la v2.13 no tienen operador
    { key: 'aceite', render: aceiteConTanques, className: 'num' },
    { key: 'expeller', format: fmt.entero, className: 'num' },
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

  /** Propone el turno que falta cargar más cercano a la hora actual. */
  function proponer() {
    const s = T.sugerir(cargados());
    $('#prod-dia').value = s.dia;
    $('#prod-turno').value = s.etiqueta;
    $('#prod-dia').max = T.isoDia(new Date());
    diaTocado = false;
  }

  /** Marca el botón de tanques que coincide y muestra a cuántos tanques equivalen los litros. */
  function reflejarAceite() {
    const litros = num($('#prod-aceite'));
    $$('#prod-tanques [data-tanques]').forEach((b) => b.setAttribute('aria-pressed', String(litros === Number(b.dataset.tanques) * cfg.litrosPorTanque)));
    const texto = litros > 0 ? T.textoTanques(litros) : '';
    $('#prod-aceite-tanques').textContent = texto ? (texto.startsWith('≈') ? texto : '= ' + texto) : '';
  }

  function formularioVacio() {
    return !editor.id && !$('#prod-operador').value && !$('#prod-aceite').value && !$('#prod-expeller').value;
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.produccion = {
    init() {
      fillSelect($('#prod-turno'), cfg.turnos.map((t) => ({ value: t, label: T.corto(t) })));
      $('#prod-litros-tanque').textContent = fmt.entero(cfg.litrosPorTanque);
      $('#prod-tanques').replaceChildren(...cfg.botonesTanques.map((n) => el('button', {
        className: 'seg px-1 py-2.5 text-sm whitespace-nowrap',
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
      $('#prod-dia').addEventListener('input', () => { diaTocado = true; });
      $('#prod-turno').addEventListener('change', () => {
        if (!editor.id && !diaTocado) $('#prod-dia').value = T.ultimoDia($('#prod-turno').value);
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
        tituloEdicion: (r) => `Editando el ${T.corto(r.turno)} del ${diaCorto(T.diaDe(r))}`,
        rellenar(r) {
          $('#prod-dia').value = T.diaDe(r);
          $('#prod-turno').value = T.normalizarEtiqueta(r.turno);
          $('#prod-operador').value = r.operador || '';
          $('#prod-aceite').value = r.aceite ?? '';
          $('#prod-expeller').value = r.expeller ?? '';
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
          toast(`El ${nombre} ya está cargado (${repetido.operador || 'sin operador'}, ${fmt.entero(repetido.aceite)} L).`, 'error', {
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
        }, { nuevo: `Cierre del ${nombre} guardado.` });
      });

      store.alCambiar((c) => {
        if (c === 'produccion' || c === '*') {
          tabla.dibujar();
          actualizarOperadores();
          if (formularioVacio() && !diaTocado) proponer();
        }
      });
      tabla.dibujar();
      actualizarOperadores();
      proponer();
      reflejarAceite();
    },

    /** Al volver a la pantalla, si el formulario está sin tocar, propone el turno que corresponde ahora. */
    refresh() {
      if (formularioVacio() && !diaTocado) proponer();
    },

    /** Abre el formulario listo para cargar un turno puntual (desde "Aceite por turno"). */
    nuevoPara(turno, dia) {
      editor.terminar();
      $('#prod-turno').value = turno;
      $('#prod-dia').value = dia;
      diaTocado = true;
      reflejarAceite();
      $('#prod-operador').focus();
    },
  };
})(window.SoyaCore = window.SoyaCore || {});
