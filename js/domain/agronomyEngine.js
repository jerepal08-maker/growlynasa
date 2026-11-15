import { CROPS } from './cropDatabase.js';
export { CROPS };

const FROST_AIR_LIMITS = { sensible: 2, moderada: -1, tolerante: -6 };
const WATER_NEEDS_7D = { baja: 15, media: 25, alta: 40 };

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

/**
 * Devuelve los meses de siembra según el hemisferio de la coordenada seleccionada
 */
export function getCropSowMonths(crop, lat) {
  return Number(lat) >= 0 ? crop.sowNorth : crop.sowSouth;
}

/**
 * Construye el contexto ambiental unificado combinando todas las fuentes activas
 */
export function buildComprehensiveContext({
  lat,
  wx,
  era5,
  nasaDaily,
  topo,
  profile,
  ecostress,
  faoGaez,
  agroPhysics
}) {
  return {
    lat: Number(lat),
    hemisphere: Number(lat) >= 0 ? 'north' : 'south',
    month: new Date().getMonth() + 1,
    wx,
    era5,
    nasaDaily,
    topo,
    profile,
    ecostress,
    faoGaez,
    agroPhysics
  };
}

/**
 * Motor de Recomendación Agrícola Multicriterio Ponderado
 * Evalúa hasta 16 variables reales/estimadas normalizando dinámicamente los pesos
 * cuando alguna fuente o dato de terreno no está disponible.
 */
