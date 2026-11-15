import { t } from '../i18n/translations.js';

export function resolveEffectivePlotProfile(userPlot, external = {}) {
  const { soilEst, nasaDaily, wx, cropScape } = external;

  // 1. Textura del suelo
  let soilTexture;
  if (userPlot?.soil) {
    soilTexture = { value: userPlot.soil, status: 'measured', sourceLabel: t('srcUserMeasured') };
  } else if (soilEst?.textureClass) {
    soilTexture = { value: soilEst.textureClass, status: 'estimated', sourceLabel: t('srcSoilGrids') };
  } else {
    soilTexture = { value: null, status: 'missing', sourceLabel: t('srcNoData') };
  }

  // 2. pH del suelo
  let ph;
  if (userPlot?.ph !== undefined && userPlot?.ph !== '' && userPlot?.ph !== null) {
    ph = { value: Number(userPlot.ph), status: 'measured', sourceLabel: t('srcUserMeasured') };
  } else if (soilEst?.ph != null) {
    ph = { value: Number(soilEst.ph), status: 'estimated', sourceLabel: t('srcSoilGrids') };
  } else {
    ph = { value: null, status: 'missing', sourceLabel: t('srcNoData') };
  }

  // 3. Materia orgánica (%)
  let organicMatter;
  if (userPlot?.om !== undefined && userPlot?.om !== '' && userPlot?.om !== null) {
    organicMatter = { value: Number(userPlot.om), status: 'measured', sourceLabel: t('srcUserMeasured') };
  } else if (soilEst?.organicMatterPct != null) {
    organicMatter = { value: Number(soilEst.organicMatterPct), status: 'estimated', sourceLabel: t('srcSoilGrids') };
  } else {
    organicMatter = { value: null, status: 'missing', sourceLabel: t('srcNoData') };
  }

  // 4. Humedad del suelo (%)
  let soilMoisture;
  if (userPlot?.moist !== undefined && userPlot?.moist !== '' && userPlot?.moist !== null) {
    soilMoisture = { value: Number(userPlot.moist), status: 'measured', sourceLabel: t('srcUserMeasured') };
  } else if (nasaDaily?.summary?.latestSoilRootPct != null) {
    soilMoisture = { value: Number(nasaDaily.summary.latestSoilRootPct), status: 'estimated', sourceLabel: t('srcSmapRoot') };
  } else if (wx?.soilMoisture != null) {
    soilMoisture = { value: Math.round(wx.soilMoisture * 100), status: 'estimated', sourceLabel: t('srcOpenMeteoSoil') };
  } else {
    soilMoisture = { value: null, status: 'missing', sourceLabel: t('srcNoData') };
  }

  // 5. Cultivos anteriores
  let previousCrop;
  if (userPlot?.prev && userPlot.prev.trim() !== '') {
    previousCrop = { value: userPlot.prev.trim(), status: 'measured', sourceLabel: t('srcUserMeasured') };
  } else if (cropScape?.available && Array.isArray(cropScape.history) && cropScape.history.length > 0) {
    const latest = cropScape.history[0];
    previousCrop = { value: `${latest.cropName} (${latest.year})`, status: 'estimated', sourceLabel: t('srcCropScape') };
  } else {
    previousCrop = { value: null, status: 'missing', sourceLabel: t('srcNoHistory') };
  }

  // 6. Disponibilidad hídrica
  let waterRegime;
  if (userPlot?.water && userPlot.water !== '') {
    waterRegime = { value: userPlot.water, status: 'measured', sourceLabel: t('srcUserMeasured') };
  } else {
    waterRegime = { value: null, status: 'missing', sourceLabel: t('srcWaterDefault') };
  }

  const fields = { soilTexture, ph, organicMatter, soilMoisture, previousCrop, waterRegime };
  const fieldList = Object.values(fields);
  const availableCount = fieldList.filter((f) => f.status !== 'missing').length;
  const completenessPct = Math.round((availableCount / fieldList.length) * 100);

  const missingImpactNotes = [];
  if (soilTexture.status === 'missing') missingImpactNotes.push({ field: t('fieldTexture'), impact: t('impactTexture') });
  if (ph.status === 'missing') missingImpactNotes.push({ field: t('fieldPh'), impact: t('impactPh') });
  if (organicMatter.status === 'missing') missingImpactNotes.push({ field: t('fieldOm'), impact: t('impactOm') });
  if (soilMoisture.status === 'missing') missingImpactNotes.push({ field: t('fieldMoisture'), impact: t('impactMoisture') });
  if (previousCrop.status === 'missing') missingImpactNotes.push({ field: t('fieldPrevCrop'), impact: t('impactPrevCrop') });
  if (waterRegime.status === 'missing') missingImpactNotes.push({ field: t('fieldWater'), impact: t('impactWater') });

  return {
    hasUserPlot: Boolean(userPlot),
    plotName: userPlot?.name || t('defaultPlotName'),
    areaHa: userPlot?.area ? Number(userPlot.area) : null,
    fields,
    completenessPct,
    missingImpactNotes
  };
}
