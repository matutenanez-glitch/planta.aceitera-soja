/*
 * Vista: Despacho de aceite (camiones que cargan desde los tanques grandes).
 *
 * El camión se pesa en la balanza (bruto − tara = neto en kg). Para el
 * circuito y el balance de aceite, el neto se pasa a litros con la densidad
 * de config.js. Se guardan los dos: neto (kg) y litros.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, num, toast, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;
  const cfg = SoyaCore.config.tanques;
  const densidad = SoyaCore.config.densidadAceite;
  const nombreTanque = (i) => cfg.grandes.nombres[Number(i)] || '-';
  const aLitros = (kg) => kg / densidad;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'empresa' },
    { key: 'conductor' },
    { key: 'tanque', format: nombreTanque },
    { key: 'neto', format: (v) => (v != null ? fmt.entero(v) : '-'), className: 'num' }, // los registros de la v2.10 no tienen kg
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
    $('#da-disponible').textContent = g ? `Según el cálculo, ${g.nombre} tiene ${fmt.entero(g.litros)} L (≈ ${fmt.entero(g.litros * densidad)} kg).` : '';
  }

  const neto = () => num($('#da-bruto')) - num($('#da-tara'));
  function actualizarNeto() {
    const n = neto() > 0 ? neto() : 0;
    $('#da-neto').textContent = fmt.kg(n);
    $('#da-litros').textContent = `≈ ${fmt.entero(aLitros(n))} L (densidad ${String(densidad).replace('.', ',')} kg/L)`;
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
          // Registros de la v2.10: solo litros → se estiman los kg.
          const kg = r.neto != null ? r.neto : Math.round((Number(r.litros) || 0) * densidad);
          $('#da-bruto').value = r.bruto != null ? r.bruto : kg;
          $('#da-tara').value = r.tara != null ? r.tara : 0;
          actualizarNeto();
          actualizarTanques();
          $('#da-tanque').value = String(r.tanque);
          actualizarDisponible();
        },
        alTerminar: () => { actualizarNeto(); setTimeout(actualizarTanques); },
      });

      $('#da-tanque').addEventListener('change', actualizarDisponible);
      $('#da-bruto').addEventListener('input', actualizarNeto);
      $('#da-tara').addEventListener('input', actualizarNeto);

      $('#form-despacho-aceite').addEventListener('submit', (e) => {
        e.preventDefault();
        const kg = neto();
        if (!(kg > 0)) {
          toast('El peso neto debe ser mayor a 0 (revisá bruto y tara).', 'error');
          $('#da-tara').focus();
          return;
        }
        const tanque = Number($('#da-tanque').value);
        const litros = Math.round(aLitros(kg));
        const disponible = nivelesActuales()[tanque].litros;
        const guardado = guardarRegistro('despachosAceite', editor, {
          empresa: $('#da-empresa').value.trim(),
          conductor: $('#da-conductor').value.trim(),
          tanque,
          bruto: num($('#da-bruto')),
          tara: num($('#da-tara')),
          neto: kg,
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
      actualizarNeto();
      actualizarTanques();
    },
    refresh: () => { if (!editor.id) actualizarTanques(); },
  };
})(window.SoyaCore = window.SoyaCore || {});
