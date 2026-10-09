/*
 * Vista: Mantenimiento de prensas, extrusores y reductores.
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const equipos = SoyaCore.config.equipos;
  const estados = SoyaCore.config.estadosEquipo;
  /** Los registros anteriores a la v2.11 no tenían estado: se toman como operativos. */
  const estadoDe = (r) => (r && estados[r.estado] ? r.estado : 'operativo');

  const COLUMNAS = [
    { key: 'fecha' },
    { key: 'equipo' },
    { key: 'tarea', className: 'max-w-56 truncate' },
    { key: 'repuestos', className: 'max-w-44 truncate' },
    { key: 'estado', format: (_, r) => estados[estadoDe(r)].etiqueta },
    { key: 'observaciones', className: 'max-w-56 truncate' },
  ];

  function actualizarEquipos() {
    const tipo = $('#mant-tipo').value;
    fillSelect($('#mant-equipo'), (equipos[tipo] || { lista: [] }).lista);
  }

  /** Registros viejos no guardaban el tipo: se deduce buscando el equipo en las listas. */
  const tipoDe = (r) => r.tipo || Object.keys(equipos).find((t) => equipos[t].lista.includes(r.equipo)) || Object.keys(equipos)[0];

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.mantenimiento = {
    init() {
      fillSelect($('#mant-tipo'), Object.entries(equipos).map(([value, def]) => ({ value, label: def.etiqueta })));
      fillSelect($('#mant-estado'), Object.entries(estados).map(([value, def]) => ({ value, label: def.etiqueta })), 'operativo');
      $('#mant-tipo').addEventListener('change', actualizarEquipos);
      actualizarEquipos();

      let editor;
      const tabla = tablaRegistros({
        tbody: $('#tbody-mantenimiento'),
        caption: $('#caption-mantenimiento'),
        coleccion: 'mantenimiento',
        columnas: COLUMNAS,
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-mantenimiento'), {
        tabla,
        rellenar(r) {
          $('#mant-tipo').value = tipoDe(r);
          actualizarEquipos();
          const select = $('#mant-equipo');
          if (![...select.options].some((o) => o.value === r.equipo)) {
            select.appendChild(el('option', { text: r.equipo, attrs: { value: r.equipo } }));
          }
          select.value = r.equipo;
          $('#mant-tarea').value = r.tarea || '';
          $('#mant-piezas').value = r.repuestos === 'Ninguno' ? '' : r.repuestos || '';
          $('#mant-obs').value = r.observaciones || '';
          $('#mant-estado').value = estadoDe(r);
        },
        alTerminar: actualizarEquipos,
      });

      $('#form-mantenimiento').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarRegistro('mantenimiento', editor, {
          tipo: $('#mant-tipo').value,
          equipo: $('#mant-equipo').value,
          tarea: $('#mant-tarea').value.trim(),
          repuestos: $('#mant-piezas').value.trim() || 'Ninguno',
          estado: $('#mant-estado').value,
          observaciones: $('#mant-obs').value.trim(),
        }, { nuevo: 'Registro de mantenimiento guardado.' });
      });

      SoyaCore.store.alCambiar((c) => (c === 'mantenimiento' || c === '*') && tabla.dibujar());
      tabla.dibujar();
    },
    refresh() {},
    /** Prepara el formulario para un equipo (lo usa el tablero de Estado de Equipos). */
    nuevoPara(tipo, equipo) {
      $('#mant-tipo').value = tipo;
      actualizarEquipos();
      $('#mant-equipo').value = equipo;
      $('#mant-tarea').focus();
    },
    estadoDe,
  };
})(window.SoyaCore = window.SoyaCore || {});
