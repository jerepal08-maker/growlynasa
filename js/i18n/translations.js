const STORAGE_KEY = 'agroguia.lang';

export const MONTH_NAMES_I18N = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
};

export const CROP_NAMES_I18N = {
  wheat: { en: 'Wheat', es: 'Trigo' },
  corn: { en: 'Corn (Maize)', es: 'Maíz' },
  soybean: { en: 'Soybean', es: 'Soja' },
  tomato: { en: 'Tomato', es: 'Tomate' },
  lettuce: { en: 'Lettuce', es: 'Lechuga' },
  potato: { en: 'Potato', es: 'Papa' },
  sunflower: { en: 'Sunflower', es: 'Girasol' },
  peanut: { en: 'Peanut', es: 'Maní' }
};

const TEXTURE_I18N = {
  franco: { en: 'Loam', es: 'Franco' },
  'franco-arenoso': { en: 'Sandy loam', es: 'Franco-arenoso' },
  arenoso: { en: 'Sandy', es: 'Arenoso' },
  arcilloso: { en: 'Clay', es: 'Arcilloso' }
};

const WATER_I18N = {
  riego: { en: 'Irrigated', es: 'Con riego' },
  secano: { en: 'Rainfed (dryland)', es: 'Solo lluvia (secano)' },
  escasa: { en: 'Scarce water', es: 'Agua escasa' }
};

