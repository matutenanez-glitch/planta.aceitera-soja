/*
 * Comprobante de pesada e informe de ingresos por empresa, en PDF.
 *
 * Se generan en la PC (pdf.js, sin internet). Desde el diálogo se puede
 * descargar el PDF, compartirlo (si la PC lo permite), o abrir WhatsApp o el
 * correo con los datos escritos; en esos dos casos el PDF se descarga para
 * adjuntarlo. Los datos de la planta que salen en el encabezado se guardan
 * en esta PC (soya_planta).
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt, toast, descargar, hoy } = SoyaCore.ui;
  const store = SoyaCore.store;
  const K_PLANTA = 'soya_planta';

  const MARCA = [217, 119, 6];
  const TINTA = [15, 23, 42];
  const GRIS = [100, 116, 139];
  const LINEA = [203, 213, 225];
  const FONDO = [248, 250, 252];
  const FONDO_MARCA = [254, 243, 199];

  const rec = () => SoyaCore.views.recepcion;

  // ---------- Datos de la planta ----------
  function planta() {
    try { return JSON.parse(localStorage.getItem(K_PLANTA)) || {}; } catch (_) { return {}; }
  }
  function guardarPlanta(datos) {
    try { localStorage.setItem(K_PLANTA, JSON.stringify(datos)); } catch (_) { /* no crítico */ }
  }

  // ---------- Formatos ----------
  const numeroPesada = (r) => String(r.id).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  const ddmmaaaa = (f) => (f ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}/${String(f).slice(0, 4)}` : '-');
  const fechaHora = (f) => (f ? `${ddmmaaaa(f)} ${String(f).slice(11, 16)}` : '-');
  const archivo = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'sin_nombre';
  const humedad = (r) => (rec().tieneHumedad(r) ? fmt.porcentaje(r.humedad) : '-');

  // ---------- Partes comunes del PDF ----------
  const M = 48; // margen

  function encabezado(doc, titulo, numero, detalle) {
    const p = planta();
    const ancho = doc.ancho;
    doc.rect(0, 0, ancho, 6, { relleno: MARCA });
    doc.texto(M, 58, p.nombre || 'Planta aceitera', { tam: 18, negrita: true, color: TINTA });
    const datos = [p.cuit ? `CUIT ${p.cuit}` : '', p.direccion || '', p.telefono ? `Tel. ${p.telefono}` : ''].filter(Boolean).join(' · ');
    if (datos) doc.texto(M, 76, datos, { tam: 9, color: GRIS });
    doc.texto(ancho - M, 50, titulo, { tam: 10, negrita: true, color: MARCA, alinear: 'der' });
    if (numero) doc.texto(ancho - M, 70, numero, { tam: 15, negrita: true, color: TINTA, alinear: 'der' });
    if (detalle) doc.texto(ancho - M, 86, detalle, { tam: 9, color: GRIS, alinear: 'der' });
    doc.linea(M, 100, ancho - M, 100, { grosor: 1.5, color: MARCA });
    return 124;
  }

  function pie(doc, pagina, total) {
    const y = doc.alto - 32;
    doc.linea(M, y - 12, doc.ancho - M, y - 12, { grosor: 0.5, color: LINEA });
    const ahora = new Date();
    const cuando = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    doc.texto(M, y, `Generado con Gestión Aceitera el ${cuando}`, { tam: 8, color: GRIS });
    if (total > 1) doc.texto(doc.ancho - M, y, `Página ${pagina} de ${total}`, { tam: 8, color: GRIS, alinear: 'der' });
  }

  const tituloSeccion = (doc, y, texto) => doc.texto(M, y, texto.toUpperCase(), { tam: 8, negrita: true, color: GRIS });

  // ---------- Comprobante de pesada ----------
  function pdfPesada(r) {
    const numero = numeroPesada(r);
    const doc = SoyaCore.pdf.documento({ titulo: `Comprobante de pesada N° ${numero}` });
    doc.pagina();
    const ancho = doc.ancho;
    let y = encabezado(doc, 'COMPROBANTE DE PESADA', `N° ${numero}`, `Fecha: ${ddmmaaaa(r.fecha)}`);

    tituloSeccion(doc, y, 'Datos del camión');
    y += 10;
    const filas = [
      ['Empresa / Proveedor', r.empresa || '-'],
      ['Chofer', r.conductor || '-'],
      ['Patente', r.patente ? String(r.patente).toUpperCase() : '-'],
      ['Carga', r.carga || 'Soja'],
      ['Humedad', humedad(r)],
    ];
    doc.rect(M, y, ancho - 2 * M, filas.length * 22 + 8, { relleno: FONDO, borde: LINEA });
    filas.forEach(([k, v], i) => {
      const fy = y + 20 + i * 22;
      doc.texto(M + 14, fy, k, { tam: 10, color: GRIS });
      doc.texto(M + 150, fy, v, { tam: 11, negrita: true, color: TINTA });
    });
    y += filas.length * 22 + 36;

    tituloSeccion(doc, y, 'Pesos (balanza)');
    y += 10;
    const col = [M + 14, M + 210, ancho - M - 14];
    doc.texto(col[0], y + 16, 'Pesada', { tam: 8, negrita: true, color: GRIS });
    doc.texto(col[1], y + 16, 'Fecha y hora', { tam: 8, negrita: true, color: GRIS });
    doc.texto(col[2], y + 16, 'Kilos', { tam: 8, negrita: true, color: GRIS, alinear: 'der' });
    doc.linea(M, y + 24, ancho - M, y + 24, { color: LINEA });
    const pesos = [
      ['Bruto (camión lleno)', fechaHora(r.fecha), fmt.kg(r.bruto)],
      ['Tara (camión vacío)', fechaHora(r.fechaTara), fmt.kg(r.tara)],
    ];
    pesos.forEach(([a, b, c], i) => {
      const fy = y + 46 + i * 24;
      doc.texto(col[0], fy, a, { tam: 11, color: TINTA });
      doc.texto(col[1], fy, b, { tam: 11, color: TINTA });
      doc.texto(col[2], fy, c, { tam: 12, negrita: true, color: TINTA, alinear: 'der' });
      doc.linea(M, fy + 9, ancho - M, fy + 9, { color: LINEA, grosor: 0.5 });
    });
    y += 46 + pesos.length * 24 + 4;
    doc.rect(M, y, ancho - 2 * M, 42, { relleno: FONDO_MARCA, borde: MARCA });
    doc.texto(col[0], y + 27, 'PESO NETO', { tam: 12, negrita: true, color: MARCA });
    doc.texto(col[2], y + 28, fmt.kg(r.neto), { tam: 20, negrita: true, color: TINTA, alinear: 'der' });
    y += 120;

    // Firmas
    const ancho2 = (ancho - 2 * M - 60) / 2;
    [M, M + ancho2 + 60].forEach((x, i) => {
      doc.linea(x, y, x + ancho2, y, { color: GRIS, grosor: 0.75 });
      doc.texto(x + ancho2 / 2, y + 14, i === 0 ? 'Firma y aclaración (balanza)' : 'Firma y aclaración (chofer)', { tam: 8, color: GRIS, alinear: 'centro' });
    });
    pie(doc, 1, 1);
    return { doc, nombre: `pesada_${numero}_${archivo(r.empresa)}_${String(r.fecha).slice(0, 10)}.pdf` };
  }

  function textoPesada(r) {
    const p = planta();
    return [
      `*Comprobante de pesada N° ${numeroPesada(r)}*`,
      p.nombre ? `Planta: ${p.nombre}` : null,
      `Empresa: ${r.empresa || '-'}`,
      `Chofer: ${r.conductor || '-'}${r.patente ? ` · Patente: ${String(r.patente).toUpperCase()}` : ''}`,
      `Carga: ${r.carga || 'Soja'}${rec().tieneHumedad(r) ? ` · Humedad: ${humedad(r)}` : ''}`,
      `Bruto: ${fmt.kg(r.bruto)} (${fechaHora(r.fecha)})`,
      `Tara: ${fmt.kg(r.tara)} (${fechaHora(r.fechaTara)})`,
      `*Neto: ${fmt.kg(r.neto)}*`,
    ].filter(Boolean).join('\n');
  }

  // ---------- Informe de ingresos por empresa ----------
  const TODAS = '__todas__';

  function filtrarInforme(f) {
    return store.todos('ingresos')
      .filter((r) => !rec().enPlanta(r))
      .filter((r) => f.empresa === TODAS || String(r.empresa).trim().toLowerCase() === f.empresa.toLowerCase())
      .filter((r) => f.carga === TODAS || String(r.carga || 'Soja').trim().toLowerCase() === f.carga.toLowerCase())
      .filter((r) => { const d = String(r.fecha).slice(0, 10); return (!f.desde || d >= f.desde) && (!f.hasta || d <= f.hasta); })
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }

  function totalesInforme(lista) {
    const soja = lista.filter(rec().esSoja);
    return {
      camiones: lista.length,
      kg: lista.reduce((s, r) => s + (Number(r.neto) || 0), 0),
      humedad: rec().humedadPonderada(soja),
    };
  }

  function pdfInforme(f) {
    const lista = filtrarInforme(f);
    const t = totalesInforme(lista);
    const doc = SoyaCore.pdf.documento({ titulo: 'Informe de ingresos' });
    const ancho = doc.ancho;
    const todas = f.empresa === TODAS;
    const periodo = `${ddmmaaaa(f.desde)} al ${ddmmaaaa(f.hasta)}`;

    // Columnas: [título, ancho, alinear, valor]
    const columnas = [
      ['Fecha', 80, 'izq', (r) => fechaHora(r.fecha)],
      ['N°', 46, 'izq', numeroPesada],
      ...(todas ? [['Empresa', 92, 'izq', (r) => r.empresa || '-']] : []),
      ['Patente', 52, 'izq', (r) => (r.patente ? String(r.patente).toUpperCase() : '-')],
      ['Chofer', todas ? 60 : 92, 'izq', (r) => r.conductor || '-'],
      ['Carga', todas ? 40 : 50, 'izq', (r) => r.carga || 'Soja'],
      ['Neto (kg)', 62, 'der', (r) => fmt.entero(r.neto)],
      ['Hum.', 40, 'der', humedad],
    ];
    const total = columnas.reduce((s, c) => s + c[1], 0);
    const escala = (ancho - 2 * M) / total;
    const xs = [];
    let x = M;
    columnas.forEach((c) => { xs.push(x); x += c[1] * escala; });
    const borde = (i) => (columnas[i][2] === 'der' ? xs[i] + columnas[i][1] * escala - 4 : xs[i] + 4);
    const recortar = (texto, i, tam) => {
      let s = String(texto);
      const max = columnas[i][1] * escala - 8;
      while (s.length > 1 && doc.medir(s, tam) > max) s = s.slice(0, -2) + '…';
      return s;
    };

    const FILA = 18;
    const INICIO_PRIMERA = 124 + 62 + FILA; // encabezado + recuadros + títulos de la tabla
    const INICIO_OTRAS = 124 + FILA;
    const capacidad = (inicio) => Math.floor((doc.alto - 90 - inicio) / FILA);
    const cap1 = capacidad(INICIO_PRIMERA);
    const capN = capacidad(INICIO_OTRAS);
    const totalPaginas = 1 + Math.ceil(Math.max(0, lista.length - cap1) / capN);

    let restantes = lista.slice();
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      doc.pagina();
      let y = encabezado(doc, 'INFORME DE INGRESOS', todas ? 'Todas las empresas' : f.empresa, `Período: ${periodo}`);
      if (pagina === 1) {
        const cajas = [
          ['Camiones', fmt.entero(t.camiones)],
          ['Neto total', fmt.kg(t.kg)],
          ['Humedad prom. (soja)', fmt.porcentaje(t.humedad)],
          ['Carga', f.carga === TODAS ? 'Todas' : f.carga],
        ];
        const w = (ancho - 2 * M - 3 * 10) / 4;
        cajas.forEach(([k, v], i) => {
          const cx = M + i * (w + 10);
          doc.rect(cx, y - 6, w, 46, { relleno: i === 1 ? FONDO_MARCA : FONDO, borde: i === 1 ? MARCA : LINEA });
          doc.texto(cx + 10, y + 9, k.toUpperCase(), { tam: 7, negrita: true, color: GRIS });
          doc.texto(cx + 10, y + 29, v, { tam: 13, negrita: true, color: TINTA });
        });
        y += 62;
      }
      doc.rect(M, y, ancho - 2 * M, FILA, { relleno: TINTA });
      columnas.forEach((c, i) => doc.texto(borde(i), y + 12, c[0], { tam: 8, negrita: true, color: [255, 255, 255], alinear: c[2] }));
      y += FILA;
      const tanda = restantes.slice(0, pagina === 1 ? cap1 : capN);
      restantes = restantes.slice(tanda.length);
      tanda.forEach((r, j) => {
        if (j % 2 === 1) doc.rect(M, y, ancho - 2 * M, FILA, { relleno: FONDO });
        columnas.forEach((c, i) => doc.texto(borde(i), y + 12, recortar(c[3](r), i, 8.5), { tam: 8.5, color: TINTA, alinear: c[2] }));
        y += FILA;
      });
      if (pagina === totalPaginas) {
        doc.linea(M, y, ancho - M, y, { color: TINTA, grosor: 1 });
        const iNeto = columnas.findIndex((c) => c[0] === 'Neto (kg)');
        doc.texto(M + 4, y + 14, `Total: ${fmt.entero(t.camiones)} ${t.camiones === 1 ? 'camión' : 'camiones'}`, { tam: 9, negrita: true, color: TINTA });
        doc.texto(borde(iNeto), y + 14, fmt.entero(t.kg), { tam: 9, negrita: true, color: TINTA, alinear: 'der' });
        if (!lista.length) doc.texto(M + 4, y + 34, 'No hay camiones con estos filtros.', { tam: 10, color: GRIS });
      }
      pie(doc, pagina, totalPaginas);
    }
    return { doc, nombre: `informe_ingresos_${todas ? 'todas' : archivo(f.empresa)}_${f.desde || 'inicio'}_al_${f.hasta || 'hoy'}.pdf`, lista, t, paginas: totalPaginas };
  }

  function textoInforme(f) {
    const t = totalesInforme(filtrarInforme(f));
    const p = planta();
    return [
      `*Informe de ingresos${f.empresa === TODAS ? '' : ` — ${f.empresa}`}*`,
      p.nombre ? `Planta: ${p.nombre}` : null,
      `Período: ${ddmmaaaa(f.desde)} al ${ddmmaaaa(f.hasta)}`,
      f.carga === TODAS ? null : `Carga: ${f.carga}`,
      `Camiones: ${fmt.entero(t.camiones)}`,
      `*Neto total: ${fmt.kg(t.kg)}*`,
      t.humedad != null ? `Humedad promedio (soja): ${fmt.porcentaje(t.humedad)}` : null,
    ].filter(Boolean).join('\n');
  }

  // ---------- Diálogo ----------
  let modo = null; // { tipo: 'pesada', registro } | { tipo: 'informe' }

  function filtros() {
    return { empresa: $('#inf-empresa').value || TODAS, carga: $('#inf-carga').value || TODAS, desde: $('#inf-desde').value, hasta: $('#inf-hasta').value };
  }

  function generar() {
    if (modo.tipo === 'pesada') {
      const r = store.buscar('ingresos', modo.registro.id) || modo.registro;
      const { doc, nombre } = pdfPesada(r);
      return { blob: doc.blob(), nombre, texto: textoPesada(r), asunto: `Comprobante de pesada N° ${numeroPesada(r)}` };
    }
    const f = filtros();
    const { doc, nombre } = pdfInforme(f);
    return { blob: doc.blob(), nombre, texto: textoInforme(f), asunto: `Informe de ingresos${f.empresa === TODAS ? '' : ' — ' + f.empresa}` };
  }

  function filaResumen(k, v, fuerte) {
    return [el('dt', { className: 'text-slate-500', text: k }), el('dd', { className: fuerte ? 'font-bold text-brand-300' : 'text-slate-200', text: v })];
  }

  function pintarResumen() {
    if (modo.tipo === 'pesada') {
      const r = modo.registro;
      $('#comp-resumen').replaceChildren(
        ...filaResumen('Empresa', r.empresa || '-'),
        ...filaResumen('Chofer', `${r.conductor || '-'}${r.patente ? ' · ' + String(r.patente).toUpperCase() : ''}`),
        ...filaResumen('Carga', `${r.carga || 'Soja'} · humedad ${humedad(r)}`),
        ...filaResumen('Bruto', `${fmt.kg(r.bruto)} (${fechaHora(r.fecha)})`),
        ...filaResumen('Tara', `${fmt.kg(r.tara)} (${fechaHora(r.fechaTara)})`),
        ...filaResumen('Neto', fmt.kg(r.neto), true),
      );
      return;
    }
    const f = filtros();
    const t = totalesInforme(filtrarInforme(f));
    $('#comp-resumen').replaceChildren(
      ...filaResumen('Camiones', fmt.entero(t.camiones)),
      ...filaResumen('Neto total', fmt.kg(t.kg), true),
      ...filaResumen('Humedad prom. (soja)', fmt.porcentaje(t.humedad)),
    );
  }

  function abrir() {
    const p = planta();
    $('#planta-nombre').value = p.nombre || '';
    $('#planta-cuit').value = p.cuit || '';
    $('#planta-direccion').value = p.direccion || '';
    $('#planta-telefono').value = p.telefono || '';
    $('#comp-planta').open = !p.nombre;
    pintarResumen();
    const dialogo = $('#comp-dialogo');
    if (!dialogo.open) dialogo.showModal();
  }

  function abrirPesada(r) {
    if (!r || rec().enPlanta(r)) { toast('Este camión todavía no tiene tara: cargala primero.', 'error'); return; }
    modo = { tipo: 'pesada', registro: r };
    $('#comp-titulo-texto').textContent = `Comprobante de pesada N° ${numeroPesada(r)}`;
    $('#comp-sub').textContent = `${r.empresa || '-'} · ${ddmmaaaa(r.fecha)}`;
    $('#comp-filtros').hidden = true;
    abrir();
  }

  function abrirInforme() {
    modo = { tipo: 'informe' };
    $('#comp-titulo-texto').textContent = 'Informe de ingresos por empresa';
    $('#comp-sub').textContent = 'Camiones con la pesada completa (bruto y tara).';
    const ingresos = store.todos('ingresos');
    const unicos = (lista) => [...new Map(lista.filter(Boolean).map((x) => [String(x).trim().toLowerCase(), String(x).trim()])).values()].sort((a, b) => a.localeCompare(b, 'es'));
    const empresas = unicos(ingresos.map((r) => r.empresa));
    const cargas = unicos(ingresos.map((r) => r.carga || 'Soja'));
    const anterior = $('#inf-empresa').value;
    SoyaCore.ui.fillSelect($('#inf-empresa'), [{ value: TODAS, label: 'Todas las empresas' }, ...empresas], empresas.includes(anterior) ? anterior : TODAS);
    SoyaCore.ui.fillSelect($('#inf-carga'), [{ value: TODAS, label: 'Todas' }, ...cargas], $('#inf-carga').value || TODAS);
    if (!$('#inf-desde').value) $('#inf-desde').value = hoy().slice(0, 8) + '01';
    if (!$('#inf-hasta').value) $('#inf-hasta').value = hoy();
    $('#comp-filtros').hidden = false;
    abrir();
  }

  async function compartirArchivo(g) {
    const file = typeof File === 'function' ? new File([g.blob], g.nombre, { type: 'application/pdf' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: g.asunto, text: g.texto });
      } catch (e) {
        if (e && e.name !== 'AbortError') toast('No se pudo compartir: ' + e.message, 'error');
      }
      return;
    }
    descargar(g.nombre, g.blob, 'application/pdf');
    toast('Esta PC no permite compartir directo: se descargó el PDF para que lo adjuntes.', 'info');
  }

  function abrirEnlace(url) {
    const a = el('a', { attrs: { href: url, target: '_blank', rel: 'noopener' } });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  SoyaCore.comprobantes = {
    init() {
      const dialogo = $('#comp-dialogo');
      $('#comp-cerrar').addEventListener('click', () => dialogo.close());
      dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
      ['nombre', 'cuit', 'direccion', 'telefono'].forEach((campo) => {
        $('#planta-' + campo).addEventListener('input', () => {
          guardarPlanta({
            nombre: $('#planta-nombre').value.trim(),
            cuit: $('#planta-cuit').value.trim(),
            direccion: $('#planta-direccion').value.trim(),
            telefono: $('#planta-telefono').value.trim(),
          });
        });
      });
      ['#inf-empresa', '#inf-carga', '#inf-desde', '#inf-hasta'].forEach((s) => $(s).addEventListener('change', pintarResumen));

      $('#comp-descargar').addEventListener('click', () => {
        const g = generar();
        descargar(g.nombre, g.blob, 'application/pdf');
        toast(`PDF descargado: ${g.nombre}`, 'ok');
      });
      $('#comp-compartir').addEventListener('click', () => compartirArchivo(generar()));
      $('#comp-whatsapp').addEventListener('click', () => {
        const g = generar();
        descargar(g.nombre, g.blob, 'application/pdf');
        abrirEnlace('https://wa.me/?text=' + encodeURIComponent(g.texto));
        toast('Se abrió WhatsApp con los datos y se descargó el PDF para adjuntarlo.', 'info');
      });
      $('#comp-correo').addEventListener('click', () => {
        const g = generar();
        descargar(g.nombre, g.blob, 'application/pdf');
        abrirEnlace(`mailto:?subject=${encodeURIComponent(g.asunto)}&body=${encodeURIComponent(g.texto.replace(/\*/g, ''))}`);
        toast('Se abrió el correo con los datos y se descargó el PDF para adjuntarlo.', 'info');
      });
      $('#btn-informe-ingresos').addEventListener('click', abrirInforme);
    },
    abrirPesada,
    abrirInforme,
    // Para pruebas y para otras pantallas
    pdfPesada,
    pdfInforme,
    textoPesada,
    numeroPesada,
  };
})(window.SoyaCore = window.SoyaCore || {});
