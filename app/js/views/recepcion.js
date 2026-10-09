/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, ahora, num, renderRows, toast } = SoyaCore.ui;
  const store = SoyaCore.store;

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

  function balanza(prefijo, coleccion, mensaje) {
    const form = $(`#form-${coleccion === 'ingresos' ? 'ingreso' : 'despacho'}`);
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

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = neto();
      if (!(n > 0)) {
        toast('El peso neto debe ser mayor a 0 (revisá bruto y tara).', 'error');
        tara.focus();
        return;
      }
      const registro = {
        fecha: ahora(),
        empresa: $(`#${prefijo}-empresa`).value.trim(),
        conductor: $(`#${prefijo}-conductor`).value.trim(),
        neto: n,
      };
      if (coleccion === 'ingresos') registro.carga = $('#in-carga').value.trim() || 'Soja';

      if (!store.agregar(coleccion, registro)) return;
      form.reset(); // vuelve "Carga" a su valor por defecto (Soja)
      actualizarNeto();
      toast(mensaje, 'ok');
      $(`#${prefijo}-empresa`).focus();
    });
  }

  function dibujar(coleccion) {
    const tbody = $(`#tbody-${coleccion}`);
    renderRows(tbody, store.todos(coleccion), COLUMNAS[coleccion], { caption: $(`#caption-${coleccion}`) });
  }

  SoyaCore.views = SoyaCore.views || {};

  SoyaCore.views.recepcion = {
    init() {
      balanza('in', 'ingresos', 'Ingreso registrado');
      store.alCambiar((c) => (c === 'ingresos' || c === '*') && dibujar('ingresos'));
      dibujar('ingresos');
    },
    refresh() {},
  };

  SoyaCore.views.despacho = {
    init() {
      balanza('out', 'despachos', 'Despacho registrado');
      store.alCambiar((c) => (c === 'despachos' || c === '*') && dibujar('despachos'));
      dibujar('despachos');
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
