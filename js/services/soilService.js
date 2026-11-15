import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';

export async function fetchSoilEstimate(lat, lon, signal = null) {
  const params = new URLSearchParams();
  params.set('lon', Number(lon).toFixed(4));
  params.set('lat', Number(lat).toFixed(4));
  ['phh2o', 'soc', 'clay', 'sand', 'silt'].forEach((prop) => params.append('property', prop));
  ['0-5cm', '5-15cm'].forEach((depth) => params.append('depth', depth));
  params.set('value', 'mean');

  const url = `${CONFIG.ENDPOINTS.ISRIC_SOILGRIDS}?${params.toString()}`;
  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.STATIC_GEO_MS,
    signal,
    timeoutMs: 15000
  });

  const layers = data?.properties?.layers || [];
  const getTop15Mean = (layerName) => {
    const layer = layers.find((l) => l.name === layerName);
    if (!layer || !Array.isArray(layer.depths)) return null;
    const factor = layer.unit_measure?.d_factor || 10;
    const vals = layer.depths
      .map((d) => d.values?.mean)
      .filter((v) => v != null)
      .map((v) => v / factor);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const ph = getTop15Mean('phh2o');
  const socGKg = getTop15Mean('soc'); // g/kg
  const clayGKg = getTop15Mean('clay');
  const sandGKg = getTop15Mean('sand');
  const siltGKg = getTop15Mean('silt');

  // Conversión agronómica: SOC (g/kg) -> SOC (%) -> Materia Orgánica (%) usando factor 1.724
  const organicMatterPct = socGKg != null ? Number(((socGKg / 10) * 1.724).toFixed(2)) : null;

  const clayPct = clayGKg != null ? Math.round(clayGKg / 10) : null;
  const sandPct = sandGKg != null ? Math.round(sandGKg / 10) : null;
  const siltPct = siltGKg != null ? Math.round(siltGKg / 10) : null;

  const textureClass = classifyUsdaTexture(clayPct, sandPct, siltPct);

  return {
    source: 'ISRIC SoilGrids v2.0 (250m)',
    isEstimated: true,
    fromCache,
    ph: ph != null ? Number(ph.toFixed(1)) : null,
    organicMatterPct,
    clayPct,
    sandPct,
    siltPct,
    textureClass
  };
}

function classifyUsdaTexture(clay, sand, silt) {
  if (clay == null || sand == null || silt == null) return null;
  if (clay >= 40) return 'arcilloso';
  if (sand >= 70 && clay < 15) return 'arenoso';
  if (sand >= 50 && clay < 20) return 'franco-arenoso';
  return 'franco';
}
