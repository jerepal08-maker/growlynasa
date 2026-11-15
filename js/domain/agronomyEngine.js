import { CROPS } from './cropDatabase.js';
import { t, getLang, translateTexture } from '../i18n/translations.js';
export { CROPS };

const FROST_AIR_LIMITS = { sensible: 2, moderada: -1, tolerante: -6 };
const WATER_NEEDS_7D = { baja: 15, media: 25, alta: 40 };

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

export function getCropSowMonths(crop, lat) {
  return Number(lat) >= 0 ? crop.sowNorth : crop.sowSouth;
}

export function buildComprehensiveContext({
  lat, wx, era5, nasaDaily, topo, profile, ecostress, faoGaez, agroPhysics
}) {
  return {
    lat: Number(lat),
    hemisphere: Number(lat) >= 0 ? 'north' : 'south',
    month: new Date().getMonth() + 1,
    wx, era5, nasaDaily, topo, profile, ecostress, faoGaez, agroPhysics
  };
}

export function evaluateCropComprehensive(crop, ctx) {
  const isEn = getLang() === 'en';
  const criteria = [];
  const advantages = [];
  const limitingFactors = [];
  const missingVariables = [];
  let liebigCap = 100;

  const registerCriterion = ({ id, pillar, label, weight, score, detail, criticalCap = null }) => {
    if (score == null) {
      missingVariables.push(label);
      return;
    }
    const cleanScore = clamp(score);
    criteria.push({ id, pillar, label, weight, score: cleanScore, detail });

    if (cleanScore >= 75) advantages.push(`${label}: ${detail}`);
    else if (cleanScore < 50) limitingFactors.push(`${label}: ${detail}`);

    if (criticalCap != null && cleanScore <= 20) {
      liebigCap = Math.min(liebigCap, criticalCap);
    }
  };

  const sowMonths = getCropSowMonths(crop, ctx.lat);
  const startMonth = sowMonths.includes(ctx.month) ? ctx.month : sowMonths[0];
  const cycleMonthsCount = Math.max(2, Math.round(crop.cycle / 30));
  const cycleMonths = Array.from({ length: cycleMonthsCount }, (_, i) => ((startMonth - 1 + i) % 12) + 1);
  const era5Cycle = ctx.era5?.monthlySummary
    ? ctx.era5.monthlySummary.filter((m) => cycleMonths.includes(m.month))
    : [];

  // 1. Temperatura del ciclo (12%)
  const cycleTemp = era5Cycle.length
    ? avg(era5Cycle.map((m) => m.tmeanAvg).filter((v) => v != null))
    : ctx.wx?.daily?.length
    ? avg(ctx.wx.daily.map((d) => (d.tmax + d.tmin) / 2))
    : null;

  const lblCycleTemp = isEn ? 'Cycle temperature' : 'Temperatura del ciclo';
  if (cycleTemp != null) {
    const [tLo, tHi] = crop.topt;
    const tScore = cycleTemp >= tLo && cycleTemp <= tHi ? 100 : 100 - (cycleTemp < tLo ? tLo - cycleTemp : cycleTemp - tHi) * 11;
    const srcTag = era5Cycle.length
      ? (isEn ? 'ERA5 cycle climatology' : 'climatología ciclo ERA5')
      : (isEn ? '7d forecast' : 'pronóstico 7d');
    registerCriterion({
      id: 'cycleTemp', pillar: 'Thermal', label: lblCycleTemp, weight: 12, score: tScore,
      detail: isEn
        ? `${cycleTemp.toFixed(1)} °C (${srcTag}; optimal ${tLo}–${tHi} °C)`
        : `${cycleTemp.toFixed(1)} °C (${srcTag}; óptimo ${tLo}–${tHi} °C)`
    });
  } else {
    registerCriterion({ label: lblCycleTemp, score: null });
  }

  // 2. Riesgo de heladas (10%)
  const forecastTmin = ctx.wx?.daily?.length ? Math.min(...ctx.wx.daily.map((d) => d.tmin)) : null;
  const histFrostDaysCycle = era5Cycle.length ? era5Cycle.reduce((acc, m) => acc + (m.frostDaysAvg || 0), 0) : null;
  const lblFrost = isEn ? 'Frost risk' : 'Riesgo de heladas';

  if (forecastTmin != null || histFrostDaysCycle != null) {
    const airLimit = FROST_AIR_LIMITS[crop.frost];
    let fScore = 100;
    if (forecastTmin != null) {
      if (forecastTmin <= airLimit) fScore = 10;
      else if (forecastTmin <= airLimit + 3) fScore = 50;
    }
    if (histFrostDaysCycle != null && crop.frost === 'sensible') {
      if (histFrostDaysCycle > 6) fScore = Math.min(fScore, 15);
      else if (histFrostDaysCycle > 2) fScore = Math.min(fScore, 55);
    }
    const frostToleranceLabel = isEn
      ? ({ sensible: 'frost-sensitive', moderada: 'moderately tolerant', tolerante: 'frost-tolerant' }[crop.frost] || crop.frost)
      : `cultivo ${crop.frost}`;
    const histText = histFrostDaysCycle != null
      ? (isEn ? `; ${histFrostDaysCycle.toFixed(1)} frost days/cycle in ERA5` : `; ${histFrostDaysCycle.toFixed(1)} días helada/ciclo en ERA5`)
      : '';
    registerCriterion({
      id: 'frost', pillar: 'Thermal', label: lblFrost, weight: 10, score: fScore,
      detail: isEn
        ? `7d min ${forecastTmin != null ? forecastTmin.toFixed(1) + ' °C' : 'n/a'}${histText} (${frostToleranceLabel})`
        : `Mín. 7d ${forecastTmin != null ? forecastTmin.toFixed(1) + ' °C' : 's/d'}${histText} (${frostToleranceLabel})`,
      criticalCap: crop.frost === 'sensible' ? 30 : 45
    });
  } else {
    registerCriterion({ label: lblFrost, score: null });
  }

  // 3. Congelación y descongelamiento (4%)
  const lblFt = isEn ? 'Freeze–thaw cycles' : 'Ciclos congelación-deshielo';
  if (ctx.agroPhysics?.freezeThaw?.available) {
    const ftCycles = ctx.agroPhysics.freezeThaw.annualFreezeThawCycles;
    let ftScore = 100;
    if (crop.freezeThawSensitive && ftCycles > 25) ftScore = 35;
    else if (crop.freezeThawSensitive && ftCycles > 10) ftScore = 65;
    else if (ftCycles > 35) ftScore = 55;
    registerCriterion({
      id: 'freezeThaw', pillar: 'Thermal', label: lblFt, weight: 4, score: ftScore,
      detail: isEn
        ? `${ftCycles} cycles/yr (frost-heaving risk ${crop.freezeThawSensitive ? 'relevant' : 'low'})`
        : `${ftCycles} ciclos/año (riesgo de descalce radicular ${crop.freezeThawSensitive ? 'relevante' : 'bajo'})`
    });
  } else {
    registerCriterion({ label: lblFt, score: null });
  }

  // 4. Estrés térmico / superficie (4%)
  const forecastTmax = ctx.wx?.daily?.length ? Math.max(...ctx.wx.daily.map((d) => d.tmax)) : null;
  const surfaceTempVal = ctx.ecostress?.available && ctx.ecostress.lstCelsius != null
    ? ctx.ecostress.lstCelsius
    : ctx.nasaDaily?.summary?.latestSkinTemp ?? null;
  const lblHeat = isEn ? 'Heat & surface thermal stress' : 'Estrés térmico / superficie';

  if (forecastTmax != null || surfaceTempVal != null) {
    let heatScore = 100;
    if (forecastTmax != null) {
      if (forecastTmax > crop.tmax) heatScore = 15;
      else if (forecastTmax > crop.tmax - 3) heatScore = 60;
    }
    if (surfaceTempVal != null && surfaceTempVal > crop.tmax + 5) heatScore = Math.min(heatScore, 45);
    const surfNote = surfaceTempVal != null ? (isEn ? ` · Surface temp: ${surfaceTempVal} °C` : ` · Temp. superficie: ${surfaceTempVal} °C`) : '';
    registerCriterion({
      id: 'thermalStress', pillar: 'Thermal', label: lblHeat, weight: 4, score: heatScore,
      detail: isEn
        ? `7d max air ${forecastTmax != null ? forecastTmax.toFixed(1) + ' °C' : 'n/a'}${surfNote}`
        : `Máx. aire 7d ${forecastTmax != null ? forecastTmax.toFixed(1) + ' °C' : 's/d'}${surfNote}`,
      criticalCap: 40
    });
  } else {
    registerCriterion({ label: lblHeat, score: null });
  }

  // 5. Balance hídrico estacional (16%)
  const waterRegime = ctx.profile?.fields?.waterRegime?.value || null;
  const hasIrrigation = waterRegime === 'riego';
  const seasonalRainEra5 = era5Cycle.length ? era5Cycle.reduce((acc, m) => acc + (m.rainMonthlyAvg || 0), 0) : null;
  const annualRainGpm = ctx.nasaDaily?.summary?.annualRainMm ?? null;
  const rain7d = ctx.wx?.daily?.length ? ctx.wx.daily.reduce((acc, d) => acc + d.rain, 0) : null;
  const lblWater = isEn ? 'Seasonal water balance' : 'Balance hídrico estacional';

  if (hasIrrigation) {
    registerCriterion({
      id: 'waterBalance', pillar: 'Hydric', label: lblWater, weight: 16, score: 92,
      detail: isEn ? 'Supplementary irrigation declared on plot' : 'Terreno con riego suplementario declarado'
    });
  } else if (seasonalRainEra5 != null || annualRainGpm != null || rain7d != null) {
    let wScore = 70;
    const detailParts = [];
    if (seasonalRainEra5 != null) {
      wScore = clamp((seasonalRainEra5 / crop.seasonalRainMinMm) * 85);
      detailParts.push(isEn
        ? `ERA5 cycle rain: ${Math.round(seasonalRainEra5)} mm (req. ~${crop.seasonalRainMinMm} mm)`
        : `Lluvia ciclo ERA5: ${Math.round(seasonalRainEra5)} mm (req. ~${crop.seasonalRainMinMm} mm)`);
    } else if (annualRainGpm != null) {
      wScore = clamp((annualRainGpm / (crop.seasonalRainMinMm * 1.6)) * 85);
      detailParts.push(isEn ? `GPM annual rain: ${Math.round(annualRainGpm)} mm` : `Lluvia anual GPM: ${Math.round(annualRainGpm)} mm`);
    }
    if (rain7d != null) {
      detailParts.push(isEn ? `7d forecast: ${rain7d.toFixed(1)} mm` : `Pronóstico 7d: ${rain7d.toFixed(1)} mm`);
      if (seasonalRainEra5 == null) wScore = clamp(40 + (rain7d / WATER_NEEDS_7D[crop.water]) * 60);
    }
    if (waterRegime === 'escasa') {
      wScore = clamp(wScore * 0.55);
      detailParts.push(isEn ? 'Scarce water declared' : 'Agua escasa declarada');
    }
    registerCriterion({
      id: 'waterBalance', pillar: 'Hydric', label: lblWater, weight: 16, score: wScore,
      detail: detailParts.join(' · '),
      criticalCap: waterRegime === 'escasa' && crop.water === 'alta' ? 40 : null
    });
  } else {
    registerCriterion({ label: lblWater, score: null });
  }

  // 6. Humedad del suelo (8%)
  const soilMoistPct = ctx.profile?.fields?.soilMoisture?.value ?? null;
  const lblSm = isEn ? 'Soil moisture' : 'Humedad del suelo';
  if (soilMoistPct != null) {
    let smScore = 85;
    if (soilMoistPct < 12) smScore = hasIrrigation ? 75 : 30;
    else if (soilMoistPct < 20) smScore = 65;
    else if (soilMoistPct > 45 && !crop.soil.includes('arcilloso')) smScore = 55;
    registerCriterion({
      id: 'soilMoisture', pillar: 'Hydric', label: lblSm, weight: 8, score: smScore,
      detail: `${soilMoistPct}% (${ctx.profile.fields.soilMoisture.sourceLabel})`
    });
  } else {
    registerCriterion({ label: lblSm, score: null });
  }

  // 7. Estrés hídrico y humedad relativa (6%)
  const ambientRh = ctx.wx?.current?.rh ?? null;
  const drySpell = ctx.nasaDaily?.summary?.maxDrySpell90d ?? null;
  const esi = ctx.ecostress?.available ? ctx.ecostress.esi : null;
  const lblStress = isEn ? 'Hydric stress & air humidity' : 'Estrés hídrico y humedad relativa';

  if (ambientRh != null || drySpell != null || esi != null) {
    let stressScore = 85;
    const notes = [];
    if (esi != null) {
      stressScore = esi <= -1.5 ? 25 : esi <= -0.5 ? 60 : 95;
      notes.push(`ECOSTRESS ESI: ${esi}`);
    }
    if (drySpell != null) {
      if (drySpell >= 35 && !hasIrrigation && crop.water === 'alta') stressScore = Math.min(stressScore, 40);
      notes.push(isEn ? `Max 90d dry spell: ${drySpell} d` : `Racha seca máx 90d: ${drySpell} d`);
    }
    if (ambientRh != null) notes.push(isEn ? `Air RH: ${Math.round(ambientRh)}%` : `HR aire: ${Math.round(ambientRh)}%`);
    registerCriterion({
      id: 'hydricStress', pillar: 'Hydric', label: lblStress, weight: 6, score: stressScore,
      detail: notes.join(' · ')
    });
  } else {
    registerCriterion({ label: lblStress, score: null });
  }

  // 8. Textura del suelo (8%)
  const texture = ctx.profile?.fields?.soilTexture?.value ?? null;
  const lblTex = isEn ? 'Soil texture' : 'Textura del suelo';
  if (texture) {
    const isIdeal = crop.soil.includes(texture);
    const idealList = crop.soil.map((s) => translateTexture(s)).join(', ');
    registerCriterion({
      id: 'soilTexture', pillar: 'Soil', label: lblTex, weight: 8, score: isIdeal ? 100 : 50,
      detail: isEn ? `${translateTexture(texture)} (ideal: ${idealList})` : `${translateTexture(texture)} (ideal: ${idealList})`
    });
  } else {
    registerCriterion({ label: lblTex, score: null });
  }

  // 9. pH del suelo (7%)
  const phVal = ctx.profile?.fields?.ph?.value ?? null;
  const lblPh = isEn ? 'Soil pH' : 'pH del suelo';
  if (phVal != null) {
    const diff = phVal < crop.ph[0] ? crop.ph[0] - phVal : phVal > crop.ph[1] ? phVal - crop.ph[1] : 0;
    const phScore = diff === 0 ? 100 : diff <= 0.5 ? 70 : diff <= 1.0 ? 40 : 15;
    registerCriterion({
      id: 'soilPh', pillar: 'Soil', label: lblPh, weight: 7, score: phScore,
      detail: isEn ? `pH ${phVal} (optimal range ${crop.ph[0]}–${crop.ph[1]})` : `pH ${phVal} (rango óptimo ${crop.ph[0]}–${crop.ph[1]})`,
      criticalCap: 50
    });
  } else {
    registerCriterion({ label: lblPh, score: null });
  }

  // 10. Materia orgánica (5%)
  const omVal = ctx.profile?.fields?.organicMatter?.value ?? null;
  const lblOm = isEn ? 'Organic matter' : 'Materia orgánica';
  if (omVal != null) {
    const omScore = omVal >= crop.minOmPct ? 100 : clamp((omVal / crop.minOmPct) * 85);
    registerCriterion({
      id: 'organicMatter', pillar: 'Soil', label: lblOm, weight: 5, score: omScore,
      detail: isEn ? `${omVal}% (recommended ≥ ${crop.minOmPct}%)` : `${omVal}% (referencia recomendada ≥ ${crop.minOmPct}%)`
    });
  } else {
    registerCriterion({ label: lblOm, score: null });
  }

  // 11. Estacionalidad y ciclo (6%)
  const nearSow = sowMonths.some((s) => [1, 11].includes(Math.abs(s - ctx.month)));
  const sowScore = sowMonths.includes(ctx.month) ? 100 : nearSow ? 65 : 30;
  registerCriterion({
    id: 'seasonality', pillar: 'Environment',
    label: isEn ? 'Seasonality & cycle' : 'Estacionalidad y ciclo',
    weight: 6, score: sowScore,
    detail: isEn
      ? `${ctx.hemisphere === 'north' ? 'Northern' : 'Southern'} hemisphere sowing months: ${sowMonths.join(', ')} (${crop.cycle} d cycle)`
      : `Siembra hemisferio ${ctx.hemisphere === 'north' ? 'norte' : 'sur'}: meses ${sowMonths.join(', ')} (ciclo ${crop.cycle} d)`
  });

  // 12. Horas de luz / fotoperíodo (5%)
  const currentLight = ctx.agroPhysics?.photoperiod?.currentDaylightHours ?? null;
  const lblLight = isEn ? 'Daylight hours / photoperiod' : 'Horas de luz / fotoperíodo';
  if (currentLight != null) {
    const [dMin, dMax] = crop.daylightRange;
    const inRange = currentLight >= dMin && currentLight <= dMax;
    const lightScore = crop.photoperiodType === 'neutral' ? 95 : inRange ? 100 : 55;
    registerCriterion({
      id: 'photoperiod', pillar: 'Environment', label: lblLight, weight: 5, score: lightScore,
      detail: isEn
        ? `${currentLight} h daylight today (response: ${crop.photoperiodType}, range ${dMin}–${dMax} h)`
        : `${currentLight} h de luz hoy (respuesta: ${crop.photoperiodType}, rango ${dMin}–${dMax} h)`
    });
  } else {
    registerCriterion({ label: lblLight, score: null });
  }

  // 13. Altitud y pendiente (5%)
  const elev = ctx.topo?.elevationMeters ?? null;
  const slope = ctx.topo?.slopePercent ?? null;
  const lblTopo = isEn ? 'Altitude & slope (SRTM)' : 'Altitud y pendiente (SRTM)';
  if (elev != null || slope != null) {
    let topoScore = 100;
    const topoNotes = [];
    if (elev != null) {
      if (elev > crop.maxAltitudeM) topoScore = 15;
      else if (elev > crop.maxAltitudeM * 0.85) topoScore = 65;
      topoNotes.push(isEn ? `Altitude ${elev} m (max ${crop.maxAltitudeM} m)` : `Altitud ${elev} m (máx. ${crop.maxAltitudeM} m)`);
    }
    if (slope != null) {
      if (slope > crop.maxSlopePct * 1.8) topoScore = Math.min(topoScore, 15);
      else if (slope > crop.maxSlopePct) topoScore = Math.min(topoScore, 55);
      topoNotes.push(isEn ? `Slope ${slope}%` : `Pendiente ${slope}%`);
    }
    registerCriterion({
      id: 'topography', pillar: 'Environment', label: lblTopo, weight: 5, score: topoScore,
      detail: topoNotes.join(' · '), criticalCap: 35
    });
  } else {
    registerCriterion({ label: lblTopo, score: null });
  }

  // 14. Rotación y aptitud agroecológica (4%)
  const prevCropText = ctx.profile?.fields?.previousCrop?.value ?? null;
  const gaezCropScore = ctx.faoGaez?.available ? ctx.faoGaez.suitabilityByCrop?.[crop.id] : null;
  const lblRot = isEn ? 'Crop rotation & agroecological suitability' : 'Rotación y aptitud agroecológica';

  if (prevCropText || gaezCropScore != null) {
    let rotScore = 75;
    const rotNotes = [];
    if (prevCropText) {
      const rotEval = evaluateRotationCompatibility(crop, prevCropText, isEn);
      rotScore = rotEval.score;
      rotNotes.push(rotEval.note);
    }
    if (gaezCropScore != null) {
      rotScore = Math.round((rotScore + gaezCropScore) / 2);
      rotNotes.push(`FAO GAEZ: ${gaezCropScore}/100`);
    }
    registerCriterion({
      id: 'rotationGaez', pillar: 'Environment', label: lblRot, weight: 4, score: rotScore,
      detail: rotNotes.join(' · ')
    });
  } else {
    registerCriterion({ label: lblRot, score: null });
  }

  const totalAvailableWeight = criteria.reduce((acc, c) => acc + c.weight, 0);
  const weightedSum = criteria.reduce((acc, c) => acc + c.score * c.weight, 0);
  const rawWeightedScore = totalAvailableWeight > 0 ? Math.round(weightedSum / totalAvailableWeight) : 0;
  const finalScore = Math.min(rawWeightedScore, liebigCap);

  let classification;
  if (finalScore >= 75) classification = { label: t('classFavorable'), badge: 'ok' };
  else if (finalScore >= 55) classification = { label: t('classModerate'), badge: 'mid' };
  else if (finalScore >= 35) classification = { label: t('classLimiting'), badge: 'warn-orange' };
  else classification = { label: t('classUnfavorable'), badge: 'bad' };

  return {
    score: finalScore,
    rawWeightedScore,
    cappedByLiebig: liebigCap < 100 && finalScore === liebigCap,
    classification,
    criteria,
    advantages,
    limitingFactors,
    missingVariables,
    weightCoveragePct: Math.round((totalAvailableWeight / 100) * 100)
  };
}

