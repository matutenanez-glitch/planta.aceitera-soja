/*
 * Vista: Secadora y tomas de laboratorio.
 *
 * La soja que pasa por la secadora ya está mezclada en el silo (todos los
 * camiones descargaron), así que cada toma no es de un camión: solo se anota
 * la humedad en caliente y en frío. La humedad de cada camión se carga en
 * Recepción. Los registros anteriores a la v2.18 pueden tener "empresa" y
 * "hCamion": se conservan, pero ya no se muestran acá.
 *
 * Arriba se ve la soja que entró hoy por los camiones (de Recepción), para saber
 * cuántos kg hay para secar, y los camiones que todavía esperan la tara.
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, hoy, num, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;
  const recepcion = SoyaCore.views.recepcion;
  const camiones = (n) => `${fmt.entero(n)} ${n === 1 ? 'camión' : 'camiones'}`;

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'hCaliente', format: fmt.porcentaje, className: 'num' },
    { key: 'hFrio', format: fmt.porcentaje, className: 'num' },
  ];

  const promedio = (lista, campo) => {
    const v = lista.map((r) => r[campo]).filter((x) => x != null && x !== '' && !isNaN(Number(x))).map(Number);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  function actualizarHoy() {
    const tomas = store.todos('secadora').filter((r) => String(r.fecha).startsWith(hoy()));
    $('#sec-hoy-tomas').textContent = fmt.entero(tomas.length);
    $('#sec-hoy-caliente').textContent = fmt.porcentaje(promedio(tomas, 'hCaliente'));
    $('#sec-hoy-frio').textContent = fmt.porcentaje(promedio(tomas, 'hFrio'));
    const ultima = tomas.map((r) => String(r.fecha)).sort().pop();
    $('#sec-hoy-ultima').textContent = ultima ? ultima.slice(11, 16) : '-';
  }

  // ---------- Soja que entró por los camiones ----------
  const sojaDelDia = (dia) => store.todos('ingresos').filter((c) => String(c.fecha).startsWith(dia) && recepcion.esSoja(c));
  const kgDe = (lista) => lista.reduce((s, c) => s + (Number(c.neto) || 0), 0);

  function actualizarSoja() {
    const dia = hoy();
    const deHoy = sojaDelDia(dia);
    const completos = deHoy.filter((c) => !recepcion.enPlanta(c));
    $('#sec-soja-kg').textContent = fmt.kg(kgDe(completos));
    $('#sec-soja-camiones').textContent = fmt.entero(completos.length);
    $('#sec-soja-humedad').textContent = fmt.porcentaje(recepcion.humedadPonderada(completos));

    const ayer = sojaDelDia(SoyaCore.turnos.sumarDias(dia, -1)).filter((c) => !recepcion.enPlanta(c));
    $('#sec-soja-ayer').textContent = ayer.length ? `Ayer: ${fmt.kg(kgDe(ayer))} en ${camiones(ayer.length)}.` : '';

    // Camiones de soja pesados llenos que todavía no tienen tara (de cualquier día).
    const enPlanta = store.todos('ingresos').filter((c) => recepcion.esSoja(c) && recepcion.enPlanta(c));
    const aviso = $('#sec-soja-pendientes');
    aviso.hidden = !enPlanta.length;
    if (enPlanta.length) {
      const bruto = enPlanta.reduce((s, c) => s + (Number(c.bruto) || 0), 0);
      aviso.replaceChildren(
        el('i', { attrs: { 'data-lucide': 'scale' }, className: 'h-3.5 w-3.5 shrink-0' }),
        el('span', { text: `Además, ${enPlanta.length === 1 ? 'hay 1 camión' : `hay ${camiones(enPlanta.length)}`} de soja en planta esperando la tara (bruto ${fmt.kg(bruto)}). Sus kg se suman cuando se carga la tara.` }),
      );
      SoyaCore.icons.render(aviso);
    }

    // Detalle de los camiones de hoy, el último arriba.
    const filas = deHoy.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((c) => el('tr', null, [
      el('td', { className: 'tabular-nums', text: String(c.fecha).slice(11, 16) }),
      el('td', { className: 'max-w-64 truncate', text: c.empresa || '-', attrs: { title: c.empresa || '' } }),
      recepcion.enPlanta(c)
        ? el('td', { className: 'num' }, [el('span', { className: 'chip chip-sin border-sky-400/50 text-sky-300', text: 'Falta tara' })])
        : el('td', { className: 'num font-semibold text-slate-100', text: fmt.entero(c.neto) }),
      el('td', { className: 'num', text: recepcion.tieneHumedad(c) ? fmt.porcentaje(c.humedad) : '-' }),
    ]));
    $('#sec-soja-detalle').hidden = !filas.length;
    $('#sec-soja-lista').replaceChildren(...filas);
  }

  const actualizarTodo = () => { actualizarHoy(); actualizarSoja(); };

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.secadora = {
    init() {
      let editor;
      const tabla = tablaRegistros({
        tbody: $('#tbody-secadora'),
        caption: $('#caption-secadora'),
        coleccion: 'secadora',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-secadora'), {
        tabla,
        rellenar(r) {
          $('#sec-humedad-caliente').value = r.hCaliente ?? '';
          $('#sec-humedad-frio').value = r.hFrio ?? '';
        },
      });

      $('#form-secadora').addEventListener('submit', (e) => {
        e.preventDefault();
        if (guardarRegistro('secadora', editor, {
          hCaliente: num($('#sec-humedad-caliente')),
          hFrio: num($('#sec-humedad-frio')),
        }, { nuevo: 'Toma de la secadora guardada.' })) $('#sec-humedad-caliente').focus();
      });

      store.alCambiar((c) => {
        if (c === 'secadora' || c === '*') { tabla.dibujar(); actualizarHoy(); }
        if (c === 'ingresos' || c === '*') actualizarSoja();
      });
      tabla.dibujar();
      actualizarTodo();
    },
    refresh: actualizarTodo, // al entrar a la vista se recalcula "hoy"
  };
})(window.SoyaCore = window.SoyaCore || {});
