/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, num, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;

  const COLUMNAS = {
    ingresos: [
      { key: 'fecha' },
      { key: 'empresa' },
      { key: 'carga', format: (v) => v || 'Soja' }, // registros viejos sin carga = Soja
      { key: 'conductor' },
      { key: 'neto', format: fmt.entero, className: 'num' },
    ],
    despachos: [
      { key: 'fecha' },
      { key: 'empresa' },
      { key: 'conductor' },
      { key: 'neto', format: fmt.entero, className: 'num' },
    ],
  };

  function balanza(prefijo, coleccion, formId, mensaje) {
    const form = $('#' + formId);
    const bruto = $(`#${prefijo}-bruto`);
    const tara = $(`#${prefijo}-tara`);
    const salida = $(`#${prefijo}-neto`);
    const neto = () => num(bruto) - num(tara);
    const actualizarNeto = () => {
      const n = neto();
      salida.textContent = fmt.kg(n > 0 ? n : 0);
    };
    bruto.addEventListener('input', actualizarNeto);
    tara.addEventListener('input', actualizarNeto);

    let editor;
    const tabla = tablaRegistros({
      tbody: $(`#tbody-${coleccion}`),
      caption: $(`#caption-${coleccion}`),
      coleccion,
      columnas: COLUMNAS[coleccion],
      onEditar: (r) => editor.editar(r),
    });
    editor = editorFormulario(form, {
      tabla,
      rellenar(r) {
        $(`#${prefijo}-empresa`).value = r.empresa || '';
        $(`#${prefijo}-conductor`).value = r.conductor || '';
        // Los registros anteriores a la v2.10 solo guardaban el neto.
        bruto.value = r.bruto != null ? r.bruto : r.neto;
        tara.value = r.tara != null ? r.tara : 0;
        if (coleccion === 'ingresos') $('#in-carga').value = r.carga || 'Soja';
        actualizarNeto();
      },
      alTerminar: actualizarNeto,
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = neto();
      if (!(n > 0)) {
        toast('El peso neto debe ser mayor a 0 (revisá bruto y tara).', 'error');
        tara.focus();
        return;
      }
      const registro = {
        empresa: $(`#${prefijo}-empresa`).value.trim(),
        conductor: $(`#${prefijo}-conductor`).value.trim(),
        bruto: num(bruto),
        tara: num(tara),
        neto: n,
      };
      if (coleccion === 'ingresos') registro.carga = $('#in-carga').value.trim() || 'Soja';
      if (guardarRegistro(coleccion, editor, registro, { nuevo: mensaje })) $(`#${prefijo}-empresa`).focus();
    });

    SoyaCore.store.alCambiar((c) => (c === coleccion || c === '*') && tabla.dibujar());
    tabla.dibujar();
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.recepcion = {
    init: () => balanza('in', 'ingresos', 'form-ingreso', 'Ingreso registrado.'),
    refresh() {},
  };
  SoyaCore.views.despacho = {
    init: () => balanza('out', 'despachos', 'form-despacho', 'Despacho registrado.'),
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
