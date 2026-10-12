/*
 * Copia en la nube con Firebase (opcional).
 *
 * Sin cuenta, la app funciona como siempre y los datos quedan solo en esta PC.
 * Con la cuenta del dueño, cada PC de la planta:
 *   - sigue guardando todo en la PC, así funciona sin internet;
 *   - cuando hay conexión, sube lo que se cargó y baja lo que cargaron las otras PCs.
 * Si el mismo registro se cambió en dos PCs, queda el cambio más nuevo.
 * En la nube no se borra nada: un registro borrado queda marcado "borrado" con su contenido.
 *
 * Usa las APIs REST de Firebase directamente (sin librerías):
 *   - Authentication: ingresar, crear la cuenta y recuperar la contraseña.
 *   - Firestore: usuarios/{uid}/{coleccion}/{id} = { datos, borrado, modificado, servidor, dispositivo }.
 *     Se sube con batchWrite y se baja con runQuery ordenado por la hora del servidor.
 * Los datos de cada cuenta solo los puede leer y escribir esa cuenta, y nadie puede
 * pisar una versión con otra más vieja (firebase/firestore.rules).
 */
(function (SoyaCore) {
  'use strict';

  const store = SoyaCore.store;
  const PREFIX = 'soya_';
  const K_SESION = PREFIX + 'sesion';          // { uid, email, idToken, refreshToken, expira }
  const K_VINCULO = PREFIX + 'sync_vinculo';   // cuenta con la que se vinculó esta PC: { uid, email }
  const K_MARCAS = PREFIX + 'sync_marcas';     // hasta dónde se bajó cada colección + última sincronización
  const K_DISPOSITIVO = PREFIX + 'dispositivo';
  const LOTE_SUBIDA = 400;   // batchWrite acepta hasta 500 escrituras por pedido
  const LOTE_BAJADA = 300;
  const CADA = 2 * 60000;    // sincroniza sola cada 2 minutos
  const ESPERA_CAMBIO = 3000; // y 3 segundos después de cada cambio

  const leerJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };
  const guardarJSON = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch (_) { /* sin espacio: se reintenta en la próxima */ }
  };

  // La configuración sale de config.js. Para probar con otro proyecto sin tocar el
  // código, se puede guardar { apiKey, projectId } en localStorage "soya_config_firebase".
  const cfg = Object.assign({}, SoyaCore.config.firebase || {}, leerJSON(PREFIX + 'config_firebase') || {});
  const configurada = () => !!(cfg.apiKey && cfg.projectId);

  let sesion = leerJSON(K_SESION);
  let estado = { codigo: 'sinCuenta', mensaje: '' };
  const oyentes = [];
  let enCurso = null;
  let repetir = false;
  let aplicando = false;
  let espera = null;

  function dispositivo() {
    let d = null;
    try { d = localStorage.getItem(K_DISPOSITIVO); } catch (_) { /* nada */ }
    if (!d) {
      d = 'pc-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(K_DISPOSITIVO, d); } catch (_) { /* nada */ }
    }
    return d;
  }

  function info() {
    const marcas = leerJSON(K_MARCAS) || {};
    const vinculo = leerJSON(K_VINCULO);
    return {
      configurada: configurada(),
      email: sesion ? sesion.email : null,
      vinculo: vinculo ? vinculo.email : null,
      estado: !configurada() ? 'noConfigurada' : !sesion ? 'sinCuenta' : estado.codigo,
      mensaje: estado.mensaje,
      pendientes: store.pendientes().length,
      ultima: marcas.ultima || null,
    };
  }

  function ponerEstado(codigo, mensaje) {
    estado = { codigo, mensaje: mensaje || '' };
    const i = info();
    oyentes.forEach((fn) => fn(i));
  }

  // ---------- Pedidos HTTP ----------
  class ErrorNube extends Error {
    constructor(codigo, mensaje, http) {
      super(mensaje);
      this.codigo = codigo;
      this.http = http || 0;
    }
  }

  const MENSAJES = {
    EMAIL_EXISTS: 'Ya existe una cuenta con ese correo. Usá "Ingresar".',
    EMAIL_NOT_FOUND: 'El correo o la contraseña no son correctos.',
    INVALID_PASSWORD: 'El correo o la contraseña no son correctos.',
    INVALID_LOGIN_CREDENTIALS: 'El correo o la contraseña no son correctos.',
    INVALID_EMAIL: 'El correo no es válido.',
    MISSING_EMAIL: 'Falta el correo.',
    MISSING_PASSWORD: 'Falta la contraseña.',
    WEAK_PASSWORD: 'La contraseña tiene que tener al menos 6 caracteres.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Probá de nuevo en unos minutos.',
    USER_DISABLED: 'Esta cuenta está deshabilitada.',
    OPERATION_NOT_ALLOWED: 'En Firebase no está habilitado el ingreso con correo y contraseña.',
    PERMISSION_DENIED: 'La nube rechazó los datos. Revisá las reglas de Firestore.',
  };
  const SESION_VENCIDA = ['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_ID_TOKEN', 'SIN_SESION'];

  async function pedir(url, opciones) {
    let resp;
    try {
      resp = await fetch(url, opciones);
    } catch (_) {
      throw new ErrorNube('SIN_CONEXION', 'Sin conexión a internet.');
    }
    let cuerpo = null;
    try { cuerpo = await resp.json(); } catch (_) { /* respuesta vacía */ }
    if (!resp.ok) {
      const err = (cuerpo && cuerpo.error) || {};
      const texto = String(err.message || '');
      // Authentication responde "EMAIL_EXISTS" o "WEAK_PASSWORD : ..."; Firestore, un status.
      const codigo = /^[A-Z_]+(\s|:|$)/.test(texto) ? texto.split(/[\s:]/)[0] : err.status || 'HTTP_' + resp.status;
      throw new ErrorNube(codigo, MENSAJES[codigo] || texto || `Error ${resp.status}`, resp.status);
    }
    return cuerpo;
  }

  // ---------- Cuenta ----------
  const URL_AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:';

  async function autenticar(accion, email, password) {
    const r = await pedir(`${URL_AUTH}${accion}?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return {
      uid: r.localId,
      email: r.email || email,
      idToken: r.idToken,
      refreshToken: r.refreshToken,
      expira: Date.now() + (Number(r.expiresIn) || 3600) * 1000,
    };
  }

  /**
   * Ingresa (o crea la cuenta) y vincula esta PC.
   * - PC sin vincular: lo que ya hay en la PC se suma a la cuenta (la primera vez).
   * - PC vinculada a otra cuenta: si quedan cambios sin subir de esa cuenta, no se
   *   deja cambiar (se perderían). Si no, los datos de esta PC se reemplazan por los
   *   de la cuenta nueva; los de la anterior siguen en su nube.
   */
  async function entrar(accion, email, password) {
    if (!configurada()) throw new ErrorNube('NO_CONFIGURADA', 'La copia en la nube no está configurada en esta versión.');
    const vinculo = leerJSON(K_VINCULO);
    const correo = String(email).trim();
    const pendientesOtra = vinculo && vinculo.email.toLowerCase() !== correo.toLowerCase() ? store.pendientes().length : 0;
    if (pendientesOtra) {
      throw new ErrorNube('CAMBIOS_DE_OTRA_CUENTA', `Esta PC tiene ${pendientesOtra} cambio${pendientesOtra === 1 ? '' : 's'} sin subir de ${vinculo.email}. Entrá primero con esa cuenta para subirlos.`);
    }
    if (enCurso) await enCurso;
    const nueva = await autenticar(accion, correo, password);
    if (!vinculo) {
      store.descartarPendientes();
      guardarJSON(K_MARCAS, null);
      store.seguirCambios(true);
      store.marcarTodo();
    } else if (vinculo.uid !== nueva.uid) {
      if (store.pendientes().length) {
        throw new ErrorNube('CAMBIOS_DE_OTRA_CUENTA', `Esta PC tiene cambios sin subir de ${vinculo.email}. Entrá primero con esa cuenta para subirlos.`);
      }
      store.vaciar();
      guardarJSON(K_MARCAS, null);
    }
    sesion = nueva;
    guardarJSON(K_SESION, sesion);
    guardarJSON(K_VINCULO, { uid: nueva.uid, email: nueva.email });
    store.seguirCambios(true);
    arrancarReloj();
    await sincronizar();
    return info();
  }

  const ingresar = (email, password) => entrar('signInWithPassword', email, password);
  const crearCuenta = (email, password) => entrar('signUp', email, password);

  async function recuperar(email) {
    if (!configurada()) throw new ErrorNube('NO_CONFIGURADA', 'La copia en la nube no está configurada en esta versión.');
    await pedir(`${URL_AUTH}sendOobCode?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: String(email).trim() }),
    });
  }

  /**
   * Cierra la sesión en esta PC. Los datos quedan en la PC y la app sigue
   * anotando los cambios: si se vuelve a ingresar con la misma cuenta, se suben.
   */
  function salir() {
    sesion = null;
    guardarJSON(K_SESION, null);
    pararReloj();
    ponerEstado('sinCuenta');
  }

  async function token() {
    if (!sesion) throw new ErrorNube('SIN_SESION', 'Ingresá con la cuenta del dueño.');
    if (sesion.idToken && sesion.expira - 60000 > Date.now()) return sesion.idToken;
    const r = await pedir(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(sesion.refreshToken),
    });
    sesion = Object.assign({}, sesion, {
      idToken: r.id_token,
      refreshToken: r.refresh_token || sesion.refreshToken,
      expira: Date.now() + (Number(r.expires_in) || 3600) * 1000,
    });
    guardarJSON(K_SESION, sesion);
    return sesion.idToken;
  }

  // ---------- Firestore ----------
  const raiz = () => `projects/${cfg.projectId}/databases/(default)/documents`;
  const URL_FS = () => `https://firestore.googleapis.com/v1/${raiz()}`;
  /** Los ids de los registros pasan a ids válidos de Firestore (sin "/", espacios, etc.). */
  const docId = (id) => String(id).replace(/[^A-Za-z0-9-]/g, (c) => '_' + c.charCodeAt(0).toString(16).padStart(2, '0')) || '-';
  const MAX_DATOS = 19000; // las reglas aceptan hasta 20.000 caracteres por registro

  /** La sincronización en curso es de esta cuenta; si se cerró la sesión o cambió, se corta. */
  function seguir(uid) {
    if (!sesion || sesion.uid !== uid) throw new ErrorNube('CANCELADO', 'Se cerró la sesión.');
  }

  async function firestore(url, cuerpo, uid) {
    for (let intento = 0; intento < 2; intento++) {
      seguir(uid);
      const t = await token();
      try {
        return await pedir(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify(cuerpo),
        });
      } catch (e) {
        if (e.http === 401 && intento === 0) { sesion.expira = 0; continue; }
        throw e;
      }
    }
    return null;
  }

  /**
   * Sube lo pendiente con batchWrite: cada escritura se acepta o se rechaza sola.
   * Las reglas rechazan una versión más vieja que la que ya está en la nube; en ese
   * caso se deja de lado lo local y en la próxima bajada llega la versión más nueva.
   */
  async function subir(uid) {
    const lista = store.pendientes();
    let rechazados = 0;
    for (let i = 0; i < lista.length; i += LOTE_SUBIDA) {
      const lote = lista.slice(i, i + LOTE_SUBIDA);
      const writes = [];
      const enviados = [];
      const listos = [];
      lote.forEach((p) => {
        let registro = p.registro;
        let modificado = p.modificado;
        if (!p.borrado) {
          registro = store.buscar(p.coleccion, p.id);
          if (!registro) { listos.push(p); return; } // se borró después: el borrado está anotado aparte
          modificado = registro.modificado || p.modificado || 0;
        }
        const datos = JSON.stringify(registro);
        if (datos.length > MAX_DATOS) { rechazados++; listos.push(p); return; }
        writes.push({
          update: {
            name: `${raiz()}/usuarios/${uid}/${p.coleccion}/${docId(p.id)}`,
            fields: {
              datos: { stringValue: datos },
              borrado: { booleanValue: !!p.borrado },
              modificado: { integerValue: String(modificado) },
              dispositivo: { stringValue: dispositivo() },
            },
          },
          updateTransforms: [{ fieldPath: 'servidor', setToServerValue: 'REQUEST_TIME' }],
        });
        enviados.push(p);
      });
      if (writes.length) {
        const r = await firestore(`${URL_FS()}:batchWrite`, { writes }, uid);
        const estados = (r && r.status) || [];
        enviados.forEach((p, j) => {
          const st = estados[j] || {};
          if (!st.code) listos.push(p);
          else if (st.code === 7) listos.push(p); // PERMISSION_DENIED: en la nube hay una versión más nueva
          else rechazados++;                     // otro error: queda pendiente y se reintenta
        });
      }
      seguir(uid);
      store.limpiarPendientes(listos);
    }
    return rechazados;
  }

  /** Baja lo que cambió en la nube desde la última vez, colección por colección. */
  async function bajar(uid) {
    const marcas = leerJSON(K_MARCAS) || {};
    for (const col of store.colecciones()) {
      const marca = marcas[col];
      let cursor = null;
      if (marca) {
        // Un cambio de otra PC puede quedar visible unos segundos después de su hora de
        // servidor. Si la última lectura fue poco después de la marca, se relee desde un
        // poco antes (las dos horas son del servidor; no depende del reloj de la PC).
        const margen = marca.lectura ? Date.parse(marca.lectura) - Date.parse(marca.servidor) : 0;
        cursor = margen < 2 * 60000
          ? { values: [{ timestampValue: new Date(Date.parse(marca.servidor) - 2 * 60000).toISOString() }], before: true }
          : { values: [{ timestampValue: marca.servidor }, { referenceValue: marca.nombre }], before: false };
      }
      let lectura = null;
      for (;;) {
        const consulta = {
          from: [{ collectionId: col }],
          orderBy: [{ field: { fieldPath: 'servidor' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          limit: LOTE_BAJADA,
        };
        if (cursor) consulta.startAt = cursor;
        const filas = (await firestore(`${URL_FS()}/usuarios/${uid}:runQuery`, { structuredQuery: consulta }, uid)) || [];
        seguir(uid);
        lectura = (filas[0] && filas[0].readTime) || lectura;
        const docs = filas.map((f) => f.document).filter(Boolean);
        const cambios = [];
        docs.forEach((d) => {
          const f = d.fields || {};
          try {
            cambios.push({
              coleccion: col,
              registro: JSON.parse(f.datos.stringValue),
              borrado: !!(f.borrado && f.borrado.booleanValue),
              modificado: Number(f.modificado && f.modificado.integerValue) || 0,
            });
          } catch (_) { /* documento dañado: se ignora */ }
        });
        if (cambios.length) {
          aplicando = true;
          let ok;
          try { ok = store.aplicarRemotos(cambios); } finally { aplicando = false; }
          if (!ok) throw new ErrorNube('SIN_ESPACIO', 'No hay espacio en esta PC para guardar lo que llegó de la nube. Exportá un backup y liberá espacio.');
        }
        if (docs.length) {
          const ultimo = docs[docs.length - 1];
          marcas[col] = { servidor: ultimo.fields.servidor.timestampValue, nombre: ultimo.name, lectura };
          guardarJSON(K_MARCAS, marcas);
          cursor = { values: [{ timestampValue: marcas[col].servidor }, { referenceValue: ultimo.name }], before: false };
        }
        if (docs.length < LOTE_BAJADA) break;
      }
      if (marcas[col] && lectura) {
        marcas[col].lectura = lectura;
        guardarJSON(K_MARCAS, marcas);
      }
    }
    marcas.ultima = Date.now();
    guardarJSON(K_MARCAS, marcas);
  }

  function manejarError(e) {
    if (e.codigo === 'CANCELADO') return;
    if (e.codigo === 'SIN_CONEXION') {
      ponerEstado('sinConexion', 'Sin conexión. Los cambios se suben solos cuando vuelva internet.');
    } else if (SESION_VENCIDA.includes(e.codigo)) {
      sesion = null;
      guardarJSON(K_SESION, null);
      pararReloj();
      ponerEstado('error', 'La sesión venció. Ingresá de nuevo con la cuenta del dueño.');
    } else {
      ponerEstado('error', 'No se pudo sincronizar: ' + e.message);
    }
  }

  /** Baja lo nuevo y sube lo pendiente. Si ya hay una sincronización en curso, se encadena otra. */
  function sincronizar() {
    if (!configurada() || !sesion) return Promise.resolve(info());
    if (enCurso) { repetir = true; return enCurso; }
    ponerEstado('sincronizando');
    const uid = sesion.uid;
    enCurso = (async () => {
      try {
        await bajar(uid);
        const rechazados = await subir(uid);
        if (rechazados) ponerEstado('error', `${rechazados} registro${rechazados === 1 ? '' : 's'} no se pudo subir. Los demás están al día.`);
        else ponerEstado(store.pendientes().length ? 'pendiente' : 'alDia');
      } catch (e) {
        manejarError(e);
      } finally {
        enCurso = null;
        if (repetir) { repetir = false; setTimeout(sincronizar, 0); }
      }
      return info();
    })();
    return enCurso;
  }

  /** Vuelve a bajar todo de la nube (por si esta PC quedó desfasada). */
  function bajarTodo() {
    const marcas = leerJSON(K_MARCAS) || {};
    guardarJSON(K_MARCAS, { ultima: marcas.ultima });
    return sincronizar();
  }

  // ---------- Sincronización automática ----------
  let reloj = null;
  function arrancarReloj() { if (!reloj) reloj = setInterval(sincronizar, CADA); }
  function pararReloj() { clearInterval(reloj); reloj = null; clearTimeout(espera); }

  store.alCambiar((c) => {
    if (c === 'meta' || aplicando || !sesion || !configurada()) return;
    if (estado.codigo === 'alDia') ponerEstado('pendiente');
    clearTimeout(espera);
    espera = setTimeout(sincronizar, ESPERA_CAMBIO);
  });
  window.addEventListener('online', () => sesion && sincronizar());

  // Al abrir: si esta PC está vinculada, sigue anotando los cambios aunque no haya sesión.
  store.seguirCambios(!!leerJSON(K_VINCULO));
  if (configurada() && sesion) {
    arrancarReloj();
    setTimeout(sincronizar, 500);
  }

  SoyaCore.nube = {
    info,
    alCambiar: (fn) => oyentes.push(fn),
    ingresar,
    crearCuenta,
    recuperar,
    salir,
    sincronizar,
    bajarTodo,
  };
})(window.SoyaCore = window.SoyaCore || {});