const DICT = {
  en: {
    appTitle: 'AgroGuía · Agricultural Intelligence',
    navDash: '📊 Unified Dashboard',
    navLoc: '📍 Location & Map',
    navPlots: '🧪 Soil & Plot',
    heroSubtitle: 'Unified agroclimatic, satellite, and soil intelligence platform.',
    heroChangeLoc: '📍 Change location',
    heroEditSoil: '🧪 Configure soil',
    quickAlerts: '⚠️ Alerts & Climate',
    quickGauss: '📈 Gaussian Curves & Annual Climate',
    quickCrops: '🌾 Crops, Calendar & Irrigation',

    // Location view
    locTitle: 'Geographic Location',
    searchPlaceholder: 'Search city, town, or region…',
    btnSearch: 'Search',
    btnGps: 'Use my location',
    presetDefault: 'Reference region…',
    btnConsult: 'Analyze',
    mapHint: 'Click anywhere on the map to select the exact analysis point.',
    searching: 'Searching…',
    noResults: 'No results found.',
    searchError: 'Search error',
    geoUnsupported: 'Your browser does not support geolocation.',
    geoDenied: 'Location permission was denied.',
    myLocation: 'My location',
    invalidCoords: 'Invalid coordinates.',

    // Soil & Plot view
    plotsTitle: 'Terrain & Soil Characteristics',
    linkedLocation: '📍 Linked location:',
    plotsIntro: 'All fields below are optional. If a parameter is unknown, satellite estimates will be used or crops will be evaluated with available variables.',
    btnChangeOnMap: 'Change on map',
    optTag: '(optional)',
    lblPlotName: 'Plot identifier',
    phPlotName: 'e.g., North Field (auto if empty)',
    lblArea: 'Area (ha)',
    phArea: 'e.g., 25',
    lblSoilTex: 'Soil texture',
    optUnknownSoil: 'Unknown (auto-estimate)',
    texLoam: 'Loam',
    texSandyLoam: 'Sandy loam',
    texSandy: 'Sandy',
    texClay: 'Clay',
    lblPh: 'Soil pH',
    phPh: 'e.g., 6.5',
    lblOm: 'Organic matter (%)',
    phOm: 'e.g., 2.8',
    lblMoist: 'Soil moisture (%)',
    phMoist: 'e.g., 22',
    lblWater: 'Water availability',
    optUnspecified: 'Not specified',
    waterIrrigated: 'Irrigated',
    waterRainfed: 'Rainfed (rain only)',
    waterScarce: 'Scarce water',
    lblPrevCrops: 'Previous crops',
    phPrevCrops: 'e.g., Corn, Soybean',
    btnSavePlot: 'Save configuration',

    // Soil profile resolver & badges
    badgeMeasured: 'Measured',
    badgeEstimated: 'External estimate',
    badgeMissing: 'Missing',
    srcUserMeasured: 'Measured / declared by user',
    srcSoilGrids: 'Estimated (ISRIC SoilGrids 250m)',
    srcSmapRoot: 'Satellite estimate (NASA SMAP root zone)',
    srcOpenMeteoSoil: 'Modeled estimate (Open-Meteo 3–9 cm)',
    srcCropScape: 'Satellite-detected (USDA CropScape 30m)',
    srcNoData: 'No data',
    srcNoHistory: 'No crop history available',
    srcWaterDefault: 'Not specified (evaluated via rainfall & SMAP)',
    defaultPlotName: 'No saved plot (using location satellite data)',
    effectiveProfileTitle: 'Effective Profile Used for Recommendations ({pct}% complete)',
    activeOrigin: 'Active source:',
    fieldTexture: 'Soil texture',
    fieldPh: 'Soil pH',
    fieldOm: 'Organic matter',
    fieldMoisture: 'Soil moisture',
    fieldPrevCrop: 'Previous crops',
    fieldWater: 'Water availability',
    notAvailable: 'Not available',
    notSpecified: 'Not specified',
    missingImpactHeader: '⚠️ How missing data affects accuracy:',
    profileCompleteMsg: '✔ Complete profile: all soil variables are covered.',
    savedProfilesEmpty: 'No custom profiles saved yet; the system is automatically using satellite and map data.',
    btnUseProfile: 'Use this profile',
    btnActiveProfile: '✔ Active',
    btnDelete: 'Delete',
    impactTexture: 'Cannot evaluate water retention, drainage, or root waterlogging risk.',
    impactPh: 'Cannot detect nutrient lockup from alkalinity or acidity toxicity.',
    impactOm: 'Natural soil fertility and structural aggregate stability remain unknown.',
    impactMoisture: 'Water evaluation relies exclusively on rainfall forecasts and ET0.',
    impactPrevCrop: 'Cannot evaluate crop rotation or residue pest/disease carryover.',
    impactWater: 'Assumes rainfed conditions, which may penalize high-water crops if irrigation is available.',

    // Dashboard blocks
    loadingData: 'Synchronizing meteorological, climatic, satellite, and topographic data…',
    weatherFetchError: 'Could not retrieve weather data ({msg}). Check your connection and try again.',
    unexpectedError: 'Unexpected error',
    noWeatherData: 'No meteorological data available for this location.',
    hemisphereNorth: 'Northern Hemisphere',
    hemisphereSouth: 'Southern Hemisphere',
    altitudeSrtm: 'Altitude (SRTM)',
    slopeLabel: 'Slope',
    activeProfileShort: 'Active profile',
    completeShort: 'complete',
    updatedAt: 'Updated',
    localCache: 'Local cache',
    noData: 'no data',

    blkAlertsTitle: '⚠️ Active Alerts & Agroclimatic Monitoring',
    blkAlertsSub: 'Distinguishing current observations, satellite estimates, and historical baselines',
    domAtmosphere: '🌡️ Atmosphere (2m) & Land / Canopy Surface',
    domHydrology: '💧 Water Balance & Soil Moisture (GPM + SMAP)',
    domPhysics: '☀️ Agroclimatic Physics: Light, Frost & Freeze–Thaw',

    kpiAirTemp: 'Current air temp (2m)',
    kpiAirTempSub: 'Open-Meteo observation',
    kpiSkinTemp: 'Surface skin temp',
    kpiSkinTempSub: 'NASA POWER TS (ground/surface)',
    kpiEcostress: 'NASA ECOSTRESS (70m)',
    kpiNoProxy: 'Proxy inactive',
    kpiRadWind: 'Solar radiation & Wind',
    kpiDirection: 'Direction',
    kpiRain7dRh: '7d Rain / Air humidity',
    kpiLastHour: 'Last hour',
    kpiAnnualRain: 'Annual rain (NASA GPM)',
    kpiLast30d: 'Last 30d',
    kpiDrySpell: 'Dry spell',
    kpiSoilMoisture: 'Soil moisture (SMAP)',
    kpiRootZone: 'Root',
    kpiSurface: 'Surf',
    kpiTrend: 'Trend',
    kpiEt0: 'Evapotranspiration (ET0)',
    kpi7dSum: '7d total',
    kpiDaylight: 'Daylight hours (Photoperiod)',
    kpiAnnualRange: 'Annual range',
    kpiFrostRisk: 'Frost risk',
    kpiLevel: 'Level',
    kpiHistorical: 'Historical',
    kpiPeak: 'Peak',
    kpiFreezeThaw: 'Freeze / Thaw cycles',
    kpiCyclesYr: 'cycles/yr',
    kpiSubZeroDays: 'Days <0°C',
    kpiMaxSpell: 'Max streak',
    kpiLandUse: 'Land use (USDA)',
    kpiInUs: 'Inside US',
    kpiOutsideUs: 'Outside US',

    // Charts & Gaussian
    blkGaussTitle: '📈 Annual Climate Behavior & Thermal Distribution (Gaussian Curve)',
    gaussianViewLabel: 'Gaussian view:',
    optGaussAll: 'Min, Mean & Max Temp (10 yrs)',
    optGaussPeriods: 'Compare periods (First 5 yrs vs. Last 5 yrs)',
    optGaussSeasonal: 'Seasonal contrast (Warm vs. Cold half-year)',
    gaussNote: 'Statistical note: Continuous air temperature follows a Normal (Gaussian) distribution, revealing mean (μ), thermal dispersion (σ), and extreme tails against the empirical {days}-day histogram ({source}). For skewed precipitation with zero-rain days, monthly totals are plotted below.',
    era5Unavailable: 'ERA5 historical series unavailable to render Gaussian curves.',
    chartGaussTitle: 'Gaussian Thermal Distribution (Bell Curve)',
    chartObservedHist: 'Observed Tmean frequency (ERA5)',
    chartTempAxis: 'Temperature (°C)',
    chartDensityAxis: 'Probability density f(T)',
    chartHydroTitle: 'Annual Water Regime (Monthly Rainfall vs. Evapotranspiration ET0)',
    chartRainEra5: 'Mean monthly rainfall (ERA5 10yr, mm)',
    chartRainNasa: 'Monthly rainfall (NASA POWER, mm)',
    chartEt0Line: 'Atmospheric demand ET0 (mm/month)',
    chartMmAxis: 'Millimeters (mm / month)',
    chartPhysicsTitle: 'Annual Photoperiod vs. Monthly Frost & Freeze–Thaw Risk',
    chartDaylightLine: 'Daylight hours (Photoperiod, h/day)',
    chartFrostBars: 'Frost days (Tmin ≤ 0°C)',
    chartFreezeThawBars: 'Freeze–thaw cycles',
    chartLightAxis: 'Daylight hours (h)',
    chartDaysAxis: 'Avg days / month',
    statMean: 'Mean μ',
    statStd: 'Dispersion σ',
    statRange68: '68% range',
    statExtremes: 'Extremes',

    // Crops & Recommendations
    blkCropsTitle: '🌾 Recommended Crops, Calendar & Irrigation (Weighted Evaluation)',
    irrStageLabel: 'Phenological stage for irrigation:',
    stageInitial: 'Initial (Kc × 0.40)',
    stageDev: 'Development (Kc × 0.75)',
    stageMid: 'Mid-season / Flowering (Kc × 1.00)',
    stageLate: 'Late / Ripening (Kc × 0.70)',
    weightsSummary: 'Physiological weights: Water 30% · Thermal & Frost 30% · Soil 20% · Topography, Light & Rotation 20%. Includes calendar for',
    calLegendS: 'Sowing',
    calLegendG: 'Growth',
    calLegendH: 'Harvest',
    calCodeG: 'G',
    classFavorable: 'Favorable conditions',
    classModerate: 'Moderately favorable conditions',
    classLimiting: 'Limiting conditions',
    classUnfavorable: 'Unfavorable conditions',
    liebigCapNote: '⚠ Capped by a critical physiological limiting factor (Liebig’s Law).',
    advantagesTitle: '✔ Key advantages:',
    limitingTitle: '⚠ Limiting factors:',
    irr7dTitle: '💧 7-day irrigation:',
    auditSummary: 'View full scoring audit ({count} criteria evaluated)',
    weightWord: 'Weight',
    scoreWord: 'Score',

    footerText: 'Data: Open-Meteo (Forecast / Copernicus ERA5 / NASA SRTM) · NASA POWER (GPM / SMAP) · ISRIC SoilGrids · USDA · OpenStreetMap. Advisory information only; yields are not guaranteed.'
  },

  es: {
    appTitle: 'AgroGuía · Inteligencia Agrícola',
    navDash: '📊 Panel Unificado',
    navLoc: '📍 Ubicación y Mapa',
    navPlots: '🧪 Suelo y Lote',
    heroSubtitle: 'Plataforma unificada de inteligencia agroclimática, satelital y edáfica.',
    heroChangeLoc: '📍 Cambiar ubicación',
    heroEditSoil: '🧪 Configurar suelo',
    quickAlerts: '⚠️ Alertas y Clima',
    quickGauss: '📈 Curvas de Gauss y Clima Anual',
    quickCrops: '🌾 Cultivos, Calendario y Riego',

    // Location view
    locTitle: 'Ubicación geográfica',
    searchPlaceholder: 'Buscar localidad o región…',
    btnSearch: 'Buscar',
    btnGps: 'Usar mi ubicación',
    presetDefault: 'Región de referencia…',
    btnConsult: 'Consultar',
    mapHint: 'Hacé clic en el mapa para elegir el punto exacto de análisis.',
    searching: 'Buscando…',
    noResults: 'Sin resultados.',
    searchError: 'Error de búsqueda',
    geoUnsupported: 'Tu navegador no soporta geolocalización.',
    geoDenied: 'No se concedió el permiso de ubicación.',
    myLocation: 'Mi ubicación',
    invalidCoords: 'Coordenadas inválidas.',

    // Soil & Plot view
    plotsTitle: 'Características del terreno y suelo',
    linkedLocation: '📍 Ubicación vinculada:',
    plotsIntro: 'Todos los campos abajo son opcionales. Si no conocés un dato, usaremos estimaciones satelitales o evaluaremos con las variables disponibles.',
    btnChangeOnMap: 'Cambiar en mapa',
    optTag: '(opcional)',
    lblPlotName: 'Identificador del lote',
    phPlotName: 'Ej: Lote Norte (auto si vacío)',
    lblArea: 'Superficie (ha)',
    phArea: 'Ej: 25',
    lblSoilTex: 'Textura del suelo',
    optUnknownSoil: 'No lo sé (auto-estimar)',
    texLoam: 'Franco',
    texSandyLoam: 'Franco-arenoso',
    texSandy: 'Arenoso',
    texClay: 'Arcilloso',
    lblPh: 'pH del suelo',
    phPh: 'Ej: 6.5',
    lblOm: 'Materia orgánica (%)',
    phOm: 'Ej: 2.8',
    lblMoist: 'Humedad del suelo (%)',
    phMoist: 'Ej: 22',
    lblWater: 'Disponibilidad hídrica',
    optUnspecified: 'No especificado',
    waterIrrigated: 'Con riego',
    waterRainfed: 'Solo lluvia (secano)',
    waterScarce: 'Agua escasa',
    lblPrevCrops: 'Cultivos anteriores',
    phPrevCrops: 'Ej: Maíz, Soja',
    btnSavePlot: 'Guardar configuración',

    // Soil profile resolver & badges
    badgeMeasured: 'Medido',
    badgeEstimated: 'Estimado externo',
    badgeMissing: 'Faltante',
    srcUserMeasured: 'Medido / declarado por usuario',
    srcSoilGrids: 'Estimado (ISRIC SoilGrids 250m)',
    srcSmapRoot: 'Estimado satelital (NASA SMAP zona radicular)',
    srcOpenMeteoSoil: 'Estimado modelado (Open-Meteo 3–9 cm)',
    srcCropScape: 'Detectado por satélite (USDA CropScape 30m)',
    srcNoData: 'Sin datos',
    srcNoHistory: 'Sin historial disponible',
    srcWaterDefault: 'No especificado (se evaluará según lluvias y SMAP)',
    defaultPlotName: 'Sin lote guardado (usando datos satelitales de la ubicación)',
    effectiveProfileTitle: 'Perfil efectivo utilizado para recomendaciones ({pct}% completo)',
    activeOrigin: 'Origen activo:',
    fieldTexture: 'Textura del suelo',
    fieldPh: 'pH del suelo',
    fieldOm: 'Materia orgánica',
    fieldMoisture: 'Humedad del suelo',
    fieldPrevCrop: 'Cultivos anteriores',
    fieldWater: 'Disponibilidad hídrica',
    notAvailable: 'No disponible',
    notSpecified: 'No especificado',
    missingImpactHeader: '⚠️ Cómo afectan los datos faltantes a la precisión:',
    profileCompleteMsg: '✔ Perfil completo: todas las variables edáficas están cubiertas.',
    savedProfilesEmpty: 'No guardaste perfiles personalizados aún; el sistema está usando automáticamente los datos satelitales y del mapa.',
    btnUseProfile: 'Usar este perfil',
    btnActiveProfile: '✔ Activo',
    btnDelete: 'Borrar',
    impactTexture: 'No es posible evaluar retención de agua, drenaje ni riesgo de anegamiento radicular.',
    impactPh: 'No se pueden detectar bloqueos de nutrientes por alcalinidad ni toxicidad por acidez.',
    impactOm: 'Se desconoce la fertilidad natural y la estabilidad estructural del suelo.',
    impactMoisture: 'La evaluación hídrica dependerá exclusivamente del pronóstico de lluvias y ET0.',
    impactPrevCrop: 'No se puede evaluar rotación de cultivos ni riesgo acumulado de plagas o enfermedades del rastrojo.',
    impactWater: 'Se asume condición de secano (dependiente de lluvia), lo que puede penalizar cultivos de alta demanda hídrica si tenés riego.',

    // Dashboard blocks
    loadingData: 'Sincronizando datos meteorológicos, climáticos, satelitales y topográficos…',
    weatherFetchError: 'No se pudo obtener el clima ({msg}). Verificá tu conexión e intentá de nuevo.',
    unexpectedError: 'Error inesperado',
    noWeatherData: 'Sin datos meteorológicos disponibles para esta ubicación.',
    hemisphereNorth: 'Hemisferio Norte',
    hemisphereSouth: 'Hemisferio Sur',
    altitudeSrtm: 'Altitud (SRTM)',
    slopeLabel: 'Pendiente',
    activeProfileShort: 'Perfil activo',
    completeShort: 'completo',
    updatedAt: 'Actualizado',
    localCache: 'Caché local',
    noData: 'sin datos',

    blkAlertsTitle: '⚠️ Alertas Activas y Monitoreo Agroclimático',
    blkAlertsSub: 'Diferenciando observaciones actuales, estimaciones satelitales e historial',
    domAtmosphere: '🌡️ Atmósfera (2m) y Superficie Terrestre / Dosel',
    domHydrology: '💧 Balance Hídrico y Humedad del Suelo (GPM + SMAP)',
    domPhysics: '☀️ Física Agroclimática: Luz, Heladas y Congelamiento',

    kpiAirTemp: 'Temp. aire actual (2m)',
    kpiAirTempSub: 'Observación Open-Meteo',
    kpiSkinTemp: 'Temp. superficial (Piel)',
    kpiSkinTempSub: 'NASA POWER TS (suelo/superficie)',
    kpiEcostress: 'NASA ECOSTRESS (70m)',
    kpiNoProxy: 'Sin proxy',
    kpiRadWind: 'Radiación solar y Viento',
    kpiDirection: 'Dirección',
    kpiRain7dRh: 'Lluvia 7d / Humedad aire',
    kpiLastHour: 'Última hora',
    kpiAnnualRain: 'Lluvia anual (NASA GPM)',
    kpiLast30d: 'Últimos 30d',
    kpiDrySpell: 'Racha seca',
    kpiSoilMoisture: 'Humedad suelo (SMAP)',
    kpiRootZone: 'Raíz',
    kpiSurface: 'Superf',
    kpiTrend: 'Tendencia',
    kpiEt0: 'Evapotranspiración (ET0)',
    kpi7dSum: 'Acumulado 7d',
    kpiDaylight: 'Horas de luz (Fotoperíodo)',
    kpiAnnualRange: 'Rango anual',
    kpiFrostRisk: 'Riesgo de heladas',
    kpiLevel: 'Nivel',
    kpiHistorical: 'Histórico',
    kpiPeak: 'Pico',
    kpiFreezeThaw: 'Congelación / Deshielo',
    kpiCyclesYr: 'ciclos/año',
    kpiSubZeroDays: 'Días <0°C',
    kpiMaxSpell: 'Máx racha',
    kpiLandUse: 'Uso del suelo (USDA)',
    kpiInUs: 'En EE.UU.',
    kpiOutsideUs: 'Fuera de EE.UU.',

    // Charts & Gaussian
    blkGaussTitle: '📈 Comportamiento Climático Anual y Distribución Térmica (Campana de Gauss)',
    gaussianViewLabel: 'Vista Gaussiana:',
    optGaussAll: 'T. Mínima, Media y Máxima (10 años)',
    optGaussPeriods: 'Comparar períodos (Primeros 5 años vs. Últimos 5 años)',
    optGaussSeasonal: 'Contraste estacional (Semestre cálido vs. frío)',
    gaussNote: 'Nota estadística: La temperatura continua sigue una distribución Normal (Campana de Gauss), permitiendo evaluar la media (μ), la dispersión térmica (σ) y las colas extremas frente al histograma real de {days} días ({source}). Para precipitaciones (asimétricas con ceros), se emplean acumulados mensuales abajo.',
    era5Unavailable: 'Serie histórica ERA5 no disponible para generar las curvas de Gauss.',
    chartGaussTitle: 'Distribución Térmica Gaussiana (Campana de Gauss)',
    chartObservedHist: 'Frecuencia observada Tmedia (ERA5)',
    chartTempAxis: 'Temperatura (°C)',
    chartDensityAxis: 'Densidad de probabilidad f(T)',
    chartHydroTitle: 'Régimen Hídrico Anual (Acumulados mensuales vs. Evapotranspiración ET0)',
    chartRainEra5: 'Precipitación media mensual (ERA5 10a, mm)',
    chartRainNasa: 'Precipitación mensual (NASA POWER, mm)',
    chartEt0Line: 'Demanda atmosférica ET0 (mm/mes)',
    chartMmAxis: 'Milímetros (mm / mes)',
    chartPhysicsTitle: 'Fotoperíodo Anual vs. Riesgo Mensual de Heladas y Congelación-Deshielo',
    chartDaylightLine: 'Horas de luz (Fotoperíodo, h/día)',
    chartFrostBars: 'Días con helada (Tmin ≤ 0°C)',
    chartFreezeThawBars: 'Ciclos congelación-deshielo',
    chartLightAxis: 'Horas de luz (h)',
    chartDaysAxis: 'Días promedio / mes',
    statMean: 'Media μ',
    statStd: 'Dispersión σ',
    statRange68: 'Rango 68%',
    statExtremes: 'Extremos',

    // Crops & Recommendations
    blkCropsTitle: '🌾 Cultivos Recomendados, Calendario y Riego (Evaluación Ponderada)',
    irrStageLabel: 'Etapa fenológica para riego:',
    stageInitial: 'Inicial (Kc × 0.40)',
    stageDev: 'Desarrollo (Kc × 0.75)',
    stageMid: 'Media / Floración (Kc × 1.00)',
    stageLate: 'Final / Maduración (Kc × 0.70)',
    weightsSummary: 'Ponderación fisiológica: Hídrico 30% · Térmico y Heladas 30% · Suelo 20% · Topografía, Luz y Rotación 20%. Incluye calendario',
    calLegendS: 'Siembra',
    calLegendG: 'Crecimiento',
    calLegendH: 'Cosecha',
    calCodeG: 'C',
    classFavorable: 'Condiciones favorables',
    classModerate: 'Condiciones moderadamente favorables',
    classLimiting: 'Condiciones limitantes',
    classUnfavorable: 'Condiciones desfavorables',
    liebigCapNote: '⚠ Limitado por factor crítico fisiológico (Ley de Liebig).',
    advantagesTitle: '✔ Ventajas:',
    limitingTitle: '⚠ Factores limitantes:',
    irr7dTitle: '💧 Riego 7 días:',
    auditSummary: 'Ver auditoría completa ({count} criterios evaluados)',
    weightWord: 'Peso',
    scoreWord: 'Nota',

    footerText: 'Datos: Open-Meteo (Forecast / Copernicus ERA5 / NASA SRTM) · NASA POWER (GPM / SMAP) · ISRIC SoilGrids · USDA · OpenStreetMap. Información orientativa; no garantiza rendimientos.'
  }
};

export function getLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'es' ? 'es' : 'en'; // Inglés por defecto
  } catch (_) {
    return 'en';
  }
}

export function setLang(lang) {
  const clean = lang === 'es' ? 'es' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, clean);
  } catch (_) {}
  applyStaticTranslations();
  return clean;
}

export function t(key, vars = {}) {
  const lang = getLang();
  let str = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

export function getMonthNames() {
  return MONTH_NAMES_I18N[getLang()] || MONTH_NAMES_I18N.en;
}

export function getCropName(crop) {
  const lang = getLang();
  return CROP_NAMES_I18N[crop.id]?.[lang] || crop.n;
}

export function translateTexture(val) {
  if (!val) return '';
  return TEXTURE_I18N[val]?.[getLang()] || val;
}

export function translateWater(val) {
  if (!val) return '';
  return WATER_I18N[val]?.[getLang()] || val;
}

export function applyStaticTranslations() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = t('appTitle');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });

  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.classList.toggle('on', btn.getAttribute('data-lang') === lang);
  });
}
