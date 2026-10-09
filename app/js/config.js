/*
 * Configuración de la planta.
 * Todo lo que cambia de una planta a otra (tanques, equipos, turnos) vive acá,
 * así no hay que tocar el HTML ni la lógica para adaptarlo.
 */
(function (SoyaCore) {
  'use strict';

  SoyaCore.config = Object.freeze({
    version: '2.11.0',
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
      tanques:       { titulo: 'Aceite: producido, despachado y tanques', icono: 'droplet' },
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
      Prensa: {
        etiqueta: 'Prensas (1 al 8)',
        lista: ['Prensa 1', 'Prensa 2', 'Prensa 3', 'Prensa 4', 'Prensa 5', 'Prensa 6', 'Prensa 7', 'Prensa 8'],
      },
      Extrusor: {
        etiqueta: 'Extrusores / Dosificadores',
        lista: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => 'Extrusor/Dosificador P' + n),
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
     * Circuito del aceite (ver js/circuito-aceite.js).
     * Los nombres definen cuántos tanques hay de cada tipo.
     */
    tanques: {
      // 2 interiores que se alternan; el lleno reposa antes de bajar al exterior.
      interiores: { capacidad: 1525, nombres: ['INT 1', 'INT 2'], reposoMinutos: 60 },
      // 4 exteriores que se llenan en ronda. 1 exterior = 5 interiores (A CONFIRMAR: la v2.8 decía 6.862 L).
      exteriores: { capacidad: 7625, nombres: ['EXT 1', 'EXT 2', 'EXT 3', 'EXT 4'] },
      // Tanques grandes que vacían los camiones. CAPACIDAD A CONFIRMAR.
      grandes: { capacidad: 30000, nombres: ['GRANDE 1', 'GRANDE 2', 'GRANDE 3'] },
      // Cuando al último exterior le faltan estos litros o menos, se vacían todos a los grandes.
      trasvaseCuandoFalten: 1525,
      // Duración de un turno: el aceite del cierre se reparte parejo en estas horas.
      horasTurno: 8,
    },
  });
})(window.SoyaCore = window.SoyaCore || {});
