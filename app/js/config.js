/*
 * Configuración de la planta.
 * Todo lo que cambia de una planta a otra (tanques, equipos, turnos) vive acá,
 * así no hay que tocar el HTML ni la lógica para adaptarlo.
 */
(function (SoyaCore) {
  'use strict';

  SoyaCore.config = Object.freeze({
    version: '2.9.0',
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
      tanques:       { titulo: 'Gestión y Niveles de Tanques',      icono: 'database' },
      mantenimiento: { titulo: 'Mantenimiento Mecánico',            icono: 'wrench' },
      resumen:       { titulo: 'Dashboard Consolidado',             icono: 'chart-column' },
      ia:            { titulo: 'Asistente IA (RCTFRI)',             icono: 'bot' },
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
    },

    /**
     * Tanques, en el orden en que se llenan (cascada).
     * Para agregar un tanque exterior, sumá un nombre a la lista.
     */
    tanques: {
      interiores: { capacidad: 1525, nombres: ['INT 1', 'INT 2'], decantacion: '1h decantación' },
      exteriores: { capacidad: 6862, nombres: ['EXT 1', 'EXT 2', 'EXT 3', 'EXT 4'] },
      masivos:    { capacidadPorTanque: 30000, cantidad: 3 }, // capacidad referencial
    },
  });
})(window.SoyaCore = window.SoyaCore || {});
