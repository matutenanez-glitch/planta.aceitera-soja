/*
 * Configuración de la planta.
 * Todo lo que cambia de una planta a otra (lugares y equipos, turnos, densidad) vive acá,
 * así no hay que tocar el HTML ni la lógica para adaptarlo.
 */
(function (SoyaCore) {
  'use strict';

  SoyaCore.config = Object.freeze({
    version: '2.21.1',
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

    /**
     * Tipos de equipo. Sirven para el "Para" de los repuestos del stock: al cargar
     * un mantenimiento, primero se ofrecen los repuestos del tipo del equipo.
     */
    tiposEquipo: {
      Prensa:   'Prensas',
      Reductor: 'Cajas reductoras',
      Extrusor: 'Extrusores',
      Bomba:    'Bombas',
    },

    /**
     * Equipos de la planta, por lugar (línea o sector), en el orden en que se muestran
     * en Mantenimientos y en Estado de Equipos.
     *   id      NO se cambia nunca: es lo que guardan los mantenimientos.
     *   nombre  se puede cambiar cuando se quiera (el historial sigue en su lugar).
     *   tipo    una de las claves de tiposEquipo.
     *   antes   nombres (o ids) que tuvo en versiones anteriores, para no perder su historial.
     *           Hasta la 2.20 los registros guardaban solo el nombre ("Prensa 3"); en la
     *           2.21.0 las prensas figuraron por error como "extrusoras" (L1-EXTRUSORA-N).
     */
    lugares: [
      {
        id: 'L1',
        nombre: 'Línea 1',
        equipos: [
          { id: 'L1-PRENSA-1', nombre: 'Prensa 1', tipo: 'Prensa', antes: ['Prensa 1', 'L1-EXTRUSORA-1'] },
          { id: 'L1-PRENSA-2', nombre: 'Prensa 2', tipo: 'Prensa', antes: ['Prensa 2', 'L1-EXTRUSORA-2'] },
          { id: 'L1-PRENSA-3', nombre: 'Prensa 3', tipo: 'Prensa', antes: ['Prensa 3', 'L1-EXTRUSORA-3'] },
          { id: 'L1-PRENSA-4', nombre: 'Prensa 4', tipo: 'Prensa', antes: ['Prensa 4', 'L1-EXTRUSORA-4'] },
          { id: 'L1-CR-ALIMENTADOR', nombre: 'Caja reductora alimentador dosificador', tipo: 'Reductor' },
          { id: 'L1-CR-DOSIFICADOR', nombre: 'Caja reductora dosificador prensa', tipo: 'Reductor' },
          { id: 'L1-CR-CHIMANGO-RECEPTOR', nombre: 'Caja reductora chimango receptor', tipo: 'Reductor' },
          { id: 'L1-CR-ELEVADOR', nombre: 'Caja reductora elevador expeller', tipo: 'Reductor' },
          { id: 'L1-CR-BORRERO', nombre: 'Caja reductora borrero', tipo: 'Reductor' },
          { id: 'L1-CR-CHIMANGO-ACEITE', nombre: 'Caja reductora chimango aceite', tipo: 'Reductor' },
          { id: 'L1-EXTRUSOR', nombre: 'Extrusor/dosificador línea 1', tipo: 'Extrusor', antes: ['Extrusor Línea 1'] },
          { id: 'L1-CR-EXTRUSOR', nombre: 'Caja reductora extrusor', tipo: 'Reductor', antes: ['Extrusor Principal L1'] },
          { id: 'L1-BOMBA-BATEA', nombre: 'Bomba batea 1', tipo: 'Bomba' },
        ],
      },
      {
        id: 'L2',
        nombre: 'Línea 2',
        equipos: [
          { id: 'L2-PRENSA-5', nombre: 'Prensa 5', tipo: 'Prensa', antes: ['Prensa 5', 'L2-EXTRUSORA-1'] },
          { id: 'L2-PRENSA-6', nombre: 'Prensa 6', tipo: 'Prensa', antes: ['Prensa 6', 'L2-EXTRUSORA-2'] },
          { id: 'L2-PRENSA-7', nombre: 'Prensa 7', tipo: 'Prensa', antes: ['Prensa 7', 'L2-EXTRUSORA-3'] },
          { id: 'L2-PRENSA-8', nombre: 'Prensa 8', tipo: 'Prensa', antes: ['Prensa 8', 'L2-EXTRUSORA-4'] },
          { id: 'L2-CR-ALIMENTADOR', nombre: 'Caja reductora alimentador dosificador', tipo: 'Reductor' },
          { id: 'L2-CR-DOSIFICADOR', nombre: 'Caja reductora dosificador prensa', tipo: 'Reductor' },
          { id: 'L2-CR-CHIMANGO-RECEPTOR', nombre: 'Caja reductora chimango receptor', tipo: 'Reductor' },
          { id: 'L2-CR-ELEVADOR', nombre: 'Caja reductora elevador expeller', tipo: 'Reductor' },
          { id: 'L2-CR-BORRERO', nombre: 'Caja reductora borrero', tipo: 'Reductor' },
          { id: 'L2-CR-CHIMANGO-ACEITE', nombre: 'Caja reductora chimango aceite', tipo: 'Reductor' },
          { id: 'L2-EXTRUSOR', nombre: 'Extrusor/dosificador línea 2', tipo: 'Extrusor', antes: ['Extrusor Línea 2'] },
          { id: 'L2-CR-EXTRUSOR', nombre: 'Caja reductora extrusor', tipo: 'Reductor', antes: ['Extrusor Principal L2'] },
          { id: 'L2-BOMBA-BATEA', nombre: 'Bomba batea 2', tipo: 'Bomba' },
        ],
      },
      {
        id: 'TP',
        nombre: 'Tolva de producción',
        equipos: [
          { id: 'TP-CR-TOLVA', nombre: 'Caja reductora tolva de producción', tipo: 'Reductor' },
        ],
      },
      {
        id: 'TQ',
        nombre: 'Tanques de aceite',
        equipos: [
          { id: 'TQ-CR-T1', nombre: 'Caja reductora T1 (tanque)', tipo: 'Reductor', antes: ['Motor/Reductor Agitador Tanque 1'] },
          { id: 'TQ-CR-T2', nombre: 'Caja reductora T2 (tanque)', tipo: 'Reductor', antes: ['Motor/Reductor Agitador Tanque 2'] },
          { id: 'TQ-EXTRUSORA', nombre: 'Extrusora tanques', tipo: 'Extrusor' },
          { id: 'TQ-BOMBA-ACEITE', nombre: 'Bomba aceite', tipo: 'Bomba' },
          { id: 'TQ-BOMBA-GOMA', nombre: 'Bomba goma', tipo: 'Bomba' },
        ],
      },
      {
        id: 'EX',
        nombre: 'Exteriores',
        equipos: [
          { id: 'EX-BOMBA-EXTERNA', nombre: 'Bomba externa', tipo: 'Bomba' },
          { id: 'EX-BOMBA-EXTRACCION', nombre: 'Bomba extracción de aceite', tipo: 'Bomba' },
        ],
      },
    ],

    /**
     * Stock de repuestos. Cada repuesto es "para" uno de los tipos de equipo
     * (tiposEquipo) o para una de estas categorías extra.
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
