/*
 * SOLO PARA LA VISTA PREVIA: simula Firebase dentro del navegador para poder
 * probar "Copia en la nube" (crear cuenta, ingresar, sincronizar) sin un
 * proyecto real. Lo "subido" queda en este navegador (clave demo_nube).
 */
(function () {
  'use strict';
  try {
    if (!localStorage.getItem('soya_config_firebase')) {
      localStorage.setItem('soya_config_firebase', JSON.stringify({ apiKey: 'demo', projectId: 'soyacore-demo' }));
    }
  } catch (_) { return; }

  const leer = () => { try { return JSON.parse(localStorage.getItem('demo_nube')) || { usuarios: {}, docs: {}, tokens: {} }; } catch (_) { return { usuarios: {}, docs: {}, tokens: {} }; } };
  const guardar = (db) => { try { localStorage.setItem('demo_nube', JSON.stringify(db)); } catch (_) { /* nada */ } };
  const resp = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
  const error = (status, message, estado) => resp(status, { error: { code: status, message, status: estado } });
  const token = (db, uid) => { const t = 'tk-' + Math.random().toString(36).slice(2); db.tokens[t] = uid; return t; };
  let ultimo = 0;
  const ahora = () => { ultimo = Math.max(ultimo + 1, Date.now() * 1000); return new Date(Math.floor(ultimo / 1000)).toISOString().replace('Z', String(ultimo % 1000).padStart(3, '0') + 'Z'); };
  const ts = (t) => t.replace('Z', '').padEnd(26, '0');

  const original = window.fetch.bind(window);
  window.fetch = async (url, op) => {
    const u = new URL(typeof url === 'string' ? url : url.url);
    if (!/googleapis\.com$/.test(u.host)) return original(url, op);
    await new Promise((r) => setTimeout(r, 250)); // como si fuera por internet
    const db = leer();
    const cuerpo = op && op.body ? op.body : '';
    if (u.host === 'identitytoolkit.googleapis.com') {
      const b = JSON.parse(cuerpo || '{}');
      const email = String(b.email || '').toLowerCase();
      const accion = u.pathname.split(':').pop();
      if (accion === 'sendOobCode') return resp(200, { email });
      let usr = db.usuarios[email];
      if (accion === 'signUp') {
        if (usr) return error(400, 'EMAIL_EXISTS');
        if (String(b.password).length < 6) return error(400, 'WEAK_PASSWORD : Password should be at least 6 characters');
        usr = db.usuarios[email] = { uid: 'demo' + Math.random().toString(36).slice(2, 8), password: b.password };
      } else if (!usr || usr.password !== b.password) {
        return error(400, 'INVALID_LOGIN_CREDENTIALS');
      }
      const t = token(db, usr.uid);
      guardar(db);
      return resp(200, { localId: usr.uid, email, idToken: t, refreshToken: t, expiresIn: '3600' });
    }
    if (u.host === 'securetoken.googleapis.com') {
      const rt = new URLSearchParams(cuerpo).get('refresh_token');
      const uid = db.tokens[rt];
      if (!uid) return error(400, 'INVALID_REFRESH_TOKEN');
      const t = token(db, uid);
      guardar(db);
      return resp(200, { id_token: t, refresh_token: t, expires_in: '3600' });
    }
    // Firestore
    const uid = db.tokens[String((op.headers || {}).Authorization || '').replace('Bearer ', '')];
    if (!uid) return error(401, 'Unauthenticated', 'UNAUTHENTICATED');
    const ruta = decodeURIComponent(u.pathname).replace('/v1/', '');
    const b = JSON.parse(cuerpo || '{}');
    if (ruta.endsWith(':batchWrite')) {
      const hora = ahora();
      const status = b.writes.map((w) => {
        const previo = db.docs[w.update.name];
        const viejo = previo && Number(w.update.fields.modificado.integerValue) < Number(previo.modificado.integerValue);
        if (!w.update.name.includes(`/usuarios/${uid}/`) || viejo) return { code: 7, message: 'Missing or insufficient permissions.' };
        db.docs[w.update.name] = Object.assign({}, w.update.fields, { servidor: { timestampValue: hora } });
        return {};
      });
      guardar(db);
      return resp(200, { writeResults: status.map(() => ({})), status });
    }
    if (ruta.endsWith(':commit')) {
      const hora = ahora();
      b.writes.forEach((w) => {
        if (!w.update.name.includes(`/usuarios/${uid}/`)) return;
        db.docs[w.update.name] = Object.assign({}, w.update.fields, { servidor: { timestampValue: hora } });
      });
      guardar(db);
      return resp(200, { commitTime: hora });
    }
    if (ruta.endsWith(':runQuery')) {
      const q = b.structuredQuery;
      const pref = `${ruta.replace(':runQuery', '')}/${q.from[0].collectionId}/`;
      if (!pref.includes(`/usuarios/${uid}/`)) return error(403, 'Missing or insufficient permissions.', 'PERMISSION_DENIED');
      let filas = Object.entries(db.docs).filter(([n]) => n.startsWith(pref)).map(([n, f]) => ({ n, f, t: ts(f.servidor.timestampValue) }));
      filas.sort((a, c) => (a.t + a.n < c.t + c.n ? -1 : 1));
      if (q.startAt) {
        const v = q.startAt.values;
        const t0 = ts(v[0].timestampValue);
        const n0 = v[1] ? v[1].referenceValue : null;
        filas = filas.filter((x) => {
          const cmp = x.t !== t0 ? (x.t > t0 ? 1 : -1) : n0 == null ? 0 : x.n === n0 ? 0 : x.n > n0 ? 1 : -1;
          return q.startAt.before ? cmp >= 0 : cmp > 0;
        });
      }
      filas = filas.slice(0, q.limit || 1000);
      return resp(200, filas.length ? filas.map((x) => ({ document: { name: x.n, fields: x.f } })) : [{ readTime: ahora() }]);
    }
    return error(404, 'Not found', 'NOT_FOUND');
  };
})();
