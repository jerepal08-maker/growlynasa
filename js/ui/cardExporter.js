import { getLang, getCropName, getMonthNames, translateTexture } from '../i18n/translations.js';
import { getCropSowMonths } from '../domain/agronomyEngine.js';

/**
 * Genera y descarga tarjetas de reporte en PNG de alta resolución (2x Retina)
 * mediante Canvas 2D nativo sin dependencias externas ni problemas de CORS.
 */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function triggerPngDownload(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function scoreColor(score) {
  if (score >= 75) return { bg: '#e6f4ea', fg: '#155724', bar: '#2e8b3d' };
  if (score >= 55) return { bg: '#fff4d6', fg: '#6b4e00', bar: '#d99a1e' };
  if (score >= 35) return { bg: '#ffedd5', fg: '#9a3412', bar: '#e67e22' };
  return { bg: '#fde2df', fg: '#7a1c12', bar: '#c0392b' };
}

export function downloadCropCardPng({ crop, evalRes, irrRes, loc, profile }) {
  const isEn = getLang() === 'en';
  const W = 960;
  const H = 640;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Fondo base
  ctx.fillStyle = '#f5f6f2';
  ctx.fillRect(0, 0, W, H);

  // Tarjeta principal blanca
  roundRect(ctx, 24, 24, W - 48, H - 48, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dde2d8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Encabezado verde AgroVision
  ctx.save();
  roundRect(ctx, 24, 24, W - 48, 108, 16);
  ctx.clip();
  const grad = ctx.createLinearGradient(24, 24, W - 24, 132);
  grad.addColorStop(0, '#1f4d2b');
  grad.addColorStop(1, '#2f6f3e');
  ctx.fillStyle = grad;
  ctx.fillRect(24, 24, W - 48, 108);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(isEn ? '🌱 AgroVision · Crop Technical Card' : '🌱 AgroVision · Ficha Técnica de Cultivo', 48, 62);

  ctx.fillStyle = '#d9ecd9';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  const dateStr = new Date().toLocaleDateString(isEn ? 'en-US' : 'es-AR');
  ctx.fillText(
    `📍 ${loc.name} (${Number(loc.lat).toFixed(3)}, ${Number(loc.lon).toFixed(3)})  ·  ${isEn ? 'Profile' : 'Perfil'}: ${profile?.plotName || ''}  ·  ${dateStr}`,
    48,
    92
  );

  // Título del cultivo + Score
  const cropTitle = `${crop.i} ${getCropName(crop)}`;
  ctx.fillStyle = '#1f261e';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(cropTitle, 48, 178);

  ctx.fillStyle = '#5b6659';
  ctx.font = 'italic 15px system-ui, -apple-system, sans-serif';
  const titleWidth = ctx.measureText(cropTitle).width;
  ctx.fillText(`(${crop.scientific}) · ${crop.family}`, 60 + titleWidth, 178);

  // Pill de puntaje
  const sc = scoreColor(evalRes.score);
  const badgeText = `${evalRes.score}/100 · ${evalRes.classification.label}`;
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 30;
  roundRect(ctx, W - 48 - badgeW, 149, badgeW, 36, 18);
  ctx.fillStyle = sc.bg;
  ctx.fill();
  ctx.fillStyle = sc.fg;
  ctx.fillText(badgeText, W - 33 - badgeW, 172);

  // Barra de progreso
  roundRect(ctx, 48, 196, W - 96, 10, 5);
  ctx.fillStyle = '#e6eae2';
  ctx.fill();
  roundRect(ctx, 48, 196, Math.max(12, ((W - 96) * evalRes.score) / 100), 10, 5);
  ctx.fillStyle = sc.bar;
  ctx.fill();

  const waterLabel = isEn
    ? ({ alta: 'high', media: 'medium', baja: 'low' }[crop.water] || crop.water)
    : crop.water;

  // 4 Cajas de parámetros clave
  const boxW = (W - 96 - 36) / 4;
  const boxes = [
    {
      lbl: isEn ? 'OPTIMAL TEMP & CYCLE' : 'TEMP. ÓPTIMA Y CICLO',
      val: `${crop.topt[0]}–${crop.topt[1]} °C`,
      sub: `${crop.cycle} ${isEn ? 'days' : 'días'} · pH ${crop.ph[0]}–${crop.ph[1]}`
    },
    {
      lbl: isEn ? 'WATER REQUIREMENT' : 'REQUERIMIENTO HÍDRICO',
      val: `~${crop.seasonalRainMinMm} mm`,
      sub: `Kc: ${crop.kc} · ${isEn ? 'Need' : 'Demanda'}: ${waterLabel}`
    },
    {
      lbl: isEn ? 'IDEAL SOIL TEXTURE' : 'TEXTURA IDEAL SUELO',
      val: crop.soil.map((s) => translateTexture(s)).slice(0, 2).join(', '),
      sub: `${isEn ? 'Max alt' : 'Alt. máx'}: ${crop.maxAltitudeM} m`
    },
    {
      lbl: 'USDA AMS MARKET DEMAND',
      val: evalRes.marketProfile ? `${evalRes.marketProfile.demandIndex}/100` : 'N/A',
      sub: crop.amsCategory || evalRes.marketProfile?.amsCommodity || 'ams.usda.gov'
    }
  ];

  boxes.forEach((b, idx) => {
    const bx = 48 + idx * (boxW + 12);
    roundRect(ctx, bx, 224, boxW, 84, 10);
    ctx.fillStyle = '#f8faf7';
    ctx.fill();
    ctx.strokeStyle = '#e0e6dc';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#5b6659';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(b.lbl || ''), bx + 12, 245);

    ctx.fillStyle = '#1f4d2b';
    ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(b.val || '').slice(0, 22), bx + 12, 272);

    ctx.fillStyle = '#5b6659';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(b.sub || '').slice(0, 30), bx + 12, 294);
  });

  // Mini Calendario Anual S / G / H
  const sowMonths = getCropSowMonths(crop, loc.lat);
  const cells = Array(12).fill('');
  const s0 = sowMonths[0] - 1;
  const dur = Math.ceil(crop.cycle / 30);
  for (let i = 0; i <= dur; i++) cells[(s0 + i) % 12] = i === dur ? 'H' : 'G';
  sowMonths.forEach((m) => { cells[m - 1] = 'S'; });

  const months = getMonthNames();
  const cellW = (W - 96) / 12;
  months.forEach((m, idx) => {
    const cx = 48 + idx * cellW;
    const code = cells[idx];
    ctx.fillStyle = code === 'S' ? '#2e8b3d' : code === 'G' ? '#d9ecd9' : code === 'H' ? '#f3c64f' : '#f1f3ee';
    ctx.fillRect(cx + 1, 324, cellW - 2, 34);
    ctx.fillStyle = code === 'S' ? '#ffffff' : '#1f261e';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${m}${code ? ' · ' + code : ''}`, cx + 8, 345);
  });

  // Columnas Ventajas y Limitantes
  const colW = (W - 96 - 20) / 2;
  ctx.fillStyle = '#155724';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(isEn ? '✔ Key Advantages' : '✔ Ventajas Principales', 48, 390);

  ctx.fillStyle = '#2c352b';
  ctx.font = '12.5px system-ui, -apple-system, sans-serif';
  let yAdv = 412;
  const advList = evalRes.advantages.slice(0, 3).length
    ? evalRes.advantages.slice(0, 3)
    : [isEn ? 'Balanced profile across evaluated criteria.' : 'Perfil equilibrado en los criterios evaluados.'];

  advList.forEach((item) => {
    const lines = wrapLines(ctx, `• ${item}`, colW);
    lines.slice(0, 2).forEach((ln) => {
      ctx.fillText(ln, 48, yAdv);
      yAdv += 17;
    });
  });

  ctx.fillStyle = '#8a1f13';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(isEn ? '⚠ Limiting Factors & Market Channel' : '⚠ Factores Limitantes y Canal Comercial', 48 + colW + 20, 390);

  ctx.fillStyle = '#2c352b';
  ctx.font = '12.5px system-ui, -apple-system, sans-serif';
  let yLim = 412;
  const rightNotes = [...evalRes.limitingFactors.slice(0, 2)];
  if (evalRes.marketProfile) {
    rightNotes.push(
      `USDA AMS: ${isEn ? evalRes.marketProfile.channelEn : evalRes.marketProfile.channelEs}`
    );
  }
  rightNotes.forEach((item) => {
    const lines = wrapLines(ctx, `• ${item}`, colW);
    lines.slice(0, 2).forEach((ln) => {
      ctx.fillText(ln, 48 + colW + 20, yLim);
      yLim += 17;
    });
  });

  // Caja inferior de Riego 7 días
  roundRect(ctx, 48, 515, W - 96, 56, 10);
  ctx.fillStyle = '#f0f7f1';
  ctx.fill();
  ctx.strokeStyle = '#2e8b3d';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#1f4d2b';
  ctx.font = 'bold 13.5px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${isEn ? '💧 7-Day Irrigation:' : '💧 Riego 7 días:'} ${irrRes?.t || ''}`, 62, 539);
  ctx.fillStyle = '#4a5548';
  ctx.font = '12.5px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${irrRes?.why?.[0] || ''}  ${irrRes?.why?.[1] || ''}`, 62, 559);

  // Pie de tarjeta
  ctx.fillStyle = '#6c776a';
  ctx.font = '11.5px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    'AgroVision · Sources: Open-Meteo (ERA5 / SRTM) · NASA POWER (GPM / SMAP) · ISRIC SoilGrids · USDA AMS Market News',
    48,
    H - 36
  );

  const safeLoc = String(loc.name || 'location').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  triggerPngDownload(canvas, `AgroVision_${crop.id}_${safeLoc}.png`);
}

