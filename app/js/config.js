/*
 * Configuración de la planta.
 * Todo lo que cambia de una planta a otra (equipos, turnos, densidad) vive acá,
 * así no hay que tocar el HTML ni la lógica para adaptarlo.
 */
(function (SoyaCore) {
  'use strict';

  SoyaCore.config = Object.freeze({
    version: '2.20.0',
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
      aceite:        { titulo: 'Aceite por día y turno',            icono: 'droplet' },
      despachoAceite:{ titulo: 'Retiro de Aceite',                  icono: 'fuel' },
      equipos:       { titulo: 'Estado de Equipos',                 icono: 'gauge' },
      mantenimiento: { titulo: 'Registro de Mantenimiento',         icono: 'wrench' },
      stock:         { titulo: 'Stock de Repuestos',                icono: 'package' },
      resumen:       { titulo: 'Resumen por día y por mes',         icono: 'chart-column' },
    },

    /**
     * Turnos en el orden del día: el día arranca a las 00:00 con el Turno 1 y se
     * completa con el Turno 3, que termina a las 00:00. Cada cierre de turno es
     * de un solo operador. (Los registros con los nombres viejos se pasan solos
     * a estos nombres según su horario.)
     */
    turnos: [
      'Turno 1 (00:00 - 08:00)',
      'Turno 2 (08:00 - 16:00)',
      'Turno 3 (16:00 - 00:00)',
    ],

    /**
     * Días en que se produce (0 = domingo … 6 = sábado). La semana arranca el lunes
     * a las 00:00 con el Turno 1 y termina el viernes (la producción corta a las 22:00).
     * En estos días se avisa si falta cargar un turno. Si se trabaja un sábado o un
     * domingo, ese día también se controla en cuanto se carga algún turno.
     */
    diasProduccion: [1, 2, 3, 4, 5],

    /** Litros de un tanque interior. Los botones del cierre de turno cargan de a un tanque. */
    litrosPorTanque: 1525,
    /** En un turno se pasan hasta 2 tanques: no se acepta más que eso. */
    maxTanquesPorTurno: 2,

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

    /**
     * Stock de repuestos. Cada repuesto es "para" uno de los sectores de
     * "equipos" (Prensa, Extrusor, …) o para una de estas categorías extra.
     * La cantidad se cuenta en una de estas unidades: las dos primeras van de
     * a una (enteras); las demás aceptan decimales.
     */
    stock: {
      categoriasExtra: { General: 'General (lubricantes, herramientas, otros)' },
      unidades: ['unidades', 'juegos', 'litros', 'kg', 'metros'],
      unidadesEnteras: ['unidades', 'juegos'],
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

    /**
     * Copia en la nube (opcional). Con estos dos datos vacíos la app funciona
     * solo en la PC, como siempre. Se completan con los del proyecto de Firebase
     * (ver docs/nube-firebase.md). La apiKey de Firebase no es secreta: lo que
     * protege los datos son las reglas de Firestore (firebase/firestore.rules).
     */
    firebase: {
      apiKey: '',
      projectId: '',
    },
  });
})(window.SoyaCore = window.SoyaCore || {});
