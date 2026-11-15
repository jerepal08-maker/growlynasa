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
