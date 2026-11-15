import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';

export async function fetchTopography(lat, lon, signal = null) {
  const centerLat = Number(lat);
  const centerLon = Number(lon);
  const deltaDeg = 0.001;

  const lats = [
    centerLat,
    Math.min(89.99, centerLat + deltaDeg),
    Math.max(-89.99, centerLat - deltaDeg),
    centerLat,
    centerLat
  ].map((v) => v.toFixed(5));

  const lons = [
    centerLon,
    centerLon,
    centerLon,
    centerLon + deltaDeg,
    centerLon - deltaDeg
  ].map((v) => v.toFixed(5));

  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(',')
  });

  const url = `${CONFIG.ENDPOINTS.OPEN_METEO_ELEVATION}?${params.toString()}`;
  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.STATIC_GEO_MS,
    signal
  });

  const elev = data?.elevation;
  if (!Array.isArray(elev) || elev.length < 5 || elev[0] == null) {
    return {
      source: 'NASA SRTM (90m)',
      isEstimated: true,
      fromCache,
      elevationMeters: null,
      slopePercent: null,
      slopeDegrees: null,
      terrainClass: 'Sin datos topográficos'
    };
  }

  const [zCenter, zNorth, zSouth, zEast, zWest] = elev;
  const latRad = (centerLat * Math.PI) / 180;
  const metersPerDegLat = 110574;
  const metersPerDegLon = 111320 * Math.max(0.1, Math.cos(latRad));

  const dzDy = (zNorth - zSouth) / (2 * deltaDeg * metersPerDegLat);
  const dzDx = (zEast - zWest) / (2 * deltaDeg * metersPerDegLon);

  const slopeRatio = Math.sqrt(dzDx * dzDx + dzDy * dzDy);
  const slopePercent = Number((slopeRatio * 100).toFixed(1));
  const slopeDegrees = Number(((Math.atan(slopeRatio) * 180) / Math.PI).toFixed(1));

  return {
    source: 'NASA SRTM (90m)',
    isEstimated: true,
    fromCache,
    elevationMeters: Math.round(zCenter),
    slopePercent,
    slopeDegrees,
    terrainClass: classifySlope(slopePercent)
  };
}

function classifySlope(pct) {
  if (pct < 2) return 'Llano';
  if (pct < 5) return 'Suavemente ondulado';
  if (pct < 12) return 'Moderadamente inclinado';
  return 'Escarpado';
}
