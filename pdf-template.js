// PDF generation engine for Evidencia de Mantenimiento Preventivo.
// Fetches certificate-template.html, injects data, captures with html2canvas, exports via jsPDF.

// Image slot IDs in the order photos[] is indexed (0–8)
const SLOT_IDS = [
  'tpl-slot-piezas',          // 0
  'tpl-slot-km',              // 1
  'tpl-slot-unidad-foto',     // 2
  'tpl-slot-antes-filtros',   // 3
  'tpl-slot-antes-aceite',    // 4
  'tpl-slot-antes-diferencial', // 5
  'tpl-slot-despues-filtros', // 6
  'tpl-slot-despues-aceite',  // 7
  'tpl-slot-despues-diferencial', // 8
];

async function buildAndExportPDF(formData, photos, mode = 'download') {
  const {
    unidad, marca, modelo, odometro, placas,
    vin, fecha, transportista, numMant, descripcion
  } = formData;

  // 1. Fetch the template HTML
  let templateHTML;
  try {
    const res = await fetch(new URL('certificate-template.html', document.baseURI).href);
    if (!res.ok) throw new Error('fetch failed');
    templateHTML = await res.text();
  } catch (e) {
    alert('Could not load certificate-template.html. Make sure the app is served from a web server.');
    return;
  }

  // 2. Parse the template and extract <style> + body content separately
  const parser = new DOMParser();
  const tplDoc = parser.parseFromString(templateHTML, 'text/html');

  // 3. Build a scoped container in the live document
  const scopeId = 'cert-render-root';
  const existing = document.getElementById(scopeId);
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = scopeId;
  wrapper.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:794px',
    'z-index:-1',
    'background:#fff',
    'overflow:visible',
  ].join(';');

  // Inject styles scoped under #cert-render-root
  const rawStyles = Array.from(tplDoc.querySelectorAll('style'))
    .map(s => s.textContent).join('\n');

  // Prefix every CSS rule block with the scope ID
  const scopedStyles = rawStyles.replace(
    /([^{}]+)\{/g,
    (match, selector) => {
      // Skip @-rules (keyframes, media, etc.)
      if (selector.trim().startsWith('@')) return match;
      const scoped = selector.split(',')
        .map(s => {
          const t = s.trim();
          if (!t) return '';
          // body and * selectors map to the wrapper itself / its descendants
          if (t === 'body') return `#${scopeId}`;
          if (t === '*') return `#${scopeId} *`;
          return `#${scopeId} ${t}`;
        })
        .filter(Boolean)
        .join(', ');
      return `${scoped} {`;
    }
  );

  const styleTag = document.createElement('style');
  styleTag.id = 'cert-scoped-style';
  styleTag.textContent = scopedStyles;
  document.head.appendChild(styleTag);

  // Inject template body content into the wrapper
  wrapper.innerHTML = tplDoc.body.innerHTML;
  document.body.appendChild(wrapper);

  // 4. Populate text fields
  const set = (id, val) => {
    const el = wrapper.querySelector('#' + id);
    if (el) el.textContent = val || '';
  };
  set('tpl-unidad',       unidad);
  set('tpl-marca',        marca);
  set('tpl-modelo',       modelo);
  set('tpl-odometro',     odometro);
  set('tpl-placas',       placas);
  set('tpl-vin',          vin);
  set('tpl-fecha',        fecha);
  set('tpl-transportista', transportista);
  set('tpl-num-mant',     numMant);
  set('tpl-descripcion',  descripcion);

  // 5. Inject images into their slots
  SLOT_IDS.forEach((slotId, i) => {
    if (!photos[i]) return;
    const slot = wrapper.querySelector('#' + slotId);
    if (!slot) return;
    slot.innerHTML = '';
    const img = document.createElement('img');
    img.src = photos[i];
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    slot.appendChild(img);
  });

  // 6. Wait for all images to finish loading
  await Promise.all(
    Array.from(wrapper.querySelectorAll('img')).map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise(r => { img.onload = r; img.onerror = r; })
    )
  );

  // Small settle delay for layout
  await new Promise(r => setTimeout(r, 150));

  // 7. Capture with html2canvas
  const page = wrapper.querySelector('#certificate-page');
  const canvas = await html2canvas(page, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: 794,
    windowWidth: 794,
    scrollX: 0,
    scrollY: 0,
  });

  // 8. Clean up injected DOM / style
  document.body.removeChild(wrapper);
  const injectedStyle = document.getElementById('cert-scoped-style');
  if (injectedStyle) injectedStyle.remove();

  // 9. Build PDF with jsPDF (A4 = 210 × 297 mm)
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgData = canvas.toDataURL('image/jpeg', 0.93);
  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

  const safePlate = (placas || 'vehiculo').replace(/[^a-zA-Z0-9-]/g, '_');
  const filename = `evidencia-mant-${safePlate}.pdf`;

  if (mode === 'download') {
    pdf.save(filename);
  } else {
    const blob = pdf.output('blob');
    window.open(URL.createObjectURL(blob), '_blank');
  }
}
