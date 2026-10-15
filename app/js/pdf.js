/*
 * Generador de PDF mínimo, sin librerías (funciona sin internet).
 *
 * Alcanza para comprobantes e informes: texto con Helvetica y Helvetica-Bold
 * (acentos y ñ incluidos), líneas, rectángulos y varias páginas. Las
 * coordenadas se dan en puntos (1 pt = 1/72 pulgada) desde arriba a la
 * izquierda de la hoja.
 *
 *   const doc = SoyaCore.pdf.documento({ titulo: 'Comprobante' });
 *   doc.pagina();
 *   doc.texto(40, 60, 'Hola', { tam: 18, negrita: true });
 *   SoyaCore.ui.descargar('archivo.pdf', doc.blob(), 'application/pdf');
 */
(function (SoyaCore) {
  'use strict';

  const A4 = { ancho: 595.28, alto: 841.89 };

  // Anchos de Helvetica y Helvetica-Bold (en milésimas del tamaño), códigos 32 a 255 de WinAnsi.
  const ANCHOS = {
    normal: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    negrita: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
  };

  // Caracteres fuera de Latin-1 que WinAnsi sí tiene (posiciones 128 a 159).
  const ESPECIALES = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
  const REEMPLAZOS = { '≈': '~', '×': 'x', '−': '-', '→': '->', ' ': ' ', ' ': ' ' };

  /** Texto → códigos WinAnsi (lo que no existe en la fuente se reemplaza por algo parecido o "?"). */
  function codigos(texto) {
    const out = [];
    for (const ch of String(texto)) {
      const c = REEMPLAZOS[ch] != null ? REEMPLAZOS[ch] : ch;
      for (const x of c) {
        const n = x.codePointAt(0);
        if (ESPECIALES[x] != null) out.push(ESPECIALES[x]);
        else if ((n >= 32 && n <= 126) || (n >= 160 && n <= 255)) out.push(n);
        else if (n === 9) out.push(32);
        else if (n >= 32) out.push(63); // "?"
      }
    }
    return out;
  }

  /** Cadena PDF literal, con ( ) \ escapados y los bytes altos en octal (así el archivo queda en ASCII). */
  function literal(cods) {
    let s = '(';
    cods.forEach((n) => {
      if (n === 40 || n === 41 || n === 92) s += '\\' + String.fromCharCode(n);
      else if (n < 32 || n > 126) s += '\\' + n.toString(8).padStart(3, '0');
      else s += String.fromCharCode(n);
    });
    return s + ')';
  }

  const num = (n) => (Math.round(n * 100) / 100).toString();
  const color = (c) => (c || [0, 0, 0]).map((v) => num(v / 255)).join(' ');

  function documento(opciones) {
    const op = Object.assign({ ancho: A4.ancho, alto: A4.alto, titulo: '', autor: 'Gestión Aceitera' }, opciones || {});
    const paginas = [];
    let actual = null;
    const Y = (y) => op.alto - y;

    function ancho(texto, tam, negrita) {
      const tabla = negrita ? ANCHOS.negrita : ANCHOS.normal;
      return codigos(texto).reduce((s, n) => s + (n >= 32 ? tabla[n - 32] || 556 : 0), 0) * (tam || 10) / 1000;
    }

    const doc = {
      ancho: op.ancho,
      alto: op.alto,
      medir: ancho,

      /** Agrega una hoja nueva y la deja como actual. */
      pagina() {
        actual = [];
        paginas.push(actual);
        return doc;
      },

      /**
       * Escribe texto. Opciones: tam (pt), negrita, color [r,g,b] 0-255,
       * alinear 'izq' | 'der' | 'centro' (x es el borde o el centro).
       */
      texto(x, y, texto, o) {
        const t = Object.assign({ tam: 10, negrita: false, alinear: 'izq' }, o || {});
        const w = ancho(texto, t.tam, t.negrita);
        const x0 = t.alinear === 'der' ? x - w : t.alinear === 'centro' ? x - w / 2 : x;
        actual.push(`BT /${t.negrita ? 'F2' : 'F1'} ${num(t.tam)} Tf ${color(t.color)} rg ${num(x0)} ${num(Y(y))} Td ${literal(codigos(texto))} Tj ET`);
        return w;
      },

      /** Corta un texto en renglones que entren en `max` puntos. Devuelve la lista de renglones. */
      partir(texto, max, tam, negrita) {
        const palabras = String(texto).split(/\s+/).filter(Boolean);
        const renglones = [];
        let linea = '';
        palabras.forEach((p) => {
          const prueba = linea ? linea + ' ' + p : p;
          if (ancho(prueba, tam, negrita) <= max || !linea) linea = prueba;
          else { renglones.push(linea); linea = p; }
        });
        if (linea) renglones.push(linea);
        return renglones;
      },

      linea(x1, y1, x2, y2, o) {
        const l = Object.assign({ grosor: 0.75, color: [0, 0, 0], guiones: null }, o || {});
        const dash = l.guiones ? `[${l.guiones.join(' ')}] 0 d ` : '';
        actual.push(`q ${dash}${num(l.grosor)} w ${color(l.color)} RG ${num(x1)} ${num(Y(y1))} m ${num(x2)} ${num(Y(y2))} l S Q`);
      },

      /** Rectángulo con relleno y/o borde (colores [r,g,b] 0-255). */
      rect(x, y, w, h, o) {
        const r = Object.assign({ relleno: null, borde: null, grosor: 0.75 }, o || {});
        const partes = ['q'];
        if (r.relleno) partes.push(`${color(r.relleno)} rg`);
        if (r.borde) partes.push(`${color(r.borde)} RG ${num(r.grosor)} w`);
        partes.push(`${num(x)} ${num(Y(y + h))} ${num(w)} ${num(h)} re`);
        partes.push(r.relleno && r.borde ? 'B' : r.relleno ? 'f' : 'S');
        partes.push('Q');
        actual.push(partes.join(' '));
      },

      /** Arma el archivo PDF (texto ASCII) y devuelve sus bytes. */
      bytes() {
        if (!paginas.length) doc.pagina();
        const objetos = [];
        const agregar = (cuerpo) => { objetos.push(cuerpo); return objetos.length; };
        const catalogo = agregar(null);
        const raiz = agregar(null);
        const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const hojas = paginas.map((ops) => {
          const contenido = ops.join('\n');
          const cont = agregar(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
          return agregar(`<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${num(op.ancho)} ${num(op.alto)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cont} 0 R >>`);
        });
        objetos[raiz - 1] = `<< /Type /Pages /Kids [${hojas.map((h) => h + ' 0 R').join(' ')}] /Count ${hojas.length} >>`;
        objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${raiz} 0 R >>`;
        const d = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        const fechaPdf = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        const info = agregar(`<< /Title ${literal(codigos(op.titulo))} /Author ${literal(codigos(op.autor))} /Producer ${literal(codigos('Gestión Aceitera'))} /CreationDate (${fechaPdf}) >>`);

        // Cabecera: versión + una línea con 4 bytes altos (marca de archivo binario).
        // El resto del archivo es ASCII, así que cada carácter es un byte.
        const cabecera = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]); // "%PDF-1.4\n%âãÏÓ\n"
        let cuerpo = '';
        const offsets = [];
        let largo = cabecera.length;
        objetos.forEach((contenido, i) => {
          offsets.push(largo);
          const obj = `${i + 1} 0 obj\n${contenido}\nendobj\n`;
          cuerpo += obj;
          largo += obj.length;
        });
        let tabla = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
        offsets.forEach((o) => { tabla += `${String(o).padStart(10, '0')} 00000 n \n`; });
        tabla += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${largo}\n%%EOF\n`;
        cuerpo += tabla;

        const out = new Uint8Array(cabecera.length + cuerpo.length);
        out.set(cabecera, 0);
        for (let i = 0; i < cuerpo.length; i++) out[cabecera.length + i] = cuerpo.charCodeAt(i);
        return out;
      },

      blob() { return new Blob([doc.bytes()], { type: 'application/pdf' }); },
    };
    return doc;
  }

  SoyaCore.pdf = { documento, A4 };
})(window.SoyaCore = window.SoyaCore || {});