export function evaluateCropComprehensive(crop, ctx) {
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

    if (cleanScore >= 75) {
      advantages.push(`${label}: ${detail}`);
    } else if (cleanScore < 50) {
      limitingFactors.push(`${label}: ${detail}`);
    }

    if (criticalCap != null && cleanScore <= 20) {
      liebigCap = Math.min(liebigCap, criticalCap);
    }
  };

  // Determinar ventana de meses del ciclo del cultivo según hemisferio
  const sowMonths = getCropSowMonths(crop, ctx.lat);
  const startMonth = sowMonths.includes(ctx.month) ? ctx.month : sowMonths[0];
  const cycleMonthsCount = Math.max(2, Math.round(crop.cycle / 30));
  const cycleMonths = Array.from({ length: cycleMonthsCount }, (_, i) => ((startMonth - 1 + i) % 12) + 1);

  const era5Cycle = ctx.era5?.monthlySummary
    ? ctx.era5.monthlySummary.filter((m) => cycleMonths.includes(m.month))
    : [];

  // =========================================================================
  // PILAR 1: RÉGIMEN TÉRMICO, HELADAS Y CONGELAMIENTO (Peso base total: 30)
  // =========================================================================

  // 1. Temperatura media durante el ciclo de cultivo (Peso: 12)
  const cycleTemp = era5Cycle.length
    ? avg(era5Cycle.map((m) => m.tmeanAvg).filter((v) => v != null))
    : ctx.wx?.daily?.length
    ? avg(ctx.wx.daily.map((d) => (d.tmax + d.tmin) / 2))
    : null;

  if (cycleTemp != null) {
    const [tLo, tHi] = crop.topt;
    const tScore =
      cycleTemp >= tLo && cycleTemp <= tHi
        ? 100
        : 100 - (cycleTemp < tLo ? tLo - cycleTemp : cycleTemp - tHi) * 11;
    const srcTag = era5Cycle.length ? 'climatología ciclo ERA5' : 'pronóstico 7d';
    registerCriterion({
      id: 'cycleTemp',
      pillar: 'Térmico',
      label: 'Temperatura del ciclo',
      weight: 12,
      score: tScore,
      detail: `${cycleTemp.toFixed(1)} °C (${srcTag}; óptimo ${tLo}–${tHi} °C)`
    });
  } else {
    registerCriterion({ label: 'Temperatura del ciclo', score: null });
  }

  // 2. Riesgo de heladas (Pronóstico 7d + frecuencia histórica ERA5 en el ciclo) (Peso: 10)
  const forecastTmin = ctx.wx?.daily?.length ? Math.min(...ctx.wx.daily.map((d) => d.tmin)) : null;
  const histFrostDaysCycle = era5Cycle.length
    ? era5Cycle.reduce((acc, m) => acc + (m.frostDaysAvg || 0), 0)
    : null;

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

    const histText =
      histFrostDaysCycle != null ? `; ${histFrostDaysCycle.toFixed(1)} días helada/ciclo en ERA5` : '';
    registerCriterion({
      id: 'frost',
      pillar: 'Térmico',
      label: 'Riesgo de heladas',
      weight: 10,
      score: fScore,
      detail: `Mín. 7d ${forecastTmin != null ? forecastTmin.toFixed(1) + ' °C' : 's/d'}${histText} (cultivo ${crop.frost})`,
      criticalCap: crop.frost === 'sensible' ? 30 : 45
    });
  } else {
    registerCriterion({ label: 'Riesgo de heladas', score: null });
  }

  // 3. Congelación y descongelamiento (Freeze-Thaw) (Peso: 4)
  if (ctx.agroPhysics?.freezeThaw?.available) {
    const ftCycles = ctx.agroPhysics.freezeThaw.annualFreezeThawCycles;
    let ftScore = 100;
    if (crop.freezeThawSensitive && ftCycles > 25) ftScore = 35;
    else if (crop.freezeThawSensitive && ftCycles > 10) ftScore = 65;
    else if (ftCycles > 35) ftScore = 55;

    registerCriterion({
      id: 'freezeThaw',
      pillar: 'Térmico',
      label: 'Ciclos congelación-deshielo',
      weight: 4,
      score: ftScore,
      detail: `${ftCycles} ciclos/año (riesgo de descalce radicular ${crop.freezeThawSensitive ? 'relevante' : 'bajo'})`
    });
  } else {
    registerCriterion({ label: 'Ciclos congelación-deshielo', score: null });
  }

  // 4. Estrés térmico y superficie (Calor extremo + NASA POWER TS / ECOSTRESS LST) (Peso: 4)
  const forecastTmax = ctx.wx?.daily?.length ? Math.max(...ctx.wx.daily.map((d) => d.tmax)) : null;
  const surfaceTempVal =
    ctx.ecostress?.available && ctx.ecostress.lstCelsius != null
      ? ctx.ecostress.lstCelsius
      : ctx.nasaDaily?.summary?.latestSkinTemp ?? null;

  if (forecastTmax != null || surfaceTempVal != null) {
    let heatScore = 100;
    if (forecastTmax != null) {
      if (forecastTmax > crop.tmax) heatScore = 15;
      else if (forecastTmax > crop.tmax - 3) heatScore = 60;
    }
    if (surfaceTempVal != null && surfaceTempVal > crop.tmax + 5) {
      heatScore = Math.min(heatScore, 45);
    }
    const surfNote = surfaceTempVal != null ? ` · Temp. superficie: ${surfaceTempVal} °C` : '';
    registerCriterion({
      id: 'thermalStress',
      pillar: 'Térmico',
      label: 'Estrés térmico / superficie',
      weight: 4,
      score: heatScore,
      detail: `Máx. aire 7d ${forecastTmax != null ? forecastTmax.toFixed(1) + ' °C' : 's/d'}${surfNote}`,
      criticalCap: 40
    });
  } else {
    registerCriterion({ label: 'Estrés térmico / superficie', score: null });
  }

  // =========================================================================
  // PILAR 2: RÉGIMEN HÍDRICO Y ESTRÉS EVAPORATIVO (Peso base total: 30)
  // =========================================================================
  const waterRegime = ctx.profile?.fields?.waterRegime?.value || null;
  const hasIrrigation = waterRegime === 'riego';

  // 5. Disponibilidad hídrica estacional y pronóstico (GPM + ERA5 + Open-Meteo) (Peso: 16)
  const seasonalRainEra5 = era5Cycle.length
    ? era5Cycle.reduce((acc, m) => acc + (m.rainMonthlyAvg || 0), 0)
    : null;
  const annualRainGpm = ctx.nasaDaily?.summary?.annualRainMm ?? null;
  const rain7d = ctx.wx?.daily?.length ? ctx.wx.daily.reduce((acc, d) => acc + d.rain, 0) : null;

  if (hasIrrigation) {
    registerCriterion({
      id: 'waterBalance',
      pillar: 'Hídrico',
      label: 'Disponibilidad hídrica',
      weight: 16,
      score: 92,
      detail: 'Terreno con riego suplementario declarado'
    });
  } else if (seasonalRainEra5 != null || annualRainGpm != null || rain7d != null) {
    let wScore = 70;
    let detailParts = [];

    if (seasonalRainEra5 != null) {
      const ratio = seasonalRainEra5 / crop.seasonalRainMinMm;
      wScore = clamp(ratio * 85);
      detailParts.push(`Lluvia ciclo ERA5: ${Math.round(seasonalRainEra5)} mm (req. ~${crop.seasonalRainMinMm} mm)`);
    } else if (annualRainGpm != null) {
      const ratio = annualRainGpm / (crop.seasonalRainMinMm * 1.6);
      wScore = clamp(ratio * 85);
      detailParts.push(`Lluvia anual GPM: ${Math.round(annualRainGpm)} mm`);
    }

    if (rain7d != null) {
      detailParts.push(`Pronóstico 7d: ${rain7d.toFixed(1)} mm`);
      if (seasonalRainEra5 == null) {
        wScore = clamp(40 + (rain7d / WATER_NEEDS_7D[crop.water]) * 60);
      }
    }

    if (waterRegime === 'escasa') {
      wScore = clamp(wScore * 0.55);
      detailParts.push('Agua escasa declarada');
    }

    registerCriterion({
      id: 'waterBalance',
      pillar: 'Hídrico',
      label: 'Balance hídrico estacional',
      weight: 16,
      score: wScore,
      detail: detailParts.join(' · '),
      criticalCap: waterRegime === 'escasa' && crop.water === 'alta' ? 40 : null
    });
  } else {
    registerCriterion({ label: 'Balance hídrico estacional', score: null });
  }

  // 6. Humedad del suelo actual/radicular (NASA SMAP / Open-Meteo / Usuario) (Peso: 8)
  const soilMoistPct = ctx.profile?.fields?.soilMoisture?.value ?? null;
  if (soilMoistPct != null) {
    let smScore = 85;
    if (soilMoistPct < 12) smScore = hasIrrigation ? 75 : 30;
    else if (soilMoistPct < 20) smScore = 65;
    else if (soilMoistPct > 45 && !crop.soil.includes('arcilloso')) smScore = 55; // Riesgo exceso hídrico

    registerCriterion({
      id: 'soilMoisture',
      pillar: 'Hídrico',
      label: 'Humedad del suelo',
      weight: 8,
      score: smScore,
      detail: `${soilMoistPct}% (${ctx.profile.fields.soilMoisture.sourceLabel})`
    });
  } else {
    registerCriterion({ label: 'Humedad del suelo', score: null });
  }

  // 7. Humedad ambiental y estrés evaporativo (ECOSTRESS ESI / racha seca GPM) (Peso: 6)
  const ambientRh = ctx.wx?.current?.rh ?? null;
  const drySpell = ctx.nasaDaily?.summary?.maxDrySpell90d ?? null;
  const esi = ctx.ecostress?.available ? ctx.ecostress.esi : null;

  if (ambientRh != null || drySpell != null || esi != null) {
    let stressScore = 85;
    const notes = [];
    if (esi != null) {
      stressScore = esi <= -1.5 ? 25 : esi <= -0.5 ? 60 : 95;
      notes.push(`ECOSTRESS ESI: ${esi}`);
    }
    if (drySpell != null) {
      if (drySpell >= 35 && !hasIrrigation && crop.water === 'alta') stressScore = Math.min(stressScore, 40);
      notes.push(`Racha seca máx 90d: ${drySpell} d`);
    }
    if (ambientRh != null) {
      notes.push(`HR aire: ${Math.round(ambientRh)}%`);
    }
    registerCriterion({
      id: 'hydricStress',
      pillar: 'Hídrico',
      label: 'Estrés hídrico y humedad relativa',
      weight: 6,
      score: stressScore,
      detail: notes.join(' · ')
    });
  } else {
    registerCriterion({ label: 'Estrés hídrico y humedad relativa', score: null });
  }

  // =========================================================================
  // PILAR 3: CALIDAD EDÁFICA / SUELO (Peso base total: 20)
  // =========================================================================

  // 8. Textura del suelo (Peso: 8)
  const texture = ctx.profile?.fields?.soilTexture?.value ?? null;
  if (texture) {
    const isIdeal = crop.soil.includes(texture);
    registerCriterion({
      id: 'soilTexture',
      pillar: 'Suelo',
      label: 'Textura del suelo',
      weight: 8,
      score: isIdeal ? 100 : 50,
      detail: `${texture} (ideal: ${crop.soil.join(', ')})`
    });
  } else {
    registerCriterion({ label: 'Textura del suelo', score: null });
  }

  // 9. pH del suelo (Peso: 7)
  const phVal = ctx.profile?.fields?.ph?.value ?? null;
  if (phVal != null) {
    const diff = phVal < crop.ph[0] ? crop.ph[0] - phVal : phVal > crop.ph[1] ? phVal - crop.ph[1] : 0;
    const phScore = diff === 0 ? 100 : diff <= 0.5 ? 70 : diff <= 1.0 ? 40 : 15;
    registerCriterion({
      id: 'soilPh',
      pillar: 'Suelo',
      label: 'pH del suelo',
      weight: 7,
      score: phScore,
      detail: `pH ${phVal} (rango óptimo ${crop.ph[0]}–${crop.ph[1]})`,
      criticalCap: 50
    });
  } else {
    registerCriterion({ label: 'pH del suelo', score: null });
  }

  // 10. Materia orgánica (%) (Peso: 5)
  const omVal = ctx.profile?.fields?.organicMatter?.value ?? null;
  if (omVal != null) {
    const omScore = omVal >= crop.minOmPct ? 100 : clamp((omVal / crop.minOmPct) * 85);
    registerCriterion({
      id: 'organicMatter',
      pillar: 'Suelo',
      label: 'Materia orgánica',
      weight: 5,
      score: omScore,
      detail: `${omVal}% (referencia recomendada ≥ ${crop.minOmPct}%)`
    });
  } else {
    registerCriterion({ label: 'Materia orgánica', score: null });
  }

  // =========================================================================
  // PILAR 4: TOPOGRAFÍA, FOTOPERÍODO, ESTACIONALIDAD Y ROTACIÓN (Peso base: 20)
  // =========================================================================

  // 11. Época de siembra y duración de ciclo (Hemisferio Norte/Sur) (Peso: 6)
  const nearSow = sowMonths.some((s) => [1, 11].includes(Math.abs(s - ctx.month)));
  const sowScore = sowMonths.includes(ctx.month) ? 100 : nearSow ? 65 : 30;
  registerCriterion({
    id: 'seasonality',
    pillar: 'Entorno',
    label: 'Estacionalidad y ciclo',
    weight: 6,
    score: sowScore,
    detail: `Siembra hemisferio ${ctx.hemisphere === 'north' ? 'norte' : 'sur'}: meses ${sowMonths.join(', ')} (ciclo ${crop.cycle} d)`
  });

  // 12. Horas de luz y fotoperíodo (Peso: 5)
  const currentLight = ctx.agroPhysics?.photoperiod?.currentDaylightHours ?? null;
  if (currentLight != null) {
    const [dMin, dMax] = crop.daylightRange;
    const inRange = currentLight >= dMin && currentLight <= dMax;
    const lightScore = crop.photoperiodType === 'neutral' ? 95 : inRange ? 100 : 55;
    registerCriterion({
      id: 'photoperiod',
      pillar: 'Entorno',
      label: 'Horas de luz / fotoperíodo',
      weight: 5,
      score: lightScore,
      detail: `${currentLight} h de luz hoy (respuesta: ${crop.photoperiodType}, rango ${dMin}–${dMax} h)`
    });
  } else {
    registerCriterion({ label: 'Horas de luz / fotoperíodo', score: null });
  }

  // 13. Altitud y pendiente topográfica (NASA SRTM) (Peso: 5)
  const elev = ctx.topo?.elevationMeters ?? null;
  const slope = ctx.topo?.slopePercent ?? null;
  if (elev != null || slope != null) {
    let topoScore = 100;
    const topoNotes = [];
    if (elev != null) {
      if (elev > crop.maxAltitudeM) topoScore = 15;
      else if (elev > crop.maxAltitudeM * 0.85) topoScore = 65;
      topoNotes.push(`Altitud ${elev} m (máx. ${crop.maxAltitudeM} m)`);
    }
    if (slope != null) {
      if (slope > crop.maxSlopePct * 1.8) topoScore = Math.min(topoScore, 15);
      else if (slope > crop.maxSlopePct) topoScore = Math.min(topoScore, 55);
      topoNotes.push(`Pendiente ${slope}%`);
    }
    registerCriterion({
      id: 'topography',
      pillar: 'Entorno',
      label: 'Altitud y pendiente (SRTM)',
      weight: 5,
      score: topoScore,
      detail: topoNotes.join(' · '),
      criticalCap: 35
    });
  } else {
    registerCriterion({ label: 'Altitud y pendiente (SRTM)', score: null });
  }

  // 14. Antecedentes de cultivos / Rotación (Usuario o USDA CropScape) + FAO GAEZ (Peso: 4)
  const prevCropText = ctx.profile?.fields?.previousCrop?.value ?? null;
  const gaezCropScore = ctx.faoGaez?.available ? ctx.faoGaez.suitabilityByCrop?.[crop.id] : null;

  if (prevCropText || gaezCropScore != null) {
    let rotScore = 75;
    const rotNotes = [];
    if (prevCropText) {
      const rotEval = evaluateRotationCompatibility(crop, prevCropText);
      rotScore = rotEval.score;
      rotNotes.push(rotEval.note);
    }
    if (gaezCropScore != null) {
      rotScore = Math.round((rotScore + gaezCropScore) / 2);
      rotNotes.push(`FAO GAEZ: ${gaezCropScore}/100`);
    }
    registerCriterion({
      id: 'rotationGaez',
      pillar: 'Entorno',
      label: 'Rotación y aptitud agroecológica',
      weight: 4,
      score: rotScore,
      detail: rotNotes.join(' · ')
    });
  } else {
    registerCriterion({ label: 'Rotación y aptitud agroecológica', score: null });
  }

  // =========================================================================
  // CÁLCULO FINAL PONDERADO CON NORMALIZACIÓN POR DATOS DISPONIBLES
  // =========================================================================
  const totalAvailableWeight = criteria.reduce((acc, c) => acc + c.weight, 0);
  const weightedSum = criteria.reduce((acc, c) => acc + c.score * c.weight, 0);
  const rawWeightedScore = totalAvailableWeight > 0 ? Math.round(weightedSum / totalAvailableWeight) : 0;
  const finalScore = Math.min(rawWeightedScore, liebigCap);

  // Clasificación en 4 categorías diferenciadas
  let classification;
  if (finalScore >= 75) {
    classification = { label: 'Condiciones favorables', badge: 'ok' };
  } else if (finalScore >= 55) {
    classification = { label: 'Condiciones moderadamente favorables', badge: 'mid' };
  } else if (finalScore >= 35) {
    classification = { label: 'Condiciones limitantes', badge: 'warn-orange' };
  } else {
    classification = { label: 'Condiciones desfavorables', badge: 'bad' };
  }

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

