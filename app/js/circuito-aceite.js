/*
 * Circuito del aceite: calcula en qué estado está cada tanque a partir de
 * los cierres de turno, los despachos de aceite y las mediciones manuales.
 *
 * Cómo funciona la planta (lo que este cálculo reproduce):
 *  1. El aceite de las prensas cae a las bateas y una bomba lo manda al
 *     tanque interior que se está llenando.
 *  2. Hay 2 interiores. Cuando uno se llena se cambian las canillas al otro
 *     y el lleno queda en reposo (1 h). Después se vacía al exterior.
 *  3. Hay 4 exteriores que se llenan en ronda (1 → 2 → 3 → 4 → 1 …).
 *     Cuando al que se está llenando le falta un tanque interior o menos,
 *     se vacía a los grandes SOLO el siguiente de la ronda (el que más
 *     tiempo lleva decantando); los demás siguen decantando. Así, cuando
 *     el actual se llena, el siguiente ya está vacío para recibir.
 *  4. Los tanques grandes se llenan en orden y los vacían los camiones.
 *
 * Supuesto: el aceite de un turno entra parejo durante las horas del turno,
 * que termina en la fecha/hora en que se registró el cierre.
 *
 * Es un módulo sin pantalla (no toca el DOM) para poder probarlo aparte.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SoyaCore = root.SoyaCore || {};
    root.SoyaCore.circuito = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MINUTO = 60000;
  const EPS = 0.001;

  /** "AAAA-MM-DD HH:MM" (hora local) → milisegundos. NaN si no se entiende. */
  function parseFecha(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(texto || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
  }

  const suma = (lista) => lista.reduce((a, b) => a + b, 0);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /**
   * @param cfg   SoyaCore.config.tanques
   * @param datos { produccion, despachosAceite, mediciones } (registros del store)
   * @param ahora milisegundos
   */
  function simular(cfg, datos, ahora) {
    const capInt = cfg.interiores.capacidad;
    const capExt = cfg.exteriores.capacidad;
    const capGr = cfg.grandes.capacidad;
    const nInt = cfg.interiores.nombres.length;
    const nExt = cfg.exteriores.nombres.length;
    const nGr = cfg.grandes.nombres.length;
    const reposoMs = cfg.interiores.reposoMinutos * MINUTO;
    const turnoMs = cfg.horasTurno * 60 * MINUTO;
    const umbral = cfg.trasvaseCuandoFalten;
    const nomInt = (i) => cfg.interiores.nombres[i];
    const nomExt = (i) => cfg.exteriores.nombres[i];
    const nomGr = (i) => cfg.grandes.nombres[i];

    // Estado
    let int = new Array(nInt).fill(0);
    let reposo = new Array(nInt).fill(null); // hasta cuándo (ms)
    let intActivo = 0;
    let ext = new Array(nExt).fill(0);
    let extLlenoDesde = new Array(nExt).fill(null); // desde cuándo decanta cada exterior lleno
    let extActivo = 0;
    let gr = new Array(nGr).fill(0);

    const movimientos = [];
    let alertas = [];
    let ultimaMedicion = null;
    let ultimoTurno = null;
    const mov = (t, tipo, extra) => movimientos.push(Object.assign({ t, tipo }, extra));
    const alerta = (t, texto) => alertas.push({ t, texto });

    // ---- Tanques grandes ----
    function cargarGrandes(litros, t) {
      const reparto = [];
      for (let i = 0; i < nGr && litros > EPS; i++) {
        const carga = Math.min(litros, Math.max(capGr - gr[i], 0));
        if (carga > EPS) {
          gr[i] += carga;
          litros -= carga;
          reparto.push({ tanque: nomGr(i), litros: carga });
        }
      }
      if (litros > EPS) {
        gr[nGr - 1] += litros; // no se pierde: queda por encima de la capacidad
        reparto.push({ tanque: nomGr(nGr - 1), litros });
        alerta(t, `Los tanques grandes están llenos: ${Math.round(litros)} L quedaron por encima de la capacidad. Hace falta despachar.`);
      }
      return reparto;
    }

    // ---- Tanques exteriores ----
    const siguienteExt = (i) => (i + 1) % nExt;

    /** Vacía un exterior completo a los tanques grandes. */
    function vaciarExterior(j, t, forzado) {
      const litros = ext[j];
      ext[j] = 0;
      extLlenoDesde[j] = null;
      if (litros <= EPS) return;
      const reparto = cargarGrandes(litros, t);
      mov(t, 'trasvase', { desde: nomExt(j), litros, reparto, forzado: !!forzado });
    }

    /** Carga litros en la ronda de exteriores; devuelve los nombres de los tanques que recibieron aceite. */
    function cargarExteriores(litros, t) {
      const destinos = [];
      let vueltas = 0;
      while (litros > EPS && vueltas++ < 4 * nExt + 4) {
        const a = extActivo;
        const sig = siguienteExt(a);
        const carga = Math.min(litros, Math.max(capExt - ext[a], 0));
        if (carga > EPS) {
          ext[a] += carga;
          litros -= carga;
          if (!destinos.includes(nomExt(a))) destinos.push(nomExt(a));
        }
        // Regla de la planta: cuando al actual le falta un interior o menos, se vacía el siguiente.
        if (sig !== a && capExt - ext[a] <= umbral + EPS && ext[sig] > EPS) vaciarExterior(sig, t, false);
        if (ext[a] >= capExt - EPS) {
          extLlenoDesde[a] = t;
          extActivo = sig;
          // Si el siguiente todavía tiene aceite (no llegó a vaciarse), se vacía ahora.
          if (ext[sig] > EPS) vaciarExterior(sig, t, true);
        }
      }
      return destinos;
    }

    // ---- Tanques interiores ----
    function vaciarInterior(i, t, forzado) {
      const litros = int[i];
      int[i] = 0;
      reposo[i] = null;
      if (litros <= EPS) return;
      const m = { t, tipo: 'vaciado', desde: nomInt(i), hacia: [], litros, forzado: !!forzado };
      movimientos.push(m); // antes del posible trasvase, para que el historial quede en orden
      m.hacia = cargarExteriores(litros, t);
      if (forzado) alerta(t, `${nomInt(i)} se vació antes de cumplir el reposo porque ${nomInt(intActivo)} ya estaba lleno.`);
    }

    function procesarReposos(hasta) {
      for (;;) {
        let proximo = -1;
        for (let i = 0; i < nInt; i++) {
          if (reposo[i] != null && reposo[i] <= hasta && (proximo < 0 || reposo[i] < reposo[proximo])) proximo = i;
        }
        if (proximo < 0) return;
        vaciarInterior(proximo, reposo[proximo], false);
      }
    }

    function producir(r, fin) {
      const total = num(r.aceite);
      if (total <= EPS) return;
      let inicio = fin - turnoMs;
      const caudal = total / turnoMs; // litros por ms
      ultimoTurno = { t: fin, turno: r.turno, litros: total };
      // Si hubo una medición durante el turno, lo producido antes ya está medido:
      // solo se suma lo que entró después de la medición.
      if (ultimaMedicion && ultimaMedicion.t > inicio) inicio = Math.min(ultimaMedicion.t, fin);
      let restante = caudal * (fin - inicio);
      mov(fin, 'turno', { turno: r.turno, litros: total, contados: restante < total - EPS ? restante : null });
      let t = inicio;

      while (restante > EPS) {
        const i = intActivo;
        const espacio = capInt - int[i];
        if (restante < espacio - EPS) {
          int[i] += restante;
          restante = 0;
          break;
        }
        const tLleno = t + espacio / caudal;
        procesarReposos(tLleno);
        int[i] = capInt;
        restante -= espacio;
        t = tLleno;
        reposo[i] = tLleno + reposoMs;
        const otro = (i + 1) % nInt;
        if (reposo[otro] != null) vaciarInterior(otro, tLleno, true);
        intActivo = otro;
        mov(tLleno, 'lleno', { tanque: nomInt(i), siguiente: nomInt(otro) });
      }
    }

    function despachar(r, t) {
      const i = Math.min(Math.max(Math.round(num(r.tanque)), 0), nGr - 1);
      const litros = num(r.litros);
      if (litros > gr[i] + EPS) {
        alerta(t, `Despacho de ${Math.round(litros)} L desde ${nomGr(i)}, pero el cálculo daba ${Math.round(gr[i])} L. Cargá una medición para corregir.`);
      }
      gr[i] = Math.max(gr[i] - litros, 0);
      mov(t, 'despacho', { tanque: nomGr(i), litros, empresa: r.empresa });
    }

    function medir(r, t) {
      const lista = (v, n) => Array.from({ length: n }, (_, k) => num((v || [])[k]));
      int = lista(r.interiores, nInt);
      ext = lista(r.exteriores, nExt);
      extLlenoDesde = ext.map((l) => (l >= capExt - EPS ? t : null));
      gr = lista(r.grandes, nGr);
      intActivo = Math.min(Math.max(Math.round(num(r.interiorActivo)), 0), nInt - 1);
      extActivo = Math.min(Math.max(Math.round(num(r.exteriorActivo)), 0), nExt - 1);
      // Un interior lleno que no es el que se está llenando arranca su reposo ahora.
      reposo = int.map((l, k) => (k !== intActivo && l >= capInt - EPS ? t + reposoMs : null));
      alertas = []; // una medición corrige todo lo anterior
      ultimaMedicion = { t, id: r.id };
      mov(t, 'medicion', {});
    }

    // ---- Recorrer los eventos en orden ----
    const eventos = [];
    (datos.produccion || []).forEach((r) => eventos.push({ t: parseFecha(r.fecha), orden: 0, tipo: 'produccion', r }));
    (datos.despachosAceite || []).forEach((r) => eventos.push({ t: parseFecha(r.fecha), orden: 1, tipo: 'despacho', r }));
    (datos.mediciones || []).forEach((r) => eventos.push({ t: parseFecha(r.fecha), orden: 2, tipo: 'medicion', r }));
    eventos
      .filter((e) => Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t || a.orden - b.orden)
      .forEach((e) => {
        if (e.tipo === 'medicion') {
          medir(e.r, e.t);
        } else if (e.tipo === 'produccion') {
          procesarReposos(e.t - turnoMs);
          producir(e.r, e.t);
        } else {
          procesarReposos(e.t);
          despachar(e.r, e.t);
        }
      });
    procesarReposos(ahora);

    // ---- Resultado ----
    const interiores = int.map((litros, i) => ({
      nombre: nomInt(i),
      capacidad: capInt,
      litros,
      estado: reposo[i] != null ? 'reposo' : i === intActivo ? 'llenando' : litros > EPS ? 'con aceite' : 'vacio',
      reposoHasta: reposo[i],
      reposoRestanteMin: reposo[i] != null ? Math.max(Math.ceil((reposo[i] - ahora) / MINUTO), 0) : null,
    }));
    const exteriores = ext.map((litros, i) => ({
      nombre: nomExt(i),
      capacidad: capExt,
      litros,
      estado: i === extActivo ? 'llenando' : litros >= capExt - EPS ? 'decantando' : litros > EPS ? 'con aceite' : 'vacio',
      decantandoDesde: i !== extActivo ? extLlenoDesde[i] : null,
    }));
    const grandes = gr.map((litros, i) => ({
      nombre: nomGr(i),
      capacidad: capGr,
      litros,
      estado: litros > capGr + EPS ? 'excedido' : litros >= capGr - EPS ? 'lleno' : litros > EPS ? 'con aceite' : 'vacio',
    }));

    // Próximo vaciado de un exterior a grandes: se proyecta la ronda hacia adelante
    // hasta encontrar el momento en que al tanque que se llena le falte un interior
    // y el siguiente tenga aceite.
    const proy = ext.slice();
    let faltaParaTrasvase = 0;
    let proximoVaciado = null;
    for (let k = extActivo, paso = 0; paso <= nExt; paso++) {
      const sig = siguienteExt(k);
      if (proy[sig] > EPS && sig !== k) {
        faltaParaTrasvase += Math.max(capExt - umbral - proy[k], 0);
        proximoVaciado = nomExt(sig);
        break;
      }
      faltaParaTrasvase += Math.max(capExt - proy[k], 0);
      proy[k] = capExt;
      k = sig;
    }
    faltaParaTrasvase -= suma(int); // el aceite que ya está en los interiores también va a bajar a exteriores

    return {
      interiores,
      exteriores,
      grandes,
      totales: {
        interiores: suma(int),
        exteriores: suma(ext),
        grandes: suma(gr),
        planta: suma(int) + suma(ext) + suma(gr),
        capacidadGrandes: capGr * nGr,
      },
      faltaParaTrasvase: Math.max(faltaParaTrasvase, 0),
      proximoVaciado,
      interiorActivo: intActivo,
      exteriorActivo: extActivo,
      movimientos: movimientos.sort((a, b) => a.t - b.t),
      alertas,
      ultimaMedicion,
      ultimoTurno,
    };
  }

  return { simular, parseFecha };
});