function evaluateRotationCompatibility(candidateCrop, prevText, isEn) {
  const norm = prevText.toLowerCase();
  const sameCropAliases = {
    wheat: ['trigo', 'wheat'],
    corn: ['maiz', 'maíz', 'corn'],
    soybean: ['soja', 'soy'],
    tomato: ['tomate', 'tomato'],
    lettuce: ['lechuga', 'lettuce'],
    potato: ['papa', 'patata', 'potato'],
    sunflower: ['girasol', 'sunflower'],
    peanut: ['mani', 'maní', 'peanut']
  };

  const aliases = sameCropAliases[candidateCrop.id] || [candidateCrop.n.toLowerCase()];
  if (aliases.some((a) => norm.includes(a))) {
    return {
      score: 35,
      note: isEn
        ? `Monoculture detected (${prevText}): higher residue disease risk`
        : `Monocultivo detectado (${prevText}): mayor riesgo de enfermedades de rastrojo`
    };
  }

  const prevIsLegume = ['soja', 'soy', 'mani', 'maní', 'peanut', 'alfalfa', 'poroto'].some((l) => norm.includes(l));
  if (prevIsLegume && candidateCrop.family === 'Poaceae') {
    return {
      score: 100,
      note: isEn
        ? `Ideal rotation after legume (${prevText}): biological nitrogen contribution`
        : `Rotación ideal tras leguminosa (${prevText}): aporte biológico de nitrógeno`
    };
  }

  return {
    score: 80,
    note: isEn ? `Diversified rotation following ${prevText}` : `Rotación diversificada respecto a ${prevText}`
  };
}