function evaluateRotationCompatibility(candidateCrop, prevText) {
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
      note: `Monocultivo detectado (${prevText}): mayor riesgo de enfermedades de rastrojo`
    };
  }

  const prevIsLegume = ['soja', 'soy', 'mani', 'maní', 'peanut', 'alfalfa', 'poroto'].some((l) =>
    norm.includes(l)
  );
  if (prevIsLegume && candidateCrop.family === 'Poaceae') {
    return {
      score: 100,
      note: `Rotación ideal tras leguminosa (${prevText}): aporte biológico de nitrógeno`
    };
  }

  return {
    score: 80,
    note: `Rotación diversificada respecto a ${prevText}`
  };
}

export function generateAlerts(weather, agroPhysics = null) {
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
    pushAlert('hi', 'Helada meteorológica', `Mínima prevista de ${minTemp.toFixed(1)} °C en aire (2m) en los próximos 7 días.`);
  } else if (minTemp <= 3) {
    pushAlert('me', 'Riesgo de helada agronómica', `Mínima en aire de ${minTemp.toFixed(1)} °C; la superficie del suelo puede bajar de 0 °C.`);
  }

  if (maxTemp >= 35) {
    pushAlert('hi', 'Temperatura extrema', `Máxima prevista de ${maxTemp.toFixed(1)} °C.`);
  }

  if (maxDailyRain >= 30) {
    pushAlert('hi', 'Precipitación intensa', `Hasta ${maxDailyRain.toFixed(0)} mm en un día.`);
  }

  if (maxWind >= 50) {
    pushAlert('hi', 'Viento fuerte', `Máximo diario de ${maxWind.toFixed(0)} km/h.`);
  }

  if (totalRain < 5 && totalEt0 > 25) {
    pushAlert('me', 'Riesgo de sequía', `Lluvia 7 días ${totalRain.toFixed(1)} mm vs. evapotranspiración ${totalEt0.toFixed(1)} mm.`);
  }

  if (c.rh >= 85 && c.temp >= 15 && c.temp <= 25) {
    pushAlert('me', 'Condiciones favorables a enfermedades fúngicas', `Humedad ${c.rh}% y ${c.temp} °C (indicador orientativo).`);
  }

  if (agroPhysics?.freezeThaw?.available && agroPhysics.freezeThaw.annualFreezeThawCycles >= 25) {
    pushAlert(
      'me',
      'Ciclos frecuentes de congelación-descongelación',
      `Promedio histórico de ${agroPhysics.freezeThaw.annualFreezeThawCycles} ciclos/año: precaución por descalce radicular en invierno.`
    );
  }

  return alerts.length
    ? alerts
    : [{ l: 'lo', t: 'Sin alertas', x: 'No se detectan riesgos según los umbrales usados.' }];
}

