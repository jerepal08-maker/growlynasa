/**
 * Resuelve el perfil efectivo del terreno combinando:
 * 1) Mediciones reales cargadas por el usuario (prioridad máxima)
 * 2) Estimaciones de fuentes satelitales/modeladas (SoilGrids, NASA SMAP, Open-Meteo, CropScape)
 * 3) Detección explícita de datos faltantes y su impacto en la precisión agronómica
 */

export function resolveEffectivePlotProfile(userPlot, external = {}) {
  const { soilEst, nasaDaily, wx, cropScape } = external;

  // 1. Textura del suelo
  let soilTexture;
  if (userPlot?.soil) {
    soilTexture = {
      value: userPlot.soil,
      status: 'measured',
      sourceLabel: 'Medido / declarado por usuario'
    };
  } else if (soilEst?.textureClass) {
    soilTexture = {
      value: soilEst.textureClass,
      status: 'estimated',
      sourceLabel: `Estimado (${soilEst.source})`
    };
  } else {
    soilTexture = {
      value: null,
      status: 'missing',
      sourceLabel: 'Sin datos'
    };
  }

  // 2. pH del suelo
  let ph;
  if (userPlot?.ph !== undefined && userPlot?.ph !== '' && userPlot?.ph !== null) {
    ph = {
      value: Number(userPlot.ph),
      status: 'measured',
      sourceLabel: 'Medido por usuario'
    };
  } else if (soilEst?.ph != null) {
    ph = {
      value: Number(soilEst.ph),
      status: 'estimated',
      sourceLabel: `Estimado (${soilEst.source})`
    };
  } else {
    ph = {
      value: null,
      status: 'missing',
      sourceLabel: 'Sin datos'
    };
  }

  // 3. Materia orgánica (%)
  let organicMatter;
  if (userPlot?.om !== undefined && userPlot?.om !== '' && userPlot?.om !== null) {
    organicMatter = {
      value: Number(userPlot.om),
      status: 'measured',
      sourceLabel: 'Medido por usuario'
    };
  } else if (soilEst?.organicMatterPct != null) {
    organicMatter = {
      value: Number(soilEst.organicMatterPct),
      status: 'estimated',
      sourceLabel: `Estimado (${soilEst.source})`
    };
  } else {
    organicMatter = {
      value: null,
      status: 'missing',
      sourceLabel: 'Sin datos'
    };
  }

  // 4. Humedad del suelo (%)
  let soilMoisture;
  if (userPlot?.moist !== undefined && userPlot?.moist !== '' && userPlot?.moist !== null) {
    soilMoisture = {
      value: Number(userPlot.moist),
      status: 'measured',
      sourceLabel: 'Medido por usuario'
    };
  } else if (nasaDaily?.summary?.latestSoilRootPct != null) {
    soilMoisture = {
      value: Number(nasaDaily.summary.latestSoilRootPct),
      status: 'estimated',
      sourceLabel: 'Estimado satelital (NASA SMAP zona radicular)'
    };
  } else if (wx?.soilMoisture != null) {
    soilMoisture = {
      value: Math.round(wx.soilMoisture * 100),
      status: 'estimated',
      sourceLabel: 'Estimado modelado (Open-Meteo 3–9 cm)'
    };
  } else {
    soilMoisture = {
      value: null,
      status: 'missing',
      sourceLabel: 'Sin datos'
    };
  }

  // 5. Cultivos anteriores (historial de rotación)
  let previousCrop;
  if (userPlot?.prev && userPlot.prev.trim() !== '') {
    previousCrop = {
      value: userPlot.prev.trim(),
      status: 'measured',
      sourceLabel: 'Declarado por usuario'
    };
  } else if (cropScape?.available && Array.isArray(cropScape.history) && cropScape.history.length > 0) {
    const latest = cropScape.history[0];
    previousCrop = {
      value: `${latest.cropName} (${latest.year})`,
      status: 'estimated',
      sourceLabel: `Detectado por satélite (${cropScape.source})`
    };
  } else {
    previousCrop = {
      value: null,
      status: 'missing',
      sourceLabel: 'Sin historial disponible'
    };
  }

  // 6. Régimen hídrico / disponibilidad de riego
  let waterRegime;
  if (userPlot?.water && userPlot.water !== '') {
    waterRegime = {
      value: userPlot.water,
      status: 'measured',
      sourceLabel: 'Declarado por usuario'
    };
  } else {
    waterRegime = {
      value: null,
      status: 'missing',
      sourceLabel: 'No especificado (se evaluará según lluvias y SMAP)'
    };
  }

  const fields = {
    soilTexture,
    ph,
    organicMatter,
    soilMoisture,
    previousCrop,
    waterRegime
  };

  // Cálculo de completitud (cuántas de las 6 variables cuentan con dato real o estimado)
  const fieldList = Object.values(fields);
  const availableCount = fieldList.filter((f) => f.status !== 'missing').length;
  const completenessPct = Math.round((availableCount / fieldList.length) * 100);

  // Informe transparente sobre qué falta y cómo afecta la precisión
  const missingImpactNotes = [];

  if (soilTexture.status === 'missing') {
    missingImpactNotes.push({
      field: 'Textura del suelo',
      impact: 'No es posible evaluar retención de agua, drenaje ni riesgo de anegamiento radicular.'
    });
  }
  if (ph.status === 'missing') {
    missingImpactNotes.push({
      field: 'pH del suelo',
      impact: 'No se pueden detectar bloqueos de nutrientes por alcalinidad ni toxicidad por acidez.'
    });
  }
  if (organicMatter.status === 'missing') {
    missingImpactNotes.push({
      field: 'Materia orgánica (%)',
      impact: 'Se desconoce la fertilidad natural y la estabilidad estructural del suelo.'
    });
  }
  if (soilMoisture.status === 'missing') {
    missingImpactNotes.push({
      field: 'Humedad del suelo',
      impact: 'La evaluación hídrica dependerá exclusivamente del pronóstico de lluvias y ET0.'
    });
  }
  if (previousCrop.status === 'missing') {
    missingImpactNotes.push({
      field: 'Cultivos anteriores',
      impact: 'No se puede evaluar rotación de cultivos ni riesgo acumulado de plagas o enfermedades del rastrojo.'
    });
  }
  if (waterRegime.status === 'missing') {
    missingImpactNotes.push({
      field: 'Disponibilidad de riego',
      impact: 'Se asume condición de secano (dependiente de lluvia), lo que puede penalizar cultivos de alta demanda hídrica si tenés riego.'
    });
  }

  return {
    hasUserPlot: Boolean(userPlot),
    plotName: userPlot?.name || 'Sin lote guardado (usando datos satelitales de la ubicación)',
    areaHa: userPlot?.area ? Number(userPlot.area) : null,
    fields,
    completenessPct,
    missingImpactNotes
  };
}
