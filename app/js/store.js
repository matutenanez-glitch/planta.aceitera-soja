/*
 * Almacenamiento de datos (localStorage del navegador / Electron).
 *
 * - Usa las MISMAS claves que la v2.8 (soya_*), así los datos existentes
 *   aparecen solos al abrir esta versión.
 * - Si una clave está dañada, NO la borra: guarda una copia aparte
 *   (soya_<clave>_dañado_<fecha>) y sigue funcionando con el resto.
 * - Normaliza números guardados como texto por versiones anteriores.
 * - Exporta e importa un backup completo en JSON.
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
  };

  const datos = {};
  const errores = [];
  let meta = { schema: SCHEMA, ultimoBackup: null };
  const listeners = [];

  const nuevoId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

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

  /** Devuelve una copia de la colección (para que nadie la modifique por accidente). */
  const todos = (nombre) => datos[nombre].slice();

  function agregar(nombre, registro) {
    const r = normalizar(nombre, registro);
    datos[nombre].push(r);
    if (!persistir(nombre)) {
      datos[nombre].pop();
      return null;
    }
    notificar(nombre);
    return r;
  }

  const totalRegistros = () => Object.values(datos).reduce((n, lista) => n + lista.length, 0);

  function exportarBackup() {
    const contenido = {
      app: 'SoyaCore OS',
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
      throw new Error('El archivo no es un backup de SoyaCore OS.');
    }
    const resumen = {};
    Object.keys(COLECCIONES).forEach((nombre) => {
      const lista = obj.datos[nombre];
      if (lista !== undefined && !Array.isArray(lista)) throw new Error(`"${nombre}" no es una lista.`);
      resumen[nombre] = (lista || []).length;
    });
    return { obj, resumen };
  }

  /** Reemplaza TODOS los datos por los del backup. */
  function importarBackup(obj) {
    const anteriores = {};
    Object.keys(COLECCIONES).forEach((nombre) => {
      anteriores[nombre] = datos[nombre];
      datos[nombre] = (obj.datos[nombre] || []).filter((r) => r && typeof r === 'object').map((r) => normalizar(nombre, r));
    });
    const ok = Object.keys(COLECCIONES).every(persistir);
    if (!ok) {
      Object.assign(datos, anteriores);
      Object.keys(COLECCIONES).forEach(persistir);
      return false;
    }
    notificar('*');
    return true;
  }

  cargar();

  SoyaCore.store = {
    todos,
    agregar,
    totalRegistros,
    exportarBackup,
    validarBackup,
    importarBackup,
    errores: () => errores.slice(),
    etiqueta: (nombre) => (COLECCIONES[nombre] ? COLECCIONES[nombre].etiqueta : nombre),
    meta: () => Object.assign({}, meta),
    alCambiar: (fn) => listeners.push(fn),
  };
})(window.SoyaCore = window.SoyaCore || {});
