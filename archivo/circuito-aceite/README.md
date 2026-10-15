# Circuito de tanques de aceite (en pausa)

Se sacó de la app en la **v2.13.0** para simplificar la carga. Queda acá para retomarlo cuando estén
las capacidades de los tanques grandes (se miden con manguera de nivel).

- `circuito-aceite.js`: cálculo sin pantalla. A partir de los cierres de turno, los despachos y las
  mediciones, calcula el estado de los interiores (2 × 1.525 L, alternados con 1 h de reposo), los
  exteriores (4, en ronda, 4 ½ interiores útiles) y los grandes (3, capacidad provisoria).
- `circuito-aceite.test.mjs`: 12 pruebas. Se corren con `npm test` desde la raíz del proyecto.

La pantalla que lo usaba (`app/js/views/tanques.js`), su configuración (`tanques` en `config.js`) y el
formulario de mediciones están en el historial de git, en la versión **2.12.0** (commit `3313a95`).

Las mediciones que se hayan cargado con la v2.10–2.12 no se borran: siguen en el navegador con la clave
`soya_tanques_mediciones`, pero desde la v2.13 ya no entran en el backup.
