/*
 * Configuración de la planta.
 * Todo lo que cambia de una planta a otra (equipos, turnos, densidad) vive acá,
 * así no hay que tocar el HTML ni la lógica para adaptarlo.
 */
(function (SoyaCore) {
  'use strict';

  SoyaCore.config = Object.freeze({
    version: '2.13.0',
    locale: 'es-AR',

    /** Cuántas filas muestran las tablas de "últimos registros". */
    filasPorTabla: 15,

    /** Días sin backup a partir de los cuales se muestra un aviso. */
    diasAvisoBackup: 7,

    vistas: {
      recepcion:     { titulo: 'Recepción de Camiones',             icono: 'truck' },
      despacho:      { titulo: 'Despacho de Expeller',              icono: 'package-open' },
      secadora:      { titulo: 'Secadora y Tomas de Laboratorio',   icono: 'thermometer-sun' },
      produccion:    { titulo: 'Producción Operativa (Extracción)', icono: 'factory' },
      aceite:        { titulo: 'Aceite por operador y turno',       icono: 'droplet' },
      despachoAceite:{ titulo: 'Despacho de Aceite',                icono: 'fuel' },
      equipos:       { titulo: 'Estado de Equipos',                 icono: 'gauge' },
      mantenimiento: { titulo: 'Registro de Mantenimiento',         icono: 'wrench' },
      resumen:       { titulo: 'Resumen por día y por mes',         icono: 'chart-column' },
    },

    turnos: [
      'Turno 1 (08:00 - 16:00)',
      'Turno 2 (16:00 - 00:00)',
      'Turno 3 (00:00 - 08:00)',
    ],

    /** Equipos por sector, para el formulario de mantenimiento. */
    equipos: {
      // 2 líneas de 4 prensas; cada línea tiene un extrusor.
      Prensa: {
        etiqueta: 'Prensas (Línea 1: 1 a 4 · Línea 2: 5 a 8)',
        lista: ['Prensa 1', 'Prensa 2', 'Prensa 3', 'Prensa 4', 'Prensa 5', 'Prensa 6', 'Prensa 7', 'Prensa 8'],
      },
      Extrusor: {
        etiqueta: 'Extrusores (uno por línea)',
        lista: ['Extrusor Línea 1', 'Extrusor Línea 2'],
      },
      Reductor: {
        etiqueta: 'Cajas Reductoras (WEG/Bronto)',
        lista: [
          'L1 - Reductor 1', 'L1 - Reductor 2', 'L1 - Reductor 3', 'L1 - Reductor 4', 'L1 - Reductor 5',
          'L2 - Reductor 1', 'L2 - Reductor 2', 'L2 - Reductor 3', 'L2 - Reductor 4', 'L2 - Reductor 5', 'L2 - Reductor 6',
          'Extrusor Principal L1', 'Extrusor Principal L2',
          'Motor/Reductor Agitador Tanque 1', 'Motor/Reductor Agitador Tanque 2',
        ],
      },
      Bomba: {
        etiqueta: 'Bombas',
        lista: ['Bomba 1', 'Bomba 2', 'Bomba 3', 'Bomba 4'],
      },
    },

    /** Día en que se hace el mantenimiento (0 = domingo … 6 = sábado). La producción suele cortar el viernes a las 22:00. */
    diaMantenimiento: 6,

    /** Cómo puede quedar un equipo después de una intervención. */
    estadosEquipo: {
      operativo:     { etiqueta: 'Operativo' },
      observaciones: { etiqueta: 'Con observaciones' },
      fuera:         { etiqueta: 'Fuera de servicio' },
    },

    /**
     * Densidad del aceite de soja (kg por litro). Solo se usa para mostrar, entre
     * paréntesis, a cuántos litros equivalen los kg de balanza. Todo se guarda en kg.
     * (El circuito de tanques quedó guardado en archivo/circuito-aceite/.)
     */
    densidadAceite: 0.92,
  });
})(window.SoyaCore = window.SoyaCore || {});
