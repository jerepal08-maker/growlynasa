export const CONFIG = {
  ENDPOINTS: {
    OPEN_METEO_FORECAST: 'https://api.open-meteo.com/v1/forecast',
    OPEN_METEO_HISTORICAL: 'https://archive-api.open-meteo.com/v1/archive',
    OPEN_METEO_ELEVATION: 'https://api.open-meteo.com/v1/elevation',
    OPEN_METEO_GEOCODING: 'https://geocoding-api.open-meteo.com/v1/search',
    NASA_POWER_CLIMATOLOGY: 'https://power.larc.nasa.gov/api/temporal/climatology/point',
    NASA_POWER_DAILY: 'https://power.larc.nasa.gov/api/temporal/daily/point',
    ISRIC_SOILGRIDS: 'https://rest.isric.org/soilgrids/v2.0/properties/query',
    // Proxy serverless (Cloudflare Worker) que configuraremos en la Etapa 3C
    PROXY_BASE_URL: ''
  },
  OPEN_METEO_KEY: '',
  DEFAULT_LOC: {
    name: 'San Luis, Argentina',
    lat: -33.30,
    lon: -66.34
  },
  CACHE_TTL: {
    FORECAST_MS: 30 * 60 * 1000,         // 30 minutos para pronóstico actual
    GEOCODING_MS: 24 * 60 * 60 * 1000,   // 24 horas para búsqueda de ciudades
    CLIMATOLOGY_MS: 7 * 24 * 60 * 60 * 1000, // 7 días para promedios históricos
    STATIC_GEO_MS: 30 * 24 * 60 * 60 * 1000  // 30 días para elevación y suelo
  }
};

export const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export const PRESET_REGIONS = {
  'San Luis, Argentina': [-33.30, -66.34],
  'Buenos Aires, Argentina': [-34.92, -57.95],
  'Córdoba, Argentina': [-31.42, -64.18],
  'Santa Fe, Argentina': [-31.63, -60.70],
  'Entre Ríos, Argentina': [-31.73, -60.53],
  'Mendoza, Argentina': [-32.89, -68.84],
  'San Juan, Argentina': [-31.54, -68.54],
  'La Pampa, Argentina': [-36.62, -64.29],
  'Tucumán, Argentina': [-26.82, -65.22],
  'Salta, Argentina': [-24.78, -65.41],
  'Chaco, Argentina': [-27.45, -58.99],
  'Misiones, Argentina': [-27.37, -55.90],
  'Neuquén, Argentina': [-38.95, -68.06],
  'Iowa (Corn Belt), USA': [41.88, -93.10],
  'Kansas (Wheat Belt), USA': [38.50, -98.00],
  'California (Central Valley), USA': [36.74, -119.78]
};
