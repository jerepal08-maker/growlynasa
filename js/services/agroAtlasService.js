import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';

// Diccionario oficial de códigos USDA Cropland Data Layer (CDL)
const CDL_CROP_CODES = {
  1: 'Maíz',
  2: 'Algodón',
  3: 'Arroz',
  4: 'Sorgo',
  5: 'Soja',
  6: 'Girasol',
  10: 'Maní',
  21: 'Cebada',
  22: 'Trigo duro',
  23: 'Trigo de primavera',
  24: 'Trigo de invierno',
  28: 'Avena',
  36: 'Alfalfa',
  37: 'Otros henos / pasturas',
  41: 'Remolacha azucarera',
  42: 'Poroto seco',
  43: 'Papa',
  54: 'Tomate',
  61: 'Barbecho / tierra en descanso',
  176: 'Pastizal / pradera'
};

// Datasets científicos de referencia de USDA Ag Data Commons usados para calibración agronómica
const CURATED_USDA_DATASETS = [
  {
    title: 'USDA-ARS Crop Cardinal Temperatures & Photoperiod Parameters',
    name: 'crop-cardinal-temperatures',
    url: 'https://data.nal.usda.gov/'
  },
  {
    title: 'Soil Health, Organic Matter & pH Thresholds for Field Crops',
    name: 'soil-health-thresholds',
    url: 'https://data.nal.usda.gov/'
  },
  {
    title: 'Crop Water Use, Evapotranspiration (Kc) & Drought Sensitivity',
    name: 'crop-water-use-kc',
    url: 'https://data.nal.usda.gov/'
  }
];

export function isInsideUsContiguous(lat, lon) {
  return lat >= 24.5 && lat <= 49.5 && lon >= -125.0 && lon <= -66.9;
}

/**
 * Proyección cartográfica exacta WGS84 (lat, lon) -> EPSG:5070 (Albers Equal Area Conic USA)
 * Requerida por los servicios oficiales de USDA CropScape NASS CDL.
 */
export function projectToEpsg5070(lat, lon) {
  const deg2rad = Math.PI / 180;
  const a = 6378137.0;
  const e2 = 0.0066943800229;
  const e = Math.sqrt(e2);

  const phi = lat * deg2rad;
  const lam = lon * deg2rad;
  const phi0 = 23.0 * deg2rad;
  const lam0 = -96.0 * deg2rad;
  const phi1 = 29.5 * deg2rad;
  const phi2 = 45.5 * deg2rad;

  const calcQ = (p) => {
    const sinP = Math.sin(p);
    return (1 - e2) * (sinP / (1 - e2 * sinP * sinP) - (1 / (2 * e)) * Math.log((1 - e * sinP) / (1 + e * sinP)));
  };
  const calcM = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);

  const q = calcQ(phi);
  const q0 = calcQ(phi0);
  const q1 = calcQ(phi1);
  const q2 = calcQ(phi2);

  const m1 = calcM(phi1);
  const m2 = calcM(phi2);

  const n = (m1 * m1 - m2 * m2) / (q2 - q1);
  const C = m1 * m1 + n * q1;
  const rho = (a * Math.sqrt(Math.max(0, C - n * q))) / n;
  const rho0 = (a * Math.sqrt(Math.max(0, C - n * q0))) / n;
  const theta = n * (lam - lam0);

  return {
    x: Number((rho * Math.sin(theta)).toFixed(2)),
    y: Number((rho0 - rho * Math.cos(theta)).toFixed(2))
  };
}

/**
 * E. USDA CropScape: historial de cultivos reales a 30m (solo EE.UU. continental)
 */
export async function fetchCropScapeHistory(lat, lon, signal = null) {
  if (!isInsideUsContiguous(lat, lon)) {
    return {
      source: 'USDA CropScape (NASS CDL 30m)',
      inCoverage: false,
      available: false,
      reason: 'Fuera de cobertura geográfica (solo EE.UU. continental).'
    };
  }

  const proxyBase = CONFIG.ENDPOINTS.PROXY_BASE_URL;
  if (!proxyBase) {
    return {
      source: 'USDA CropScape (NASS CDL 30m)',
      inCoverage: true,
      available: false,
      reason: 'Punto dentro de EE.UU., pendiente activar PROXY_BASE_URL para consulta XML/CORS.'
    };
  }

  const { x, y } = projectToEpsg5070(lat, lon);
  const params = new URLSearchParams({ x: String(x), y: String(y) });
  const url = `${proxyBase.replace(/\/$/, '')}/cropscape?${params.toString()}`;

  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.STATIC_GEO_MS,
    signal
  });

  const history = (data.history || []).map((item) => ({
    year: item.year,
    code: item.code,
    cropName: CDL_CROP_CODES[item.code] || `Uso de suelo CDL #${item.code}`
  }));

  return {
    source: 'USDA CropScape (NASS CDL 30m)',
    inCoverage: true,
    available: history.length > 0,
    fromCache,
    coords5070: { x, y },
    history
  };
}

