/*
 * Vista: Despacho de aceite.
 *
 * El camión se pesa en la balanza (bruto − tara = neto) y se guarda en kg.
 * Solo como referencia, se muestra entre paréntesis a cuántos litros equivale
 * (densidad en config.js). No se guarda ninguna conversión.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, num, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const densidad = SoyaCore.config.densidadAceite;

  /** kg del despacho. Los registros de la v2.10 solo tenían litros: se estiman. */
  const kgDe = (r) => (r.neto != null ? Number(r.neto) : Math.round((Number(r.litros) || 0) * densidad));
  const litrosAprox = (kg) => `(≈ ${fmt.entero(kg / densidad)} L)`;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'empresa' },
    { key: 'conductor' },
    { key: 'neto', format: (_, r) => fmt.entero(kgDe(r)), className: 'num' },
    { key: 'litros', format: (_, r) => litrosAprox(kgDe(r)), className: 'num text-slate-500' },
  ];

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.despachoAceite = {
    kgDe,
    init() {
      const neto = () => num($('#da-bruto')) - num($('#da-tara'));
      const actualizarNeto = () => {
        const n = neto() > 0 ? neto() : 0;
        $('#da-neto').textContent = fmt.kg(n);
        $('#da-litros').textContent = litrosAprox(n);
      };
      $('#da-bruto').addEventListener('input', actualizarNeto);
      $('#da-tara').addEventListener('input', actualizarNeto);

      let editor;
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
          $('#da-bruto').value = r.bruto != null ? r.bruto : kgDe(r);
          $('#da-tara').value = r.tara != null ? r.tara : 0;
          actualizarNeto();
        },
        alTerminar: actualizarNeto,
      });

      $('#form-despacho-aceite').addEventListener('submit', (e) => {
        e.preventDefault();
        const kg = neto();
        if (!(kg > 0)) {
          toast('El peso neto debe ser mayor a 0 (revisá bruto y tara).', 'error');
          $('#da-tara').focus();
          return;
        }
        if (guardarRegistro('despachosAceite', editor, {
          empresa: $('#da-empresa').value.trim(),
          conductor: $('#da-conductor').value.trim(),
          bruto: num($('#da-bruto')),
          tara: num($('#da-tara')),
          neto: kg,
        }, { nuevo: 'Despacho de aceite registrado.' })) $('#da-empresa').focus();
      });

      SoyaCore.store.alCambiar((c) => (c === 'despachosAceite' || c === '*') && tabla.dibujar());
      tabla.dibujar();
      actualizarNeto();
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
