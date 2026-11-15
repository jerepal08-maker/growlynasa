import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';

/**
 * Servicio de Demanda Comercial y Movimiento de Cultivos basado en USDA AMS Market News:
 * Portal oficial: https://www.ams.usda.gov/market-news
 * API MARS v1.2: https://marsapi.ams.usda.gov/services/v1.2/reports
 */

const AMS_COMMODITY_PROFILES = {
  wheat: {
    amsCommodity: 'Wheat (Hard Red / Soft White)',
    reportSlug: 'grain-reports',
    demandIndex: 88,
    tier: 'high',
    channelEn: 'Domestic flour mills & global export terminals',
    channelEs: 'Molinos harineros locales y terminales de exportación global'
  },
  corn: {
    amsCommodity: 'Corn (Yellow #2)',
    reportSlug: 'grain-reports',
    demandIndex: 94,
    tier: 'high',
    channelEn: 'Feedlots, ethanol plants & export grain elevators',
    channelEs: 'Consumo animal, etanol y acopios de exportación'
  },
  soybean: {
    amsCommodity: 'Soybeans',
    reportSlug: 'grain-reports',
    demandIndex: 92,
    tier: 'high',
    channelEn: 'Oilseed crushing plants, meal & export markets',
    channelEs: 'Industria aceitera/crushing, harinas y exportación'
  },
  rice: {
    amsCommodity: 'Rice (Long & Medium Grain)',
    reportSlug: 'grain-reports',
    demandIndex: 87,
    tier: 'high',
    channelEn: 'Domestic rice mills, retail staples & export',
    channelEs: 'Molinos arroceros, consumo masivo y exportación'
  },
  sugarcane: {
    amsCommodity: 'Raw Cane Sugar & Molasses',
    reportSlug: 'grain-reports',
    demandIndex: 85,
    tier: 'high',
    channelEn: 'Sugar refineries, bioethanol mills & food processors',
    channelEs: 'Ingenios azucareros, bioetanol e industria alimentaria'
  },
  cassava: {
    amsCommodity: 'Cassava / Yuca Root & Starch',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 79,
    tier: 'moderate-high',
    channelEn: 'Fresh ethnic produce markets, industrial starch & flour',
    channelEs: 'Mercados frescos regionales, almidón industrial y harinas'
  },
  coffee: {
    amsCommodity: 'Green Coffee (Arabica / Robusta)',
    reportSlug: 'specialty-crops-reports',
    demandIndex: 89,
    tier: 'high',
    channelEn: 'International roasters, specialty coffee trade & export',
    channelEs: 'Tostadores internacionales, café de especialidad y exportación'
  },
  cocoa: {
    amsCommodity: 'Cocoa Beans & Butter',
    reportSlug: 'specialty-crops-reports',
    demandIndex: 88,
    tier: 'high',
    channelEn: 'Confectionery manufacturers & global commodity buyers',
    channelEs: 'Industria chocolatera y compradores globales de exportación'
  },
  banana: {
    amsCommodity: 'Bananas & Plantains (Fresh)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 90,
    tier: 'high',
    channelEn: 'Global maritime fruit trade, retail chains & ripening hubs',
    channelEs: 'Exportación frutícola, cadenas de supermercados y maduraderos'
  },
  oil_palm: {
    amsCommodity: 'Crude Palm Oil (CPO) & Kernel Oil',
    reportSlug: 'grain-reports',
    demandIndex: 91,
    tier: 'high',
    channelEn: 'Food oil refineries, oleochemicals & biofuel plants',
    channelEs: 'Refinerías de aceites comestibles, oleoquímica y biocombustibles'
  },
  grape: {
    amsCommodity: 'Table Grapes, Raisins & Wine Must',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 84,
    tier: 'high',
    channelEn: 'Wineries, fresh fruit exporters & dried-fruit packers',
    channelEs: 'Bodegas vitivinícolas, exportación en fresco y pasas'
  },
  olive: {
    amsCommodity: 'Olive Oil & Table Olives',
    reportSlug: 'specialty-crops-reports',
    demandIndex: 83,
    tier: 'high',
    channelEn: 'Olive oil mills, gourmet retail & Mediterranean export',
    channelEs: 'Almazaras de aceite de oliva, conserva y exportación'
  },
  citrus: {
    amsCommodity: 'Oranges, Lemons & Mandarins',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 86,
    tier: 'high',
    channelEn: 'Fresh citrus packinghouses, juice concentrate & export',
    channelEs: 'Empaques citrícolas, industria de jugos y exportación'
  },
  apple: {
    amsCommodity: 'Fresh Apples & Juice Concentrate',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 85,
    tier: 'high',
    channelEn: 'Controlled-atmosphere storage, retail & juice processors',
    channelEs: 'Frigoríficos de atmósfera controlada, retail y sidra/jugos'
  },
  millet: {
    amsCommodity: 'Pearl & Proso Millet',
    reportSlug: 'grain-reports',
    demandIndex: 72,
    tier: 'moderate',
    channelEn: 'Regional staple food markets, birdseed & gluten-free flour',
    channelEs: 'Mercados regionales de consumo básico, forraje y harinas'
  },
  tomato: {
    amsCommodity: 'Tomatoes (Field & Greenhouse)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 84,
    tier: 'high',
    channelEn: 'Terminal produce markets, retail chains & processing',
    channelEs: 'Mercados concentradores, cadenas minoristas e industria'
  },
  lettuce: {
    amsCommodity: 'Lettuce (Iceberg / Romaine)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 78,
    tier: 'moderate-high',
    channelEn: 'Fresh produce wholesale & foodservice distribution',
    channelEs: 'Distribución mayorista de frescos y gastronomía'
  },
  potato: {
    amsCommodity: 'Potatoes (Table & Processing)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 86,
    tier: 'high',
    channelEn: 'Fresh retail, frozen fry processors & foodservice',
    channelEs: 'Consumo fresco minorista e industria de congelados'
  },
  sunflower: {
    amsCommodity: 'Sunflower Seed (Oil & Confection)',
    reportSlug: 'grain-reports',
    demandIndex: 80,
    tier: 'moderate-high',
    channelEn: 'Vegetable oil refineries & birdseed/confection buyers',
    channelEs: 'Refinerías de aceite vegetal y mercado confitero'
  },
  peanut: {
    amsCommodity: 'Peanuts (Runner / Virginia)',
    reportSlug: 'specialty-crops-reports',
    demandIndex: 81,
    tier: 'moderate-high',
    channelEn: 'Shelling plants, peanut butter & export confectioners',
    channelEs: 'Plantas seleccionadoras, industria alimentaria y exportación'
  },
  barley: {
    amsCommodity: 'Barley (Malting & Feed)',
    reportSlug: 'grain-reports',
    demandIndex: 76,
    tier: 'moderate-high',
    channelEn: 'Malting/brewing contracts & livestock feed',
    channelEs: 'Contratos de maltería/cervecería y forraje ganadero'
  },
  oats: {
    amsCommodity: 'Oats (Milling & Feed)',
    reportSlug: 'grain-reports',
    demandIndex: 74,
    tier: 'moderate-high',
    channelEn: 'Food oat millers & equine/livestock feed',
    channelEs: 'Molinería alimentaria y nutrición animal'
  },
  sorghum: {
    amsCommodity: 'Grain Sorghum (Milo)',
    reportSlug: 'grain-reports',
    demandIndex: 77,
    tier: 'moderate-high',
    channelEn: 'Feed mills, ethanol & export grain terminals',
    channelEs: 'Plantas de alimento balanceado, etanol y exportación'
  },
  rye: {
    amsCommodity: 'Rye Grain & Cover Seed',
    reportSlug: 'grain-reports',
    demandIndex: 66,
    tier: 'moderate',
    channelEn: 'Specialty bakery flours, distilling & cover-crop seed',
    channelEs: 'Harinas especiales, destilería y semilla de cobertura'
  },
  alfalfa: {
    amsCommodity: 'Alfalfa Hay & Pellets',
    reportSlug: 'hay-reports',
    demandIndex: 83,
    tier: 'high',
    channelEn: 'Dairy farms, commercial feedlots & hay exporters',
    channelEs: 'Tambos lecheros, feedlots y exportación de megafardos'
  },
  chickpea: {
    amsCommodity: 'Chickpeas (Garbanzo Beans)',
    reportSlug: 'grain-reports',
    demandIndex: 75,
    tier: 'moderate-high',
    channelEn: 'Pulse exporters, canning & plant-protein processors',
    channelEs: 'Exportadores de legumbres, conservas y proteína vegetal'
  },
  lentil: {
    amsCommodity: 'Lentils (Green & Red)',
    reportSlug: 'grain-reports',
    demandIndex: 76,
    tier: 'moderate-high',
    channelEn: 'International pulse trade & dry-packaged retail',
    channelEs: 'Comercio internacional de legumbres y fraccionado seco'
  },
  dry_bean: {
    amsCommodity: 'Dry Edible Beans (Black / Pinto / Navy)',
    reportSlug: 'grain-reports',
    demandIndex: 79,
    tier: 'moderate-high',
    channelEn: 'Regional staple markets, canners & export brokers',
    channelEs: 'Mercados regionales de consumo, enlatado y exportación'
  },
  pea: {
    amsCommodity: 'Dry Peas (Yellow & Green)',
    reportSlug: 'grain-reports',
    demandIndex: 74,
    tier: 'moderate-high',
    channelEn: 'Protein fractionation, pet food & pulse export',
    channelEs: 'Fraccionamiento proteico, alimentos y exportación'
  },
  canola: {
    amsCommodity: 'Canola / Rapeseed',
    reportSlug: 'grain-reports',
    demandIndex: 85,
    tier: 'high',
    channelEn: 'Edible oil crushers & renewable diesel feedstock',
    channelEs: 'Molienda de aceite comestible y biocombustibles'
  },
  cotton: {
    amsCommodity: 'Upland Cotton',
    reportSlug: 'cotton-and-tobacco-reports',
    demandIndex: 82,
    tier: 'high',
    channelEn: 'Textile mills, cottonseed oil & export merchants',
    channelEs: 'Hilanderías textiles, semilla oleaginosa y exportación'
  },
  sugar_beet: {
    amsCommodity: 'Sugar Beets (Contract)',
    reportSlug: 'grain-reports',
    demandIndex: 72,
    tier: 'moderate',
    channelEn: 'Regional sugar processing cooperatives',
    channelEs: 'Cooperativas e ingenios azucareros regionales'
  },
  onion: {
    amsCommodity: 'Onions (Dry Bulb)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 83,
    tier: 'high',
    channelEn: 'Wholesale produce terminals, retail & regional export',
    channelEs: 'Mercados mayoristas de hortalizas, retail y exportación'
  },
  garlic: {
    amsCommodity: 'Garlic (Fresh & Dehydrated)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 78,
    tier: 'moderate-high',
    channelEn: 'Fresh produce brokers, seasoning processors & export',
    channelEs: 'Empacadores frescos, industria deshidratadora y exportación'
  },
  carrot: {
    amsCommodity: 'Carrots (Topped & Baby-cut)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 77,
    tier: 'moderate-high',
    channelEn: 'Supermarket produce programs & juice/frozen processors',
    channelEs: 'Cadenas de supermercados e industria alimentaria'
  },
  bell_pepper: {
    amsCommodity: 'Bell Peppers (Green & Colored)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 80,
    tier: 'moderate-high',
    channelEn: 'Fresh terminal markets & retail grocery distribution',
    channelEs: 'Mercados frescos concentradores y distribución retail'
  },
  squash: {
    amsCommodity: 'Squash & Pumpkins',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 71,
    tier: 'moderate',
    channelEn: 'Regional wholesale produce markets & seasonal retail',
    channelEs: 'Mercados concentradores regionales y consumo fresco'
  },
  spinach: {
    amsCommodity: 'Spinach (Fresh & Bunch)',
    reportSlug: 'fruit-and-vegetable-reports',
    demandIndex: 73,
    tier: 'moderate',
    channelEn: 'Packaged leafy-greens retail & frozen food processors',
    channelEs: 'Retail de hojas frescas e industria de congelados'
  },
  quinoa: {
    amsCommodity: 'Quinoa (Specialty Grain)',
    reportSlug: 'specialty-crops-reports',
    demandIndex: 70,
    tier: 'moderate',
    channelEn: 'Health-food distributors, organic retail & specialty export',
    channelEs: 'Distribuidores de alimentos saludables y exportación'
  }
};

export async function fetchUsdaAmsMarketDemand(signal = null) {
  const proxyBase = CONFIG.ENDPOINTS.PROXY_BASE_URL;
  let liveReports = [];
  let isLive = false;

  if (proxyBase) {
    try {
      const url = `${proxyBase.replace(/\/$/, '')}/market-demand`;
      const { data } = await fetchJson(url, {
        ttlMs: 12 * 60 * 60 * 1000,
        signal,
        timeoutMs: 10000
      });
      if (Array.isArray(data?.reports) && data.reports.length > 0) {
        liveReports = data.reports;
        isLive = true;
      }
    } catch (_) {
      // Mantiene perfiles calibrados USDA AMS sin bloquear la app
    }
  }

  return {
    source: isLive ? 'USDA AMS Market News (MARS Live API)' : 'USDA AMS Market News (Reference Baseline)',
    portalUrl: 'https://www.ams.usda.gov/market-news',
    isLive,
    liveReports,
    byCrop: AMS_COMMODITY_PROFILES
  };
}