export function generateAlerts(weather, agroPhysics = null) {
  const isEn = getLang() === 'en';
  const alerts = [];
  const d = weather.daily;
  const c = weather.current;
  const pushAlert = (level, title, text) => alerts.push({ l: level, t: title, x: text });

  const minTemp = Math.min(...d.map((z) => z.tmin));
  const maxTemp = Math.max(...d.map((z) => z.tmax));
  const totalRain = d.reduce((s, z) => s + z.rain, 0);
  const totalEt0 = d.reduce((s, z) => s + z.et0, 0);
  const maxDailyRain = Math.max(...d.map((z) => z.rain));
  const maxWind = Math.max(...d.map((z) => z.windMax));

  if (minTemp <= 0) {
    pushAlert('hi',
      isEn ? 'Meteorological frost' : 'Helada meteorológica',
      isEn ? `Forecast min of ${minTemp.toFixed(1)} °C at 2m air height over the next 7 days.` : `Mínima prevista de ${minTemp.toFixed(1)} °C en aire (2m) en los próximos 7 días.`
    );
  } else if (minTemp <= 3) {
    pushAlert('me',
      isEn ? 'Agronomic frost risk' : 'Riesgo de helada agronómica',
      isEn ? `Air min of ${minTemp.toFixed(1)} °C; ground surface may drop below 0 °C.` : `Mínima en aire de ${minTemp.toFixed(1)} °C; la superficie del suelo puede bajar de 0 °C.`
    );
  }

  if (maxTemp >= 35) {
    pushAlert('hi',
      isEn ? 'Extreme heat' : 'Temperatura extrema',
      isEn ? `Forecast max of ${maxTemp.toFixed(1)} °C.` : `Máxima prevista de ${maxTemp.toFixed(1)} °C.`
    );
  }

  if (maxDailyRain >= 30) {
    pushAlert('hi',
      isEn ? 'Heavy rainfall' : 'Precipitación intensa',
      isEn ? `Up to ${maxDailyRain.toFixed(0)} mm in a single day.` : `Hasta ${maxDailyRain.toFixed(0)} mm en un día.`
    );
  }

  if (maxWind >= 50) {
    pushAlert('hi',
      isEn ? 'Strong wind' : 'Viento fuerte',
      isEn ? `Daily peak wind speed of ${maxWind.toFixed(0)} km/h.` : `Máximo diario de ${maxWind.toFixed(0)} km/h.`
    );
  }

  if (totalRain < 5 && totalEt0 > 25) {
    pushAlert('me',
      isEn ? 'Drought risk' : 'Riesgo de sequía',
      isEn ? `7d rainfall ${totalRain.toFixed(1)} mm vs. evapotranspiration ${totalEt0.toFixed(1)} mm.` : `Lluvia 7 días ${totalRain.toFixed(1)} mm vs. evapotranspiración ${totalEt0.toFixed(1)} mm.`
    );
  }

  if (c.rh >= 85 && c.temp >= 15 && c.temp <= 25) {
    pushAlert('me',
      isEn ? 'Fungal disease favorable conditions' : 'Condiciones favorables a enfermedades fúngicas',
      isEn ? `Humidity ${c.rh}% and ${c.temp} °C (advisory indicator).` : `Humedad ${c.rh}% y ${c.temp} °C (indicador orientativo).`
    );
  }

  if (agroPhysics?.freezeThaw?.available && agroPhysics.freezeThaw.annualFreezeThawCycles >= 25) {
    pushAlert('me',
      isEn ? 'Frequent freeze–thaw cycles' : 'Ciclos frecuentes de congelación-descongelación',
      isEn
        ? `Historical average of ${agroPhysics.freezeThaw.annualFreezeThawCycles} cycles/yr: root frost-heaving caution in winter.`
        : `Promedio histórico de ${agroPhysics.freezeThaw.annualFreezeThawCycles} ciclos/año: precaución por descalce radicular en invierno.`
    );
  }

  return alerts.length
    ? alerts
    : [{
        l: 'lo',
        t: isEn ? 'No active alerts' : 'Sin alertas',
        x: isEn ? 'No weather or agroclimatic thresholds exceeded.' : 'No se detectan riesgos según los umbrales usados.'
      }];
}