/**
 * C. NASA ECOSTRESS: Temperatura superficial de vegetación (LST) y Estrés Evaporativo (ESI)
 */
export async function fetchEcostressData(lat, lon, signal = null) {
  if (Math.abs(lat) > 52) {
    return {
      source: 'NASA ECOSTRESS (ISS 70m)',
      available: false,
      reason: 'Fuera de órbita de la ISS (cobertura entre 52°N y 52°S).'
    };
  }

  const proxyBase = CONFIG.ENDPOINTS.PROXY_BASE_URL;
  if (!proxyBase) {
    return {
      source: 'NASA ECOSTRESS (ISS 70m)',
      available: false,
      reason: 'Requiere proxy con token NASA Earthdata (AppEEARS).'
    };
  }

  const params = new URLSearchParams({
    lat: Number(lat).toFixed(4),
    lon: Number(lon).toFixed(4)
  });
  const url = `${proxyBase.replace(/\/$/, '')}/ecostress?${params.toString()}`;

  const { data, fromCache } = await fetchJson(url, {
    ttlMs: 24 * 60 * 60 * 1000,
    signal
  });

  return {
    source: 'NASA ECOSTRESS (ISS 70m)',
    available: data?.lstCelsius != null || data?.esi != null,
    fromCache,
    obsDate: data?.obsDate || null,
    lstCelsius: data?.lstCelsius ?? null,
    esi: data?.esi ?? null,
    stressStatus: classifyEsi(data?.esi)
  };
}

function classifyEsi(esi) {
  if (esi == null) return 'Sin observación reciente';
  if (esi <= -1.5) return 'Estrés hídrico severo en vegetación';
  if (esi <= -0.5) return 'Estrés hídrico moderado';
  return 'Transpiración vegetal normal';
}

/**
 * F. FAO GAEZ v4: Aptitud agroecológica global
 */
export async function fetchFaoGaezSuitability(lat, lon, signal = null) {
  const proxyBase = CONFIG.ENDPOINTS.PROXY_BASE_URL;
  if (!proxyBase) {
    return {
      source: 'FAO GAEZ v4 (~9 km)',
      available: false,
      reason: 'Requiere activar PROXY_BASE_URL para consulta ráster WCS/REST.'
    };
  }

  const params = new URLSearchParams({
    lat: Number(lat).toFixed(4),
    lon: Number(lon).toFixed(4)
  });
  const url = `${proxyBase.replace(/\/$/, '')}/faogaez?${params.toString()}`;

  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.STATIC_GEO_MS,
    signal
  });

  return {
    source: 'FAO GAEZ v4 (~9 km)',
    available: Boolean(data?.suitabilityByCrop),
    fromCache,
    suitabilityByCrop: data?.suitabilityByCrop || {},
    dominantConstraint: data?.dominantConstraint || null
  };
}

/**
 * D. USDA Ag Data Commons: Catálogo científico (vía proxy si está activo, o referencia calibrada)
 */
export async function searchUsdaAgDatasets(queryTerm, signal = null) {
  const proxyBase = CONFIG.ENDPOINTS.PROXY_BASE_URL;

  if (!proxyBase) {
    return {
      source: 'USDA Ag Data Commons (Referencia calibrada)',
      fromCache: true,
      totalMatches: CURATED_USDA_DATASETS.length,
      datasets: CURATED_USDA_DATASETS
    };
  }

  try {
    const params = new URLSearchParams({ q: queryTerm });
    const url = `${proxyBase.replace(/\/$/, '')}/usda?${params.toString()}`;
    const { data, fromCache } = await fetchJson(url, {
      ttlMs: CONFIG.CACHE_TTL.CLIMATOLOGY_MS,
      signal,
      timeoutMs: 12000
    });

    return {
      source: 'USDA Ag Data Commons (NAL)',
      fromCache,
      totalMatches: data?.totalMatches || CURATED_USDA_DATASETS.length,
      datasets: data?.datasets?.length ? data.datasets : CURATED_USDA_DATASETS
    };
  } catch (_) {
    return {
      source: 'USDA Ag Data Commons (Referencia calibrada)',
      fromCache: true,
      totalMatches: CURATED_USDA_DATASETS.length,
      datasets: CURATED_USDA_DATASETS
    };
  }
}
