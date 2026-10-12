/*
 * Almacenamiento de datos (localStorage del navegador / Electron).
 *
 * - Usa las MISMAS claves que la v2.8 (soya_*), así los datos existentes
 *   aparecen solos al abrir esta versión.
 * - Si una clave está dañada, NO la borra: guarda una copia aparte
 *   (soya_<clave>_dañado_<fecha>) y sigue funcionando con el resto.
 * - Normaliza números guardados como texto por versiones anteriores.
 * - Exporta e importa un backup completo en JSON.
 * - Para la copia en la nube (nube.js): cada registro guarda cuándo se
 *   modificó y, mientras la PC está vinculada a la cuenta del dueño, anota
 *   los cambios que faltan subir (también los borrados).
 */
(function (SoyaCore) {
  'use strict';

  const PREFIX = 'soya_';
  const SCHEMA = 2;

  /** nombre en el código → clave en localStorage (+ campos numéricos) */
  const COLECCIONES = {
    ingresos:      { clave: 'camiones',      etiqueta: 'Recepción de camiones', numeros: ['neto'] },
    despachos:     { clave: 'expeller',      etiqueta: 'Despacho de expeller',  numeros: ['neto'] },
    secadora:      { clave: 'secadora',      etiqueta: 'Secadora',              numeros: ['hCamion', 'hCaliente', 'hFrio'] },
    produccion:    { clave: 'produccion',    etiqueta: 'Producción',            numeros: ['expeller', 'aceite'] },
    mantenimiento: { clave: 'mantenimiento', etiqueta: 'Mantenimiento',         numeros: [] },
    despachosAceite: { clave: 'aceite_despachos', etiqueta: 'Retiro de aceite', numeros: ['bruto', 'tara', 'neto', 'litros'] },
  };

  const datos = {};
  const errores = [];
  let meta = { schema: SCHEMA, ultimoBackup: null };
  const listeners = [];

  const nuevoId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  /**
   * Marca de modificación de un cambio sobre un registro: la hora actual, pero siempre
   * mayor que la versión que se tenía. Así un cambio hecho después de ver una versión
   * le gana a esa versión aunque el reloj de otra PC esté adelantado.
   */
  const siguienteMarca = (anterior) => Math.max(Date.now(), ((anterior && anterior.modificado) || 0) + 1);

  /** Completa id y convierte a número los campos numéricos. Marca `cambio` si tocó algo. */
  function normalizar(nombre, registro, estado) {
    const r = Object.assign({}, registro);
    if (r.id == null) {
      r.id = nuevoId();
      if (estado) estado.cambio = true;
    }
    COLECCIONES[nombre].numeros.forEach((campo) => {
      if (typeof r[campo] === 'string' && r[campo] !== '') {
        r[campo] = Number(r[campo]);
        if (estado) estado.cambio = true;
      }
    });
    // v2.14: los turnos pasan a 1 (00–08), 2 (08–16) y 3 (16–00), y cada cierre guarda su día.
    if (nombre === 'produccion' && SoyaCore.turnos) {
      const etiqueta = SoyaCore.turnos.normalizarEtiqueta(r.turno);
      if (etiqueta !== r.turno) {
        r.turno = etiqueta;
        if (estado) estado.cambio = true;
      }
      if (!SoyaCore.turnos.esDia(r.dia)) {
        r.dia = SoyaCore.turnos.diaDe(r);
        if (estado) estado.cambio = true;
      }
    }
    return r;
  }

  function leer(clave) {
    const raw = localStorage.getItem(PREFIX + clave);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('el contenido no es una lista');
    return parsed;
  }

  function cargar() {
    Object.entries(COLECCIONES).forEach(([nombre, def]) => {
      try {
        const estado = { cambio: false };
        datos[nombre] = leer(def.clave).filter((r) => r && typeof r === 'object').map((r) => normalizar(nombre, r, estado));
        // Migración desde v2.8: se guarda una sola vez con ids y números normalizados.
        if (estado.cambio) persistir(nombre);
      } catch (err) {
        datos[nombre] = [];
        let copia = null;
        try {
          copia = `${PREFIX}${def.clave}_dañado_${Date.now()}`;
          localStorage.setItem(copia, localStorage.getItem(PREFIX + def.clave));
          // Solo si la copia quedó guardada se limpia la clave original.
          localStorage.setItem(PREFIX + def.clave, '[]');
        } catch (_) {
          copia = null; // sin espacio: se deja la clave original intacta
        }
        errores.push({ nombre, copia, mensaje: err.message });
        console.error('[SoyaCore] No se pudo leer', def.clave, err);
      }
    });
    try {
      meta = Object.assign(meta, JSON.parse(localStorage.getItem(PREFIX + 'meta')) || {});
    } catch (_) { /* meta dañada: se usan valores por defecto */ }
  }

  function persistir(nombre) {
    try {
      localStorage.setItem(PREFIX + COLECCIONES[nombre].clave, JSON.stringify(datos[nombre]));
      return true;
    } catch (err) {
      console.error('[SoyaCore] No se pudo guardar', nombre, err);
      SoyaCore.ui.toast('No se pudo guardar: el almacenamiento está lleno o bloqueado. Exportá un backup.', 'error');
      return false;
    }
  }

  function guardarMeta() {
    try { localStorage.setItem(PREFIX + 'meta', JSON.stringify(meta)); } catch (_) { /* no crítico */ }
  }

  const notificar = (nombre) => listeners.forEach((fn) => fn(nombre));

  // ---------- Cambios pendientes de subir a la nube ----------
  // pendientes["coleccion/id"] = { coleccion, id, borrado, modificado, registro? }
  // Un borrado guarda el registro, para que en la nube quede como "borrado" con su contenido.
  const CLAVE_PENDIENTES = PREFIX + 'sync_pendientes';
  let seguir = false;
  let pendientes = {};
  try { pendientes = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES)) || {}; } catch (_) { pendientes = {}; }
  const clavePendiente = (nombre, id) => `${nombre}/${id}`;

  function guardarPendientes() {
    try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(pendientes)); } catch (_) { /* se reintenta en el próximo cambio */ }
  }

  function marcar(nombre, registro, borrado) {
    if (!seguir) return;
    pendientes[clavePendiente(nombre, registro.id)] = borrado
      ? { coleccion: nombre, id: registro.id, borrado: true, modificado: siguienteMarca(registro), registro }
      : { coleccion: nombre, id: registro.id, borrado: false, modificado: registro.modificado || 0 };
    guardarPendientes();
  }

  /** Todos los registros locales pasan a pendientes (al vincular la PC con la cuenta). */
  function marcarTodo() {
    Object.keys(COLECCIONES).forEach((nombre) => datos[nombre].forEach((r) => {
      const k = clavePendiente(nombre, r.id);
      if (!pendientes[k]) pendientes[k] = { coleccion: nombre, id: r.id, borrado: false, modificado: r.modificado || 0 };
    }));
    guardarPendientes();
  }

  /** Saca de pendientes lo que ya se subió, si no volvió a cambiar mientras tanto. */
  function limpiarPendientes(subidos) {
    subidos.forEach((p) => {
      const k = clavePendiente(p.coleccion, p.id);
      if (pendientes[k] && pendientes[k].modificado === p.modificado && pendientes[k].borrado === p.borrado) delete pendientes[k];
    });
    guardarPendientes();
  }

  /** Inserta respetando el orden por fecha, para que las tablas sigan en orden. */
  function insertarOrdenado(lista, r) {
    const i = lista.findIndex((x) => String(x.fecha) > String(r.fecha));
    if (i < 0) lista.push(r);
    else lista.splice(i, 0, r);
  }

  /**
   * Aplica cambios que vienen de la nube: [{ coleccion, registro, borrado, modificado }].
   * Gana el cambio más nuevo: si lo que hay en esta PC es más reciente, se deja el
   * local y se vuelve a anotar para subirlo. Devuelve false si no se pudo guardar.
   */
  function aplicarRemotos(cambios) {
    const tocadas = new Set();
    cambios.forEach(({ coleccion, registro, borrado, modificado }) => {
      if (!COLECCIONES[coleccion] || !registro || registro.id == null) return;
      const k = clavePendiente(coleccion, registro.id);
      const p = pendientes[k];
      if (p && p.modificado > modificado) return;
      if (p) delete pendientes[k];
      const lista = datos[coleccion];
      const i = lista.findIndex((r) => r.id === registro.id);
      if (i >= 0 && (lista[i].modificado || 0) > modificado) {
        marcar(coleccion, lista[i]);
        return;
      }
      if (borrado) {
        if (i >= 0) { lista.splice(i, 1); tocadas.add(coleccion); }
        return;
      }
      const r = normalizar(coleccion, registro);
      r.modificado = modificado;
      if (i >= 0) {
        if (JSON.stringify(lista[i]) === JSON.stringify(r)) return;
        lista[i] = r;
      } else {
        insertarOrdenado(lista, r);
      }
      tocadas.add(coleccion);
    });
    guardarPendientes();
    const ok = [...tocadas].every((c) => persistir(c));
    tocadas.forEach(notificar);
    return ok;
  }

  /** Deja esta PC sin datos (al pasarla a otra cuenta, cuyos datos se bajan de la nube). */
  function vaciar() {
    Object.keys(COLECCIONES).forEach((nombre) => { datos[nombre] = []; persistir(nombre); });
    pendientes = {};
    guardarPendientes();
    notificar('*');
  }

  /** Devuelve una copia de la colección (para que nadie la modifique por accidente). */
  const todos = (nombre) => datos[nombre].slice();

  function agregar(nombre, registro) {
    const r = normalizar(nombre, registro);
    r.modificado = Date.now();
    datos[nombre].push(r);
    if (!persistir(nombre)) {
      datos[nombre].pop();
      return null;
    }
    marcar(nombre, r);
    notificar(nombre);
    return r;
  }

  const buscar = (nombre, id) => datos[nombre].find((r) => r.id === id) || null;

  /** Reemplaza los campos de un registro existente. Marca cuándo se editó. */
  function actualizar(nombre, id, cambios) {
    const i = datos[nombre].findIndex((r) => r.id === id);
    if (i < 0) return null;
    const anterior = datos[nombre][i];
    const nuevo = normalizar(nombre, Object.assign({}, anterior, cambios, { id, editado: SoyaCore.ui.ahora(), modificado: siguienteMarca(anterior) }));
    datos[nombre][i] = nuevo;
    if (!persistir(nombre)) {
      datos[nombre][i] = anterior;
      return null;
    }
    marcar(nombre, nuevo);
    notificar(nombre);
    return nuevo;
  }

  /** Borra un registro. Devuelve lo necesario para deshacer: { registro, indice }. */
  function borrar(nombre, id) {
    const i = datos[nombre].findIndex((r) => r.id === id);
    if (i < 0) return null;
    const [registro] = datos[nombre].splice(i, 1);
    if (!persistir(nombre)) {
      datos[nombre].splice(i, 0, registro);
      return null;
    }
    marcar(nombre, registro, true);
    notificar(nombre);
    return { registro, indice: i };
  }

  /** Vuelve a poner un registro borrado en su lugar (botón "Deshacer"). */
  function restaurar(nombre, { registro, indice }) {
    if (buscar(nombre, registro.id)) return false;
    const r = Object.assign({}, registro, { modificado: siguienteMarca(registro) });
    datos[nombre].splice(Math.min(indice, datos[nombre].length), 0, r);
    if (!persistir(nombre)) {
      datos[nombre].splice(datos[nombre].indexOf(r), 1);
      return false;
    }
    marcar(nombre, r);
    notificar(nombre);
    return true;
  }

  const totalRegistros = () => Object.values(datos).reduce((n, lista) => n + lista.length, 0);

  function exportarBackup() {
    const contenido = {
      app: 'Gestión Aceitera',
      version: SoyaCore.config.version,
      schema: SCHEMA,
      exportado: new Date().toISOString(),
      datos,
    };
    meta.ultimoBackup = contenido.exportado;
    guardarMeta();
    notificar('meta');
    return JSON.stringify(contenido, null, 2);
  }

  /** Valida un backup y devuelve cuántos registros trae por colección. */
  function validarBackup(texto) {
    let obj;
    try {
      obj = JSON.parse(texto);
    } catch (_) {
      throw new Error('el archivo no es un JSON válido.');
    }
    if (!obj || typeof obj !== 'object' || !obj.datos || typeof obj.datos !== 'object') {
      throw new Error('El archivo no es un backup de Gestión Aceitera.');
    }
    const resumen = {};
    Object.keys(COLECCIONES).forEach((nombre) => {
      const lista = obj.datos[nombre];
      if (lista !== undefined && !Array.isArray(lista)) throw new Error(`"${nombre}" no es una lista.`);
      resumen[nombre] = (lista || []).length;
    });
    return { obj, resumen };
  }

  /**
   * Reemplaza TODOS los datos por los del backup. Si la PC está vinculada a la
   * nube, el backup manda en todas las PCs: sus registros quedan como los más
   * nuevos y se borran los que no trae. Si no está vinculada, cada registro
   * conserva la fecha en que se modificó.
   */
  function importarBackup(obj) {
    const anteriores = {};
    Object.keys(COLECCIONES).forEach((nombre) => {
      anteriores[nombre] = datos[nombre];
      const previos = new Map(datos[nombre].map((r) => [r.id, r]));
      datos[nombre] = (obj.datos[nombre] || []).filter((r) => r && typeof r === 'object').map((r) => {
        const n = normalizar(nombre, r);
        n.modificado = seguir ? siguienteMarca(previos.get(n.id)) : Number(r.modificado) || 0;
        return n;
      });
    });
    const ok = Object.keys(COLECCIONES).every(persistir);
    if (!ok) {
      Object.assign(datos, anteriores);
      Object.keys(COLECCIONES).forEach(persistir);
      return false;
    }
    Object.keys(COLECCIONES).forEach((nombre) => {
      const nuevos = new Set(datos[nombre].map((r) => r.id));
      anteriores[nombre].filter((r) => !nuevos.has(r.id)).forEach((r) => marcar(nombre, r, true));
      datos[nombre].forEach((r) => marcar(nombre, r));
    });
    notificar('*');
    return true;
  }

  cargar();

  SoyaCore.store = {
    todos,
    buscar,
    agregar,
    actualizar,
    borrar,
    restaurar,
    totalRegistros,
    exportarBackup,
    validarBackup,
    importarBackup,
    errores: () => errores.slice(),
    etiqueta: (nombre) => (COLECCIONES[nombre] ? COLECCIONES[nombre].etiqueta : nombre),
    meta: () => Object.assign({}, meta),
    alCambiar: (fn) => listeners.push(fn),
    // Para la copia en la nube (nube.js)
    colecciones: () => Object.keys(COLECCIONES),
    seguirCambios: (activo) => { seguir = !!activo; },
    marcarTodo,
    pendientes: () => Object.values(pendientes).map((p) => Object.assign({}, p)),
    limpiarPendientes,
    descartarPendientes: () => { pendientes = {}; guardarPendientes(); },
    aplicarRemotos,
    vaciar,
    siguiendo: () => seguir,
  };
})(window.SoyaCore = window.SoyaCore || {});