export function calculateIrrigation(crop, weather, stageFactor) {
  const isEn = getLang() === 'en';
  const et0 = weather.daily.reduce((s, d) => s + d.et0, 0);
  const rain = weather.daily.reduce((s, d) => s + d.rain, 0);
  const etc = et0 * crop.kc * stageFactor;
  const balance = rain - etc;
  const soil = weather.soilMoisture;

  const why = isEn
    ? [
        `7d ET0: ${et0.toFixed(1)} mm; est. ETc (kc ${(crop.kc * stageFactor).toFixed(2)}): ${etc.toFixed(1)} mm.`,
        `Forecast rain: ${rain.toFixed(1)} mm. Balance: ${balance.toFixed(1)} mm.`
      ]
    : [
        `ET0 7 días: ${et0.toFixed(1)} mm; ETc estimada (kc ${(crop.kc * stageFactor).toFixed(2)}): ${etc.toFixed(1)} mm.`,
        `Lluvia prevista: ${rain.toFixed(1)} mm. Balance: ${balance.toFixed(1)} mm.`
      ];

  if (soil != null) {
    why.push(isEn ? `Est. soil moisture (3–9 cm): ${(soil * 100).toFixed(0)} % vol.` : `Humedad de suelo estimada (3–9 cm): ${(soil * 100).toFixed(0)} % vol.`);
  }

  let level, text;
  if (balance >= 0 && (soil == null || soil > 0.2)) {
    level = 'ok';
    text = isEn ? 'Forecast rainfall covers demand; irrigation unlikely needed.' : 'La lluvia prevista cubriría la demanda; no parece necesario regar.';
  } else if (balance < -10 || (soil != null && soil < 0.12)) {
    level = 'bad';
    text = isEn ? 'Marked water deficit: plan irrigation in the coming days.' : 'Déficit hídrico marcado: conviene planificar riego en los próximos días.';
  } else {
    level = 'mid';
    text = isEn ? 'Moderate deficit: monitor soil moisture and irrigate if dry.' : 'Déficit moderado: monitoreá la humedad del suelo y considerá regar si no llueve.';
  }

  return { l: level, t: text, why };
}
