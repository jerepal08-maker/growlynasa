import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';
import { getLang } from '../i18n/translations.js';

const roundCoord = (val) => Number(val).toFixed(3);

export async function searchLocations(query, signal = null) {
  const params = new URLSearchParams({
    name: query,
    count: '6',
    language: getLang()
  });

  const url = `${CONFIG.ENDPOINTS.OPEN_METEO_GEOCODING}?${params.toString()}`;
  const { data } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.GEOCODING_MS,
    signal
  });

  return (data.results || []).map((place) => ({
    name: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    lat: place.latitude,
    lon: place.longitude
  }));
}

export async function fetchWeatherForecast(lat, lon, signal = null) {
  const params = new URLSearchParams({
    latitude: roundCoord(lat),
    longitude: roundCoord(lon),
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
    current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,shortwave_radiation',
    hourly: 'soil_moisture_3_to_9cm',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max,shortwave_radiation_sum'
  });

  if (CONFIG.OPEN_METEO_KEY) {
    params.set('apikey', CONFIG.OPEN_METEO_KEY);
  }

  const url = `${CONFIG.ENDPOINTS.OPEN_METEO_FORECAST}?${params.toString()}`;
  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.FORECAST_MS,
    signal
  });

  const current = data.current || {};
  const daily = data.daily || {};
  let soilMoisture = null;

  if (data.hourly && Array.isArray(data.hourly.soil_moisture_3_to_9cm)) {
    const idx = data.hourly.time.indexOf(current.time);
    soilMoisture = data.hourly.soil_moisture_3_to_9cm[idx >= 0 ? idx : 0];
  }

  return {
    source: 'Open-Meteo (Forecast)',
    isEstimated: false,
    fromCache,
    fetchedAt: new Date(),
    obsTime: current.time || null,
    soilMoisture,
    current: {
      temp: current.temperature_2m,
      rh: current.relative_humidity_2m,
      rain: current.precipitation,
      wind: current.wind_speed_10m,
      windDir: current.wind_direction_10m,
      radiation: current.shortwave_radiation
    },
    daily: (daily.time || []).map((date, i) => ({
      date,
      tmax: daily.temperature_2m_max[i],
      tmin: daily.temperature_2m_min[i],
      rain: daily.precipitation_sum[i] ?? 0,
      et0: daily.et0_fao_evapotranspiration[i] ?? 0,
      windMax: daily.wind_speed_10m_max[i] ?? 0,
      radiationSum: daily.shortwave_radiation_sum[i] ?? 0
    }))
  };
}

export async function fetchNasaClimatology(lat, lon, signal = null) {
  const params = new URLSearchParams({
    parameters: 'T2M,PRECTOTCORR',
    community: 'AG',
    latitude: roundCoord(lat),
    longitude: roundCoord(lon),
    format: 'JSON'
  });

  const url = `${CONFIG.ENDPOINTS.NASA_POWER_CLIMATOLOGY}?${params.toString()}`;
  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.CLIMATOLOGY_MS,
    signal
  });

  const p = data?.properties?.parameter || {};
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const extract = (key) => months.map((m) => paramsValue(p[key]?.[m]));

  return {
    source: 'NASA POWER (Climatology)',
    isHistorical: true,
    fromCache,
    t2m: extract('T2M'),
    rain: extract('PRECTOTCORR')
  };
}

function paramsValue(val) {
  return val === -999 || val === undefined ? null : val;
}
