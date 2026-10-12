/*
 * Vistas: Recepción de camiones y Despacho de expeller.
 * Comparten la lógica de balanza (bruto − tara = neto).
 * En la recepción también se carga la humedad de cada camión (muestra de
 * laboratorio al llegar); arriba se ve la soja ingresada hoy y su humedad.
 */
(function (SoyaCore) {
  'use strict';

  const { $, fmt, num, hoy, toast, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;

  /** Un ingreso es de soja si su carga dice "soja" (o no tiene carga: datos viejos). */
  const esSoja = (c) => String(c.carga || 'Soja').toLowerCase().includes('soja');
  const tieneHumedad = (c) => c.humedad != null && c.humedad !== '' && !isNaN(Number(c.humedad));

  /** Humedad promedio de varios camiones, ponderada por los kg de cada uno. */
  function humedadPonderada(camiones) {
    const conDato = camiones.filter(tieneHumedad);
    const kg = conDato.reduce((s, c) => s + (Number(c.neto) || 0), 0);
    if (!conDato.length) return null;
    if (!kg) return conDato.reduce((s, c) => s + Number(c.humedad), 0) / conDato.length;
    return conDato.reduce((s, c) => s + Number(c.humedad) * (Number(c.neto) || 0), 0) / kg;
  }

  function actualizarHoy() {
    const soja = SoyaCore.store.todos('ingresos').filter((c) => String(c.fecha).startsWith(hoy()) && esSoja(c));
    $('#rec-hoy-kg').textContent = fmt.kg(soja.reduce((s, c) => s + (Number(c.neto) || 0), 0));
    $('#rec-hoy-camiones').textContent = fmt.entero(soja.length);
    $('#rec-hoy-humedad').textContent = fmt.porcentaje(humedadPonderada(soja));
  }

  const COLUMNAS = {
    ingresos: [
      { key: 'fecha' },
      { key: 'empresa' },
      { key: 'carga', format: (v) => v || 'Soja' }, // registros viejos sin carga = Soja
      { key: 'conductor' },
      { key: 'neto', format: fmt.entero, className: 'num' },
      { key: 'humedad', format: (v, r) => (tieneHumedad(r) ? fmt.porcentaje(v) : '-'), className: 'num' },
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
    let sinHumedadAntes = false; // camión de soja cargado antes de la v2.18, sin humedad
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
        if (coleccion === 'ingresos') {
          $('#in-carga').value = r.carga || 'Soja';
          $('#in-humedad').value = tieneHumedad(r) ? r.humedad : '';
          sinHumedadAntes = esSoja(r) && !tieneHumedad(r);
          humedadObligatoria();
        }
        actualizarNeto();
      },
      alTerminar: () => { actualizarNeto(); sinHumedadAntes = false; if (coleccion === 'ingresos') humedadObligatoria(); },
    });

    // La humedad es obligatoria para la soja. Al corregir un camión de soja viejo que no
    // tenía humedad (antes se anotaba en la secadora), no se obliga a completarla.
    function humedadObligatoria() {
      if (coleccion !== 'ingresos') return;
      const exento = editor && editor.id && sinHumedadAntes;
      $('#in-humedad').required = esSoja({ carga: $('#in-carga').value || 'Soja' }) && !exento;
    }
    if (coleccion === 'ingresos') {
      $('#in-carga').addEventListener('input', humedadObligatoria);
      humedadObligatoria();
    }

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
      if (coleccion === 'ingresos') {
        registro.carga = $('#in-carga').value.trim() || 'Soja';
        const h = num($('#in-humedad'));
        registro.humedad = isNaN(h) ? null : h;
      }
      if (guardarRegistro(coleccion, editor, registro, { nuevo: mensaje })) $(`#${prefijo}-empresa`).focus();
    });

    SoyaCore.store.alCambiar((c) => {
      if (c !== coleccion && c !== '*') return;
      tabla.dibujar();
      if (coleccion === 'ingresos') actualizarHoy();
    });
    tabla.dibujar();
    if (coleccion === 'ingresos') actualizarHoy();
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.recepcion = {
    init: () => balanza('in', 'ingresos', 'form-ingreso', 'Ingreso registrado.'),
    refresh: actualizarHoy, // al entrar se recalcula "hoy"
    esSoja,
    tieneHumedad,
    humedadPonderada,
  };
  SoyaCore.views.despacho = {
    init: () => balanza('out', 'despachos', 'form-despacho', 'Despacho registrado.'),
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
