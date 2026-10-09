/*
 * Vista: Despacho de aceite (camiones que cargan desde los tanques grandes).
 * Cada despacho baja el nivel del tanque grande elegido en el Circuito de Aceite.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, num, toast, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;
  const cfg = SoyaCore.config.tanques;
  const nombreTanque = (i) => cfg.grandes.nombres[Number(i)] || '-';

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'empresa' },
    { key: 'conductor' },
    { key: 'tanque', format: nombreTanque },
    { key: 'litros', format: fmt.entero, className: 'num' },
  ];

  let editor;

  /** Niveles calculados ahora mismo (sin contar el despacho que se está editando). */
  function nivelesActuales() {
    const despachos = store.todos('despachosAceite').filter((d) => !editor || d.id !== editor.id);
    return SoyaCore.circuito.simular(cfg, {
      produccion: store.todos('produccion'),
      despachosAceite: despachos,
      mediciones: store.todos('mediciones'),
    }, Date.now()).grandes;
  }

  function actualizarTanques() {
    const select = $('#da-tanque');
    const grandes = nivelesActuales();
    const anterior = select.value;
    // Por defecto se propone el tanque con más aceite.
    const masLleno = grandes.reduce((mejor, g, i) => (g.litros > grandes[mejor].litros ? i : mejor), 0);
    fillSelect(select, grandes.map((g, i) => ({ value: String(i), label: `${g.nombre} · ${fmt.entero(g.litros)} L` })), anterior !== '' && editor && editor.id ? anterior : String(masLleno));
    actualizarDisponible();
  }

  function actualizarDisponible() {
    const g = nivelesActuales()[Number($('#da-tanque').value)];
    $('#da-disponible').textContent = g ? `Según el cálculo, ${g.nombre} tiene ${fmt.entero(g.litros)} L de ${fmt.entero(g.capacidad)} L.` : '';
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.despachoAceite = {
    init() {
      const tabla = tablaRegistros({
        tbody: $('#tbody-despachosAceite'),
        caption: $('#caption-despachosAceite'),
        coleccion: 'despachosAceite',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-despacho-aceite'), {
        tabla,
        rellenar(r) {
          $('#da-empresa').value = r.empresa || '';
          $('#da-conductor').value = r.conductor || '';
          $('#da-litros').value = r.litros ?? '';
          actualizarTanques();
          $('#da-tanque').value = String(r.tanque);
          actualizarDisponible();
        },
        alTerminar: () => setTimeout(actualizarTanques),
      });

      $('#da-tanque').addEventListener('change', actualizarDisponible);

      $('#form-despacho-aceite').addEventListener('submit', (e) => {
        e.preventDefault();
        const tanque = Number($('#da-tanque').value);
        const litros = num($('#da-litros'));
        const disponible = nivelesActuales()[tanque].litros;
        const guardado = guardarRegistro('despachosAceite', editor, {
          empresa: $('#da-empresa').value.trim(),
          conductor: $('#da-conductor').value.trim(),
          tanque,
          litros,
        }, { nuevo: 'Despacho de aceite registrado.' });
        // No se bloquea: el camión ya salió. Se avisa para corregir con una medición.
        if (guardado && litros > disponible + 0.5) {
          toast(`Ojo: el cálculo daba ${fmt.entero(disponible)} L en ${nombreTanque(tanque)}. Si el camión cargó más, conviene cargar una medición.`, 'error');
        }
      });

      store.alCambiar((c) => {
        if (c === 'despachosAceite' || c === '*') tabla.dibujar();
        if (['produccion', 'despachosAceite', 'mediciones', '*'].includes(c) && !editor.id) actualizarTanques();
      });
      tabla.dibujar();
      actualizarTanques();
    },
    refresh: () => { if (!editor.id) actualizarTanques(); },
  };
})(window.SoyaCore = window.SoyaCore || {});
