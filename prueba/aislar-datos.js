/*
 * VERSIÓN DE PRUEBA: guarda los datos aparte, con "prueba:" delante de cada
 * clave. Así lo que se carga al probar no se mezcla con la versión final, aunque
 * se usen en la misma PC y el mismo navegador. Va antes que todo lo demás.
 *
 * Lo suma `scripts/empaquetar.mjs --prueba`. No forma parte de la app.
 */
(function () {
  'use strict';
  const PREFIJO = 'prueba:';
  try {
    const P = Storage.prototype;
    const leer = P.getItem;
    const escribir = P.setItem;
    const quitar = P.removeItem;
    P.getItem = function (k) { return leer.call(this, PREFIJO + k); };
    P.setItem = function (k, v) { return escribir.call(this, PREFIJO + k, v); };
    P.removeItem = function (k) { return quitar.call(this, PREFIJO + k); };

    window.SoyaPrueba = Object.assign(window.SoyaPrueba || {}, {
      /** Borra todo lo de la versión de prueba (no toca nada de la versión final). */
      borrarTodo() {
        const ls = window.localStorage;
        const claves = [];
        for (let i = 0; i < ls.length; i++) {
          const k = P.key.call(ls, i);
          if (k && k.startsWith(PREFIJO)) claves.push(k);
        }
        claves.forEach((k) => quitar.call(ls, k));
      },
    });
  } catch (_) {
    /* sin almacenamiento: la app avisa sola */
  }
})();