export function downloadSummaryCardPng({ loc, wx, nasaDaily, topo, profile, agroPhysics, rankedCrops }) {
  const isEn = getLang() === 'en';
  const W = 960;
  const H = 640;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#f5f6f2';
  ctx.fillRect(0, 0, W, H);

  roundRect(ctx, 24, 24, W - 48, H - 48, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dde2d8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header
  ctx.save();
  roundRect(ctx, 24, 24, W - 48, 108, 16);
  ctx.clip();
  const grad = ctx.createLinearGradient(24, 24, W - 24, 132);
  grad.addColorStop(0, '#1f4d2b');
  grad.addColorStop(1, '#2f6f3e');
  ctx.fillStyle = grad;
  ctx.fillRect(24, 24, W - 48, 108);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    isEn ? '🌱 AgroVision · Executive Agroclimatic & Market Report' : '🌱 AgroVision · Reporte Ejecutivo Agroclimático y Comercial',
    48,
    64
  );

  const dateStr = new Date().toLocaleDateString(isEn ? 'en-US' : 'es-AR');
  ctx.fillStyle = '#d9ecd9';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `📍 ${loc.name} (${Number(loc.lat).toFixed(3)}, ${Number(loc.lon).toFixed(3)})  ·  ⛰️ ${topo?.elevationMeters ?? '—'} m  ·  ${dateStr}`,
    48,
    94
  );

  // KPIs
  const nd = nasaDaily?.summary;
  const ap = agroPhysics;
  const rain7d = wx?.daily ? wx.daily.reduce((s, d) => s + d.rain, 0).toFixed(1) : '—';
  const kpis = [
    { lbl: isEn ? 'AIR TEMP (2m)' : 'TEMP. AIRE (2m)', val: wx?.current?.temp != null ? `${wx.current.temp.toFixed(1)} °C` : '—' },
    { lbl: isEn ? '7D RAIN / ANNUAL GPM' : 'LLUVIA 7D / ANUAL GPM', val: `${rain7d} / ${nd?.annualRainMm ?? '—'} mm` },
    { lbl: isEn ? 'SOIL MOISTURE (SMAP)' : 'HUMEDAD SUELO (SMAP)', val: nd?.latestSoilRootPct != null ? `${nd.latestSoilRootPct}%` : '—' },
    { lbl: isEn ? 'DAYLIGHT & FROST' : 'LUZ Y HELADAS', val: `${ap?.photoperiod?.currentDaylightHours ?? '—'} h · ${ap?.frostRisk?.annualFrostDays ?? '—'} d/yr` }
  ];

  const kpiW = (W - 96 - 36) / 4;
  kpis.forEach((k, idx) => {
    const kx = 48 + idx * (kpiW + 12);
    roundRect(ctx, kx, 152, kpiW, 76, 10);
    ctx.fillStyle = '#f8faf7';
    ctx.fill();
    ctx.strokeStyle = '#dde2d8';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#5b6659';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(k.lbl, kx + 12, 174);

    ctx.fillStyle = '#1f261e';
    ctx.font = 'bold 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(k.val, kx + 12, 206);
  });

  // Top 5 Cultivos Recomendados
  ctx.fillStyle = '#1f4d2b';
  ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    isEn
      ? `🌾 Top 5 Recommended Crops (out of ${rankedCrops.length} evaluated · Weighted + USDA AMS Market Demand)`
      : `🌾 Top 5 Cultivos Recomendados (de ${rankedCrops.length} evaluados · Ponderación + Demanda USDA AMS)`,
    48,
    264
  );

  rankedCrops.slice(0, 5).forEach(({ crop, evalRes }, idx) => {
    const ry = 282 + idx * 58;
    const sc = scoreColor(evalRes.score);
    roundRect(ctx, 48, ry, W - 96, 48, 10);
    ctx.fillStyle = '#f8faf7';
    ctx.fill();
    ctx.strokeStyle = '#e2e7de';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#1f261e';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(`#${idx + 1}  ${crop.i} ${getCropName(crop)}`, 64, ry + 29);

    const mktText = evalRes.marketProfile
      ? `USDA AMS Demand: ${evalRes.marketProfile.demandIndex}/100`
      : '';
    ctx.fillStyle = '#5b6659';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText(mktText, 360, ry + 29);

    // Mini barra
    roundRect(ctx, 560, ry + 19, 160, 10, 5);
    ctx.fillStyle = '#e5e9e1';
    ctx.fill();
    roundRect(ctx, 560, ry + 19, (160 * evalRes.score) / 100, 10, 5);
    ctx.fillStyle = sc.bar;
    ctx.fill();

    ctx.fillStyle = sc.fg;
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${evalRes.score}/100`, 736, ry + 29);
  });

  // Footer
  ctx.fillStyle = '#6c776a';
  ctx.font = '11.5px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `AgroVision · Active Soil Profile: ${profile?.plotName || ''} (${profile?.completenessPct ?? 0}%) · Sources: Open-Meteo, NASA POWER, SoilGrids, USDA AMS`,
    48,
    H - 36
  );

  const safeLoc = String(loc.name || 'location').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  triggerPngDownload(canvas, `AgroVision_Summary_${safeLoc}.png`);
}
