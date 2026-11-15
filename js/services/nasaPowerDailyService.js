import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';

const roundCoord = (val) => Number(val).toFixed(3);
const formatYMD = (dateObj) => dateObj.toISOString().slice(0, 10).replace(/-/g, '');

export async function fetchNasaPowerDaily(lat, lon, signal = null) {
  // NASA POWER tiene ~5-7 días de latencia oficial de publicación
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 7);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 364); // Ventana de 365 días

  const params = new URLSearchParams({
    parameters: 'PRECTOTCORR,GWETTOP,GWETROOT,TS',
    community: 'AG',
    longitude: roundCoord(lon),
    latitude: roundCoord(lat),
    start: formatYMD(startDate),
    end: formatYMD(endDate),
    format: 'JSON'
  });

  const url = `${CONFIG.ENDPOINTS.NASA_POWER_DAILY}?${params.toString()}`;
  const { data, fromCache } = await fetchJson(url, {
    ttlMs: 24 * 60 * 60 * 1000, // 24 horas de caché
    signal,
    timeoutMs: 20000
  });

  const p = data?.properties?.parameter || {};
  const dates = Object.keys(p.PRECTOTCORR || {}).sort();

  const clean = (val) => (val === -999 || val == null ? null : Number(val));

  const records = dates.map((ymd) => ({
    date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    month: Number(ymd.slice(4, 6)),
    rain: clean(p.PRECTOTCORR?.[ymd]),       // mm/día (GPM/MERRA-2)
    soilTop: clean(p.GWETTOP?.[ymd]),        // 0..1 humedad superficial 0-5 cm (SMAP)
    soilRoot: clean(p.GWETROOT?.[ymd]),      // 0..1 humedad zona radicular 0-100 cm (SMAP)
    skinTemp: clean(p.TS?.[ymd])             // °C temperatura superficial de piel terrestre
  }));

  return {
    source: 'NASA POWER Daily (GPM + SMAP)',
    isEstimated: true,
    fromCache,
    latencyNote: 'Observación satelital asimilada (~7 días de retraso)',
    records,
    summary: summarizeDailySeries(records)
  };
}

function summarizeDailySeries(records) {
  const validRain = records.filter((r) => r.rain != null);
  const annualRainMm = validRain.reduce((acc, r) => acc + r.rain, 0);

  // Acumulado últimos 30 días disponibles
  const last30 = validRain.slice(-30);
  const rain30dMm = last30.reduce((acc, r) => acc + r.rain, 0);

  // Racha seca máxima (días consecutivos con < 1 mm) en los últimos 90 días
  const last90 = validRain.slice(-90);
  let maxDrySpell = 0;
  let currentDry = 0;
  for (const r of last90) {
    if (r.rain < 1) {
      currentDry += 1;
      if (currentDry > maxDrySpell) maxDrySpell = currentDry;
    } else {
      currentDry = 0;
    }
  }

  // Humedad del suelo más reciente (SMAP superficial y radicular)
  const validTop = records.filter((r) => r.soilTop != null);
  const validRoot = records.filter((r) => r.soilRoot != null);

  const latestTop = validTop.length ? validTop[validTop.length - 1].soilTop : null;
  const latestRoot = validRoot.length ? validRoot[validRoot.length - 1].soilRoot : null;
  const latestDate = validRoot.length ? validRoot[validRoot.length - 1].date : null;

  // Variación temporal de humedad radicular (últimos 14 días vs 14 días anteriores)
  const recent14 = validRoot.slice(-14).map((r) => r.soilRoot);
  const prev14 = validRoot.slice(-28, -14).map((r) => r.soilRoot);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const avgRecent = avg(recent14);
  const avgPrev = avg(prev14);
  let rootTrend = 'estable';
  if (avgRecent != null && avgPrev != null) {
    const diff = avgRecent - avgPrev;
    if (diff > 0.04) rootTrend = 'en aumento';
    else if (diff < -0.04) rootTrend = 'en descenso';
  }

  // Temperatura superficial más reciente
  const validSkin = records.filter((r) => r.skinTemp != null);
  const latestSkinTemp = validSkin.length ? validSkin[validSkin.length - 1].skinTemp : null;

  return {
    annualRainMm: Number(annualRainMm.toFixed(1)),
    rain30dMm: Number(rain30dMm.toFixed(1)),
    maxDrySpell90d: maxDrySpell,
    latestSoilTopPct: latestTop != null ? Math.round(latestTop * 100) : null,
    latestSoilRootPct: latestRoot != null ? Math.round(latestRoot * 100) : null,
    rootTrend,
    latestSkinTemp: latestSkinTemp != null ? Number(latestSkinTemp.toFixed(1)) : null,
    latestObsDate: latestDate
  };
}