export function calculateIrrigation(crop, weather, stageFactor) {
  const et0 = weather.daily.reduce((s, d) => s + d.et0, 0);
  const rain = weather.daily.reduce((s, d) => s + d.rain, 0);
  const etc = et0 * crop.kc * stageFactor;
  const balance = rain - etc;
  const soil = weather.soilMoisture;

  const why = [
    `ET0 7 días: ${et0.toFixed(1)} mm; ETc estimada (kc ${(crop.kc * stageFactor).toFixed(2)}): ${etc.toFixed(1)} mm.`,
    `Lluvia prevista: ${rain.toFixed(1)} mm. Balance: ${balance.toFixed(1)} mm.`
  ];

  if (soil != null) {
    why.push(`Humedad de suelo estimada (3–9 cm): ${(soil * 100).toFixed(0)} % vol.`);
  }

  let level, text;
  if (balance >= 0 && (soil == null || soil > 0.2)) {
    level = 'ok';
    text = 'La lluvia prevista cubriría la demanda; no parece necesario regar.';
  } else if (balance < -10 || (soil != null && soil < 0.12)) {
    level = 'bad';
    text = 'Déficit hídrico marcado: conviene planificar riego en los próximos días.';
  } else {
    level = 'mid';
    text = 'Déficit moderado: monitoreá la humedad del suelo y considerá regar si no llueve.';
  }

  return { l: level, t: text, why };
}
