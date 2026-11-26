/*
 * DATOS DE EJEMPLO (12 días de operación) para la vista previa y la versión de
 * prueba. No forma parte de la app: lo suman `scripts/empaquetar.mjs --prueba`
 * y la vista previa.
 *
 * Se cargan la primera vez, si el navegador no tiene datos. Si tiene datos de
 * ejemplo de otra versión, los reemplaza; si tiene datos reales, no toca nada.
 * Con localStorage "soya_sin_ejemplo" (lo pone "Empezar de cero") no carga nada.
 */
(function () {
  'use strict';
  try {
    const VERSION_DEMO = '2.26.0';
    if (localStorage.getItem('soya_sin_ejemplo')) return;
    const CLAVES = ['soya_produccion', 'soya_camiones', 'soya_expeller', 'soya_secadora', 'soya_mantenimiento', 'soya_aceite_despachos', 'soya_stock_items', 'soya_stock_movimientos'];
    const hayDatos = CLAVES.some((k) => localStorage.getItem(k));
    if (hayDatos) {
      // Si son datos de ejemplo viejos, se reemplazan; si no, no se toca nada.
      const prod = JSON.parse(localStorage.getItem('soya_produccion') || '[]');
      const esDemo = prod.length > 0 && prod.every((p) => String(p.id).startsWith('demo-'));
      if (!esDemo || localStorage.getItem('soya_demo') === VERSION_DEMO) return;
      CLAVES.concat(['soya_demo', 'soya_sync_pendientes', 'demo_nube']).forEach((k) => localStorage.removeItem(k));
    }

    const pad = (n) => String(n).padStart(2, '0');
    const fecha = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const iso = (d) => fecha(d).slice(0, 10);
    const ahora = new Date();
    const dia = (offset, h, m) => { const d = new Date(ahora); d.setDate(d.getDate() - offset); d.setHours(h, m, 0, 0); return d; };
    let id = 1;
    const nid = () => 'demo-' + id++;
    const v = (k, base, amp) => Math.round(base + amp * Math.sin(k * 1.7)); // variación determinística

    const camiones = [], expeller = [], secadora = [], produccion = [], mantenimiento = [], aceite = [];
    const proveedores = ['Agro Norte SA', 'Cooperativa La Unión', 'Don Julio Granos', 'Acopio San Martín'];
    const clientes = ['Feedlot El Cardo', 'Tambo Las Acacias', 'Nutrición Animal Sur'];
    const choferes = ['Luis Ferreyra', 'Marta Ojeda', 'Raúl Benítez', 'Carlos Ríos', 'Ana Quiroga', 'Jorge Paz'];
    const patentes = ['AC123BD', 'AA987XY', 'AF456GH', 'AB246JK', 'AD135LM', 'AE864NP'];
    const operadores = ['Juan Pérez', 'Miguel Sosa', 'Raúl Díaz'];

    for (let o = 12; o >= 1; o--) {
      const fd = dia(o, 12, 0);
      const finde = fd.getDay() === 0 || fd.getDay() === 6; // sábado y domingo no se produce
      const vie = fd.getDay() === 5;
      camiones.push({ id: nid(), fecha: fecha(dia(o, 7, 40)), fechaTara: fecha(dia(o, 8, 35)), empresa: proveedores[o % 4], conductor: choferes[o % 6], patente: patentes[o % 6], carga: 'Soja', humedad: v(o, 150, 8) / 10, bruto: 42000, tara: 42000 - v(o, 28400, 900), neto: v(o, 28400, 900) });
      if (!finde) {
        camiones.push({ id: nid(), fecha: fecha(dia(o, 13, 15)), fechaTara: fecha(dia(o, 14, 5)), empresa: proveedores[(o + 1) % 4], conductor: choferes[(o + 2) % 6], patente: patentes[(o + 2) % 6], carga: 'Soja', humedad: v(o + 3, 142, 9) / 10, bruto: 30000, tara: 30000 - v(o + 3, 18000, 700), neto: v(o + 3, 18000, 700) });
        expeller.push({ id: nid(), fecha: fecha(dia(o, 16, 30)), empresa: clientes[o % 3], conductor: choferes[(o + 4) % 6], bruto: 40000, tara: 40000 - v(o, 26900, 1200), neto: v(o, 26900, 1200) });
        // Tomas de la secadora (soja ya mezclada en el silo): una cada 3 horas en el turno de día
        [9, 12, 15].forEach((h, k) => secadora.push({ id: nid(), fecha: fecha(dia(o, h, 0)), hCaliente: v(o + k, 130, 5) / 10, hFrio: v(o + k, 123, 4) / 10 }));
        // Un cierre por turno: 1 (00–08), 2 (08–16), 3 (16–00). El viernes la producción corta a las 22:00.
        const turnos = [['Turno 1 (00:00 - 08:00)', 7, 58], ['Turno 2 (08:00 - 16:00)', 15, 57], vie ? ['Turno 3 (16:00 - 00:00)', 22, 5] : ['Turno 3 (16:00 - 00:00)', 23, 56]];
        turnos.forEach(([turno, h, m], j) => {
          if (o === 4 && j === 1) return; // un turno sin cargar, para que se vea el aviso
          const corto = vie && j === 2;
          const aceite = corto ? 1525 : (o + j) % 5 === 0 ? 1525 : (o + j) % 7 === 0 ? 2290 : 3050;
          produccion.push({ id: nid(), fecha: fecha(dia(o, h, m)), dia: iso(dia(o, 12, 0)), turno, operador: operadores[(j + Math.floor(o / 5)) % 3], expeller: v(o + j, corto ? 9400 : 12650, 400), aceite });
        });
      }
    }
    // Hoy
    const minutosHoy = ahora.getHours() * 60 + ahora.getMinutes();
    const hoyA = (frac) => { const d = new Date(ahora); d.setHours(0, Math.max(5, Math.floor(minutosHoy * frac)), 0, 0); return d; };
    // Hoy, 3 camiones en planta, cada uno con su ficha (viajes = escalones):
    //  1) Agro Norte: 2 viajes completos y el 3.º esperando la tara (con su propia tara en cada viaje)
    camiones.push({ id: nid(), ficha: 'fdemo1', fecha: fecha(hoyA(0.2)), fechaTara: fecha(hoyA(0.25)), empresa: 'Agro Norte SA', conductor: 'Luis Ferreyra', patente: 'AE789MN', carga: 'Soja', humedad: 14.9, bruto: 42300, tara: 12140, neto: 30160 });
    camiones.push({ id: nid(), ficha: 'fdemo1', fecha: fecha(hoyA(0.5)), fechaTara: fecha(hoyA(0.55)), empresa: 'Agro Norte SA', conductor: 'Luis Ferreyra', patente: 'AE789MN', carga: 'Soja', humedad: null, bruto: 41800, tara: 12180, neto: 29620 });
    camiones.push({ id: nid(), ficha: 'fdemo1', fecha: fecha(hoyA(0.82)), empresa: 'Agro Norte SA', conductor: 'Luis Ferreyra', patente: 'AE789MN', carga: 'Soja', humedad: null, bruto: 41950, tara: null, neto: null });
    //  2) Acopio San Martín: se pesó primero vacío, espera el bruto
    camiones.push({ id: nid(), ficha: 'fdemo2', fecha: fecha(hoyA(0.85)), fechaTara: fecha(hoyA(0.85)), empresa: 'Acopio San Martín', conductor: 'Ana Quiroga', patente: 'AD135LM', carga: 'Soja', humedad: null, bruto: null, tara: 13200, neto: null });
    //  3) Don Julio: entró lleno, espera la tara
    camiones.push({ id: nid(), ficha: 'fdemo3', fecha: fecha(hoyA(0.9)), empresa: 'Don Julio Granos', conductor: 'Jorge Paz', patente: 'AB321ZX', carga: 'Soja', humedad: 15.1, bruto: 29600, tara: null, neto: null });
    // Y uno que ya terminó (en "Terminados hoy")
    camiones.push({ id: nid(), ficha: 'fdemo4', fecha: fecha(hoyA(0.4)), fechaTara: fecha(hoyA(0.45)), empresa: 'Cooperativa La Unión', conductor: 'Marta Ojeda', patente: 'AD456KL', carga: 'Soja', humedad: 14.6, bruto: 41000, tara: 11860, neto: 29140, terminado: true });
    secadora.push({ id: nid(), fecha: fecha(hoyA(0.5)), hCaliente: 12.9, hFrio: 12.2 });
    // Hoy: el Turno 1 ya está cargado (si terminó); el Turno 2 queda sin cargar para mostrar el aviso.
    if (ahora.getHours() >= 8 && ahora.getDay() !== 0 && ahora.getDay() !== 6) {
      produccion.push({ id: nid(), fecha: fecha(dia(0, 7, 58)), dia: iso(ahora), turno: 'Turno 1 (00:00 - 08:00)', operador: 'Miguel Sosa', expeller: 12700, aceite: 3050 });
    }
    camiones.push({ id: nid(), fecha: fecha(dia(9, 10, 5)), empresa: 'Lubricantes del Centro', conductor: 'Pedro Gómez', carga: 'Insumos', bruto: 9000, tara: 5800, neto: 3200 });

    // Camiones de aceite pesados en balanza (kg)
    aceite.push({ id: nid(), fecha: fecha(dia(8, 11, 20)), empresa: 'Refinería del Litoral', conductor: 'Jorge Paz', bruto: 37080, tara: 15000, neto: 22080 });
    aceite.push({ id: nid(), fecha: fecha(dia(3, 10, 40)), empresa: 'Aceites del Plata', conductor: 'Carlos Ríos', bruto: 25040, tara: 14000, neto: 11040 });

    // Stock de repuestos: la cantidad sale de los movimientos menos lo usado en mantenimientos.
    const items = [], movs = [];
    const item = (nombre, categoria, unidad, minimo, inicial, extra) => {
      const it = Object.assign({ id: nid(), fecha: fecha(dia(12, 8, 0)), nombre, codigo: '', categoria, unidad, minimo, ubicacion: '' }, extra || {});
      items.push(it);
      if (inicial) movs.push({ id: nid(), fecha: it.fecha, itemId: it.id, tipo: 'alta', cantidad: inicial, nota: '' });
      return it;
    };
    const anillos = item('Juego de anillos de jaula', 'Prensa', 'juegos', 2, 3, { ubicacion: 'Estante A1' });
    item('Gusano de prensa 250 mm', 'Prensa', 'unidades', 2, 6, { codigo: 'GP-250', ubicacion: 'Estante A2' });
    const crapodina = item('Crapodina de prensa', 'Prensa', 'unidades', 2, 5, { codigo: 'SKF 51110', ubicacion: 'Estante A3' });
    const cuchillas = item('Cuchillas de extrusor', 'Extrusor', 'juegos', 1, 2, { ubicacion: 'Estante B1' });
    item('Retén 50x72x10', 'Reductor', 'unidades', 2, 4, { ubicacion: 'Cajón C3' });
    item('Rodamiento SKF 6205', 'Bomba', 'unidades', 2, 8, { codigo: '6205-2RS', ubicacion: 'Cajón C1' });
    item('Sello mecánico 35 mm', 'Bomba', 'unidades', 1, 0, { ubicacion: 'Cajón C2' });
    const aceiteVG = item('Aceite ISO VG 220', 'Aceite', 'litros', 20, 60, { ubicacion: 'Depósito' });
    item('Aceite SAE 90', 'Aceite', 'litros', 10, 25, { ubicacion: 'Depósito' });
    const grasa = item('Grasa EP2', 'Grasa', 'kg', 2, 5, { ubicacion: 'Depósito' });
    item('Llave de golpe 46 mm', 'General', 'unidades', 1, 2, { ubicacion: 'Pañol' });
    movs.push({ id: nid(), fecha: fecha(dia(5, 9, 10)), itemId: cuchillas.id, tipo: 'entrada', cantidad: 1, nota: 'Factura 0002-00451' });
    movs.push({ id: nid(), fecha: fecha(dia(4, 15, 30)), itemId: grasa.id, tipo: 'salida', cantidad: -1.5, nota: 'Engrase general de la línea 1' });

    const rodamiento = items.find((i) => i.nombre === 'Rodamiento SKF 6205');
    const eq = (equipoId, nombre, lugar, tipo) => ({ equipoId, equipo: nombre, lugar, tipo });
    const mant = (offset, h, m, equipo, tarea, estado, observaciones, usados) => mantenimiento.push(Object.assign(
      { id: nid(), fecha: fecha(dia(offset, h, m)) }, equipo,
      { tarea, usados: usados || [], repuestos: usados && usados.length ? '' : 'Ninguno', estado, observaciones: observaciones || '' },
    ));
    mant(10, 10, 30, eq('L1-PRENSA-3', 'Prensa 3', 'L1', 'Prensa'), 'Desarme completo y cambio de anillos de jaula', 'operativo', 'Desgaste parejo, sin fisuras', [{ itemId: anillos.id, nombre: anillos.nombre, unidad: 'juegos', cantidad: 1 }]);
    mant(10, 11, 0, eq('L1-CR-CHIMANGO-ACEITE', 'Caja reductora chimango aceite', 'L1', 'Reductor'), 'Cambio de aceite', 'observaciones', 'Aceite oscuro, revisar retén en 500 h', [{ itemId: aceiteVG.id, nombre: aceiteVG.nombre, unidad: 'litros', cantidad: 20 }]);
    mant(3, 9, 0, eq('L1-CR-ELEVADOR', 'Caja reductora elevador expeller', 'L1', 'Reductor'), 'Control de aceite', 'operativo');
    mant(3, 9, 45, eq('L2-EXTRUSOR', 'Extrusor/dosificador línea 2', 'L2', 'Extrusor'), 'Ajuste de sinfín', 'operativo');
    mant(3, 10, 15, eq('L2-CR-BORRERO', 'Caja reductora borrero', 'L2', 'Reductor'), 'Se agregó aceite', 'operativo');
    mant(3, 11, 30, eq('TQ-BOMBA-ACEITE', 'Bomba aceite', 'TQ', 'Bomba'), 'Revisión de sello mecánico', 'fuera', 'Sello roto, esperando repuesto');
    mant(3, 12, 10, eq('TQ-EXTRUSORA', 'Decantador', 'TQ', 'Decantador'), 'Engrase', 'operativo', '', [{ itemId: grasa.id, nombre: grasa.nombre, unidad: 'kg', cantidad: 0.5 }]);
    mant(3, 14, 0, eq('L2-PRENSA-6', 'Prensa 6', 'L2', 'Prensa'), 'Cambio de crapodinas', 'operativo', '', [{ itemId: crapodina.id, nombre: crapodina.nombre, unidad: 'unidades', cantidad: 2 }]);
    mant(3, 15, 20, eq('EX-BOMBA-EXTRACCION', 'Bomba extracción de aceite', 'EX', 'Bomba'), 'Cambio de rodamiento', 'operativo', '', [{ itemId: rodamiento.id, nombre: rodamiento.nombre, unidad: 'unidades', cantidad: 1 }]);

    // Tildes del mantenimiento de la semana: el sábado pasado se hicieron casi todos los equipos;
    // esta semana, algunos.
    const desdeSabado = (ahora.getDay() + 1) % 7 || 7;
    const tilde = (offset, h, m, e) => mantenimiento.push(Object.assign({ id: nid(), fecha: fecha(dia(offset, h, m)) }, e, { tarea: 'Mantenimiento hecho', rutina: true, usados: [], repuestos: '', estado: '', observaciones: '' }));
    const LINEA = (n, prensas) => [
      ...prensas.map((p) => eq(`L${n}-PRENSA-${p}`, `Prensa ${p}`, `L${n}`, 'Prensa')),
      eq(`L${n}-CR-ALIMENTADOR`, 'Caja reductora alimentador dosificador', `L${n}`, 'Reductor'),
      eq(`L${n}-CR-DOSIFICADOR`, 'Caja reductora dosificador prensa', `L${n}`, 'Reductor'),
      eq(`L${n}-CR-CHIMANGO-RECEPTOR`, 'Caja reductora chimango receptor', `L${n}`, 'Reductor'),
      eq(`L${n}-CR-BORRERO`, 'Caja reductora borrero', `L${n}`, 'Reductor'),
      eq(`L${n}-EXTRUSOR`, `Extrusor/dosificador línea ${n}`, `L${n}`, 'Extrusor'),
      eq(`L${n}-CR-EXTRUSOR`, 'Caja reductora extrusor', `L${n}`, 'Reductor'),
    ];
    [...LINEA(1, [1, 2, 3, 4]), ...LINEA(2, [5, 6, 7, 8]), eq('TQ-CR-T1', 'Caja reductora T1 (tanque)', 'TQ', 'Reductor'), eq('TQ-CR-T2', 'Caja reductora T2 (tanque)', 'TQ', 'Reductor')]
      .forEach((e, i) => tilde(desdeSabado, 8, i * 6, e));
    const desdeLunes = (ahora.getDay() + 6) % 7;
    if (desdeLunes >= 1) {
      tilde(desdeLunes - 1, 16, 10, eq('L1-PRENSA-2', 'Prensa 2', 'L1', 'Prensa'));
      tilde(desdeLunes - 1, 16, 25, eq('L1-BOMBA-BATEA', 'Bomba batea 1', 'L1', 'Bomba'));
      mant(desdeLunes - 1, 16, 40, eq('L1-CR-CHIMANGO-ACEITE', 'Caja reductora chimango aceite', 'L1', 'Reductor'), 'Se completó el aceite', 'operativo', '', [{ itemId: aceiteVG.id, nombre: aceiteVG.nombre, unidad: 'litros', cantidad: 4 }]);
    }

    const set = (k, val) => localStorage.setItem('soya_' + k, JSON.stringify(val.sort((a, b) => a.fecha.localeCompare(b.fecha))));
    set('camiones', camiones); set('expeller', expeller); set('secadora', secadora); set('produccion', produccion);
    set('mantenimiento', mantenimiento); set('aceite_despachos', aceite);
    set('stock_items', items); set('stock_movimientos', movs);
    localStorage.setItem('soya_demo', VERSION_DEMO);
  } catch (_) {
    /* sin almacenamiento disponible: la app arranca vacía */
  }
})();
