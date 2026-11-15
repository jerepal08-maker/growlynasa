import { CONFIG, MONTH_NAMES, PRESET_REGIONS } from './config.js';
import { searchLocations, fetchWeatherForecast, fetchNasaClimatology } from './services/weatherService.js';
import { fetchEra5History } from './services/era5Service.js';
import { fetchTopography } from './services/topographyService.js';
import { fetchNasaPowerDaily } from './services/nasaPowerDailyService.js';
import { fetchSoilEstimate } from './services/soilService.js';
import {
  fetchCropScapeHistory,
  fetchEcostressData,
  fetchFaoGaezSuitability,
  searchUsdaAgDatasets
} from './services/agroAtlasService.js';
import { resolveEffectivePlotProfile } from './domain/soilProfileResolver.js';
import { analyzePhotoperiod, analyzeFreezeThaw, analyzeFrostRisk } from './domain/agroPhysics.js';
import {
  CROPS,
  getCropSowMonths,
  buildComprehensiveContext,
  evaluateCropComprehensive,
  generateAlerts,
  calculateIrrigation
} from './domain/agronomyEngine.js';
import { renderGaussianChart, renderAnnualHydrologyChart, renderAgroPhysicsChart } from './ui/chartsView.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  loc: { ...CONFIG.DEFAULT_LOC },
  wx: null,
  clim: null,
  era5: null,
  topo: null,
  nasaDaily: null,
  soilEst: null,
  cropScape: null,
  ecostress: null,
  faoGaez: null,
  usdaCatalog: null,
  agroPhysics: null,
  gaussianMode: 'all_curves',
  irrStageFactor: 0.75,
  charts: {},
  map: null,
  marker: null,
  abortCtrl: null
};

const fmtVal = (val, unit, decimals = 1) => (val == null ? 'sin datos' : `${Number(val).toFixed(decimals)} ${unit}`);
const escHtml = (str) =>
  String(str).replace(/[&<>"]/g, (ch) => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[ch]));
const fmtWindDir = (deg) =>
  deg == null ? 'sin datos' : `${['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]} (${Math.round(deg)}°)`;

function getPlots() {
  try {
    return JSON.parse(localStorage.getItem('agroguia.plots') || '[]');
  } catch (_) {
    return [];
  }
}

function savePlots(list) {
  try {
    localStorage.setItem('agroguia.plots', JSON.stringify(list));
  } catch (_) {}
}

function getActivePlot() {
  try {
    const activeId = localStorage.getItem('agroguia.active');
    return getPlots().find((p) => p.id === activeId) || null;
  } catch (_) {
    return null;
  }
}

function getResolvedProfile() {
  return resolveEffectivePlotProfile(getActivePlot(), {
    soilEst: state.soilEst,
    nasaDaily: state.nasaDaily,
    wx: state.wx,
    cropScape: state.cropScape
  });
}

const renderScoreBar = (score) =>
  `<div class="bar"><i style="width:${score}%;background:${score >= 75 ? '#2e8b3d' : score >= 55 ? '#d99a1e' : score >= 35 ? '#e67e22' : '#c0392b'}"></i></div>`;

function navigateTo(sectionId) {
  $$('section').forEach((sec) => sec.classList.toggle('on', sec.id === sectionId));
  $$('nav button').forEach((btn) => btn.classList.toggle('on', btn.dataset.s === sectionId));
  if (sectionId === 'loc') initMap();
}

$$('nav button').forEach((btn) => {
  btn.onclick = () => navigateTo(btn.dataset.s);
});

if ($('#btnChangeLoc')) $('#btnChangeLoc').onclick = () => navigateTo('loc');
if ($('#heroChangeLoc')) $('#heroChangeLoc').onclick = () => navigateTo('loc');
if ($('#heroEditSoil')) $('#heroEditSoil').onclick = () => navigateTo('plots');

async function loadLocationData() {
  if (state.abortCtrl) {
    state.abortCtrl.abort();
  }
  state.abortCtrl = new AbortController();
  const { signal } = state.abortCtrl;

  const locDisplay = `${state.loc.name} (${state.loc.lat.toFixed(3)}, ${state.loc.lon.toFixed(3)})`;
  $('#where').textContent = `📍 ${state.loc.name}`;
  if ($('#plotActiveLoc')) $('#plotActiveLoc').textContent = locDisplay;
  $('#status').innerHTML = '<div class="load">Sincronizando datos meteorológicos, climáticos, satelitales y topográficos…</div>';

  try {
    const [wxRes, climRes, era5Res, topoRes, nasaDailyRes, soilRes, csRes, ecoRes, gaezRes, usdaRes] =
      await Promise.allSettled([
        fetchWeatherForecast(state.loc.lat, state.loc.lon, signal),
        fetchNasaClimatology(state.loc.lat, state.loc.lon, signal),
        fetchEra5History(state.loc.lat, state.loc.lon, signal),
        fetchTopography(state.loc.lat, state.loc.lon, signal),
        fetchNasaPowerDaily(state.loc.lat, state.loc.lon, signal),
        fetchSoilEstimate(state.loc.lat, state.loc.lon, signal),
        fetchCropScapeHistory(state.loc.lat, state.loc.lon, signal),
        fetchEcostressData(state.loc.lat, state.loc.lon, signal),
        fetchFaoGaezSuitability(state.loc.lat, state.loc.lon, signal),
        searchUsdaAgDatasets('crop yield soil moisture', signal)
      ]);

    if (signal.aborted) return;

    if (wxRes.status === 'fulfilled') {
      state.wx = wxRes.value;
      $('#status').innerHTML = '';
    } else {
      if (wxRes.reason?.name === 'AbortError') return;
      state.wx = null;
      $('#status').innerHTML = `<div class="err">No se pudo obtener el clima (${escHtml(wxRes.reason.message)}). Verificá tu conexión e intentá de nuevo.</div>`;
    }

    state.clim = climRes.status === 'fulfilled' ? climRes.value : null;
    state.era5 = era5Res.status === 'fulfilled' ? era5Res.value : null;
    state.topo = topoRes.status === 'fulfilled' ? topoRes.value : null;
    state.nasaDaily = nasaDailyRes.status === 'fulfilled' ? nasaDailyRes.value : null;
    state.soilEst = soilRes.status === 'fulfilled' ? soilRes.value : null;
    state.cropScape = csRes.status === 'fulfilled' ? csRes.value : null;
    state.ecostress = ecoRes.status === 'fulfilled' ? ecoRes.value : null;
    state.faoGaez = gaezRes.status === 'fulfilled' ? gaezRes.value : null;
    state.usdaCatalog = usdaRes.status === 'fulfilled' ? usdaRes.value : null;

    state.agroPhysics = {
      photoperiod: analyzePhotoperiod(state.loc.lat, state.era5?.monthlySummary),
      freezeThaw: analyzeFreezeThaw(state.era5),
      frostRisk: analyzeFrostRisk({
        lat: state.loc.lat,
        wx: state.wx,
        era5: state.era5,
        nasaDaily: state.nasaDaily,
        ecostress: state.ecostress
      })
    };

    renderAll();
  } catch (err) {
    if (err.name === 'AbortError') return;
    $('#status').innerHTML = `<div class="err">Error inesperado: ${escHtml(err.message)}</div>`;
  }
}

function renderAll() {
  renderUnifiedDashboard();
  renderPlots();
}

function buildInlineCalendarTable(crop, lat) {
  const sowMonths = getCropSowMonths(crop, lat);
  const cells = Array(12).fill('');
  const s0 = sowMonths[0] - 1;
  const durationMonths = Math.ceil(crop.cycle / 30);

  for (let i = 0; i <= durationMonths; i++) {
    cells[(s0 + i) % 12] = i === durationMonths ? 'H' : 'C';
  }
  sowMonths.forEach((m) => {
    cells[m - 1] = 'S';
  });

  return `
    <div class="tw mini-cal" style="margin-top:8px">
      <table>
        <tr>${MONTH_NAMES.map((m) => `<th>${m[0]}</th>`).join('')}</tr>
        <tr>${cells.map((code) => `<td class="${code}">${code || '·'}</td>`).join('')}</tr>
      </table>
    </div>
  `;
}

function renderUnifiedDashboard() {
  const el = $('#dashBody');
  if (!state.wx) {
    el.innerHTML = '<div class="err">Sin datos meteorológicos disponibles para esta ubicación.</div>';
    return;
  }

  const w = state.wx;
  const c = w.current;
  const d0 = w.daily[0];
  const nd = state.nasaDaily?.summary;
  const cs = state.cropScape;
  const eco = state.ecostress;
  const ap = state.agroPhysics;
  const profile = getResolvedProfile();
  const isNorth = Number(state.loc.lat) >= 0;

  const kpi = (title, value, sub) => `<div class="k"><small>${title}</small><b>${value}</b><small>${sub || ''}</small></div>`;
  const cacheBadge = w.fromCache ? ' · (Caché local)' : '';

  const alertsHtml = generateAlerts(w, ap)
    .map((a) => `<div class="al ${a.l}"><b>${a.t}</b><br>${a.x}</div>`)
    .join('');

  // Contexto y ranking de cultivos
  const ctx = buildComprehensiveContext({
    lat: state.loc.lat,
    wx: w,
    era5: state.era5,
    nasaDaily: state.nasaDaily,
    topo: state.topo,
    profile,
    ecostress: eco,
    faoGaez: state.faoGaez,
    agroPhysics: ap
  });

  const rankedCrops = CROPS.map((crop) => ({
    crop,
    evalRes: evaluateCropComprehensive(crop, ctx),
    irrRes: calculateIrrigation(crop, w, state.irrStageFactor)
  })).sort((a, b) => b.evalRes.score - a.evalRes.score);

  const missingHtml = profile.missingImpactNotes.length
    ? `<div class="warn-box">
        <strong>ℹ️ Transparencia de datos faltantes (Completitud edáfica: ${profile.completenessPct}%):</strong> Se ajustan los pesos sin penalizar ni inventar datos.
        <ul>${profile.missingImpactNotes.map((m) => `<li><b>${m.field}:</b> ${m.impact}</li>`).join('')}</ul>
       </div>`
    : '';

  el.innerHTML = `
    <!-- BLOQUE 1: RESUMEN GEOGRÁFICO Y DE TERRENO -->
    <div class="info-banner">
      <div>
        <strong>📍 ${escHtml(state.loc.name)}</strong> · Lat ${state.loc.lat.toFixed(3)}, Lon ${state.loc.lon.toFixed(3)} · <b>Hemisferio ${isNorth ? 'Norte' : 'Sur'}</b><br>
        <small class="note">
          ⛰️ Altitud (SRTM): <b>${state.topo?.elevationMeters != null ? state.topo.elevationMeters + ' m s.n.m.' : 's/d'}</b>
          ${state.topo?.slopePercent != null ? `· Pendiente: <b>${state.topo.slopePercent}%</b> (${state.topo.terrainClass})` : ''}
          · 🧪 Perfil activo: <b>${escHtml(profile.plotName)}</b> (${profile.completenessPct}% completo)
        </small>
      </div>
      <small class="note">Actualizado: ${w.fetchedAt.toLocaleString('es-AR')}${cacheBadge}</small>
    </div>

    <!-- BLOQUE 2: ALERTAS Y VARIABLES ORGANIZADAS POR DOMINIO -->
    <div id="blk-alerts" class="dash-block">
      <div class="block-header">
        <h2>⚠️ Alertas Activas y Monitoreo Agroclimático</h2>
        <small class="note">Diferenciando observaciones actuales, estimaciones satelitales e historial</small>
      </div>
      ${alertsHtml}

      <div class="domain-title">🌡️ Atmósfera (2m) y Superficie Terrestre / Dosel</div>
      <div class="grid">
        ${kpi('Temp. aire actual (2m)', fmtVal(c.temp, '°C'), 'Observación Open-Meteo')}
        ${kpi('Temp. superficial (Piel)', nd?.latestSkinTemp != null ? `${nd.latestSkinTemp} °C` : 'sin datos', 'NASA POWER TS (suelo/superficie)')}
        ${kpi('NASA ECOSTRESS (70m)', eco?.available ? `${eco.lstCelsius} °C` : 'Sin proxy', eco?.available ? eco.stressStatus : eco?.reason || '')}
        ${kpi('Radiación solar y Viento', `${fmtVal(c.radiation, 'W/m²', 0)} · ${fmtVal(c.wind, 'km/h', 0)}`, `Dirección: ${fmtWindDir(c.windDir)}`)}
      </div>

      <div class="domain-title">💧 Balance Hídrico y Humedad del Suelo (GPM + SMAP)</div>
      <div class="grid">
        ${kpi('Lluvia 7d / Humedad aire', `${w.daily.reduce((s, d) => s + d.rain, 0).toFixed(1)} mm · ${fmtVal(c.rh, '%', 0)}`, `Última hora: ${fmtVal(c.rain, 'mm')}`)}
        ${kpi('Lluvia anual (NASA GPM)', nd ? `${nd.annualRainMm} mm` : 'sin datos', nd ? `Últimos 30d: ${nd.rain30dMm} mm · Racha seca: ${nd.maxDrySpell90d}d` : '')}
        ${kpi('Humedad suelo (SMAP)', nd?.latestSoilRootPct != null ? `Raíz: ${nd.latestSoilRootPct}%` : 'sin datos', nd ? `Superficial: ${nd.latestSoilTopPct}% · Tendencia: ${nd.rootTrend}` : '')}
        ${kpi('Evapotranspiración (ET0)', fmtVal(d0.et0, 'mm'), `Acumulado 7d: ${w.daily.reduce((s, d) => s + d.et0, 0).toFixed(1)} mm`)}
      </div>

      <div class="domain-title">☀️ Física Agroclimática: Luz, Heladas y Congelamiento</div>
      <div class="grid">
        ${kpi('Horas de luz (Fotoperíodo)', ap?.photoperiod ? `${ap.photoperiod.currentDaylightHours} h/día` : 's/d', ap?.photoperiod ? `Rango anual: ${ap.photoperiod.minDaylightHours}–${ap.photoperiod.maxDaylightHours} h (${ap.photoperiod.regime.split(' ')[0]})` : '')}
        ${kpi('Riesgo de heladas', ap?.frostRisk ? `Nivel ${ap.frostRisk.immediateLevel}` : 's/d', ap?.frostRisk ? `Histórico: ${ap.frostRisk.annualFrostDays} d/año${ap.frostRisk.peakFrostMonths.length ? ' · Pico: ' + ap.frostRisk.peakFrostMonths[0] : ''}` : '')}
        ${kpi('Congelación / Deshielo', ap?.freezeThaw?.available ? `${ap.freezeThaw.annualFreezeThawCycles} ciclos/año` : 's/d', ap?.freezeThaw?.available ? `Días <0°C: ${ap.freezeThaw.annualSubZeroDays}/año · Máx racha: ${ap.freezeThaw.maxSubZeroSpellDays}d` : '')}
        ${kpi('Uso del suelo (USDA)', cs?.inCoverage ? (cs.available ? cs.history[0]?.cropName : 'En EE.UU.') : 'Fuera de EE.UU.', cs?.available ? cs.history.map((h) => `${h.year}: ${h.cropName}`).join(' · ') : cs?.reason || '')}
      </div>
    </div>

    <!-- BLOQUE 3: ANÁLISIS CLIMÁTICO ANUAL Y CURVAS DE GAUSS -->
    <div id="blk-gauss" class="dash-block">
      <div class="block-header">
        <h2>📈 Comportamiento Climático Anual y Distribución Térmica (Campana de Gauss)</h2>
        <div class="row" style="margin:0">
          <label style="font-size:0.85rem"><b>Vista Gaussiana:</b>
            <select id="gaussModeSel">
              <option value="all_curves" ${state.gaussianMode === 'all_curves' ? 'selected' : ''}>T. Mínima, Media y Máxima (10 años)</option>
              <option value="compare_periods" ${state.gaussianMode === 'compare_periods' ? 'selected' : ''}>Comparar períodos (Primeros 5 años vs. Últimos 5 años)</option>
              <option value="seasonal" ${state.gaussianMode === 'seasonal' ? 'selected' : ''}>Contraste estacional (Semestre cálido vs. frío)</option>
            </select>
          </label>
        </div>
      </div>

      ${
        state.era5
          ? `<div class="card">
              <div class="cv-tall"><canvas id="cGauss"></canvas></div>
              <div id="gaussStatsPills" class="stat-pills"></div>
              <p class="note" style="margin-top:8px">
                <b>Nota estadística:</b> La temperatura continua sigue una distribución Normal (Campana de Gauss), permitiendo evaluar la media (μ), la dispersión térmica (σ) y las colas extremas frente al histograma real de ${state.era5.period.totalDays} días (${state.era5.source}). Para precipitaciones (asimétricas con ceros), se emplean acumulados mensuales abajo.
              </p>
            </div>`
          : '<div class="card"><p class="note">Serie histórica ERA5 no disponible para generar las curvas de Gauss.</p></div>'
      }

      <div class="charts">
        <div class="card"><div class="cv"><canvas id="cHydro"></canvas></div></div>
        <div class="card"><div class="cv"><canvas id="cPhysics"></canvas></div></div>
      </div>
    </div>

    <!-- BLOQUE 4: RECOMENDACIONES DE CULTIVOS, CALENDARIO Y RIEGO INTEGRADOS -->
    <div id="blk-crops" class="dash-block">
      <div class="block-header">
        <h2>🌾 Cultivos Recomendados, Calendario y Riego (Evaluación Ponderada)</h2>
        <div class="row" style="margin:0">
          <label style="font-size:0.85rem"><b>Etapa fenológica para riego:</b>
            <select id="unifiedIrrStage">
              <option value="0.4" ${state.irrStageFactor === 0.4 ? 'selected' : ''}>Inicial (Kc × 0.40)</option>
              <option value="0.75" ${state.irrStageFactor === 0.75 ? 'selected' : ''}>Desarrollo (Kc × 0.75)</option>
              <option value="1" ${state.irrStageFactor === 1 ? 'selected' : ''}>Media / Floración (Kc × 1.00)</option>
              <option value="0.7" ${state.irrStageFactor === 0.7 ? 'selected' : ''}>Final / Maduración (Kc × 0.70)</option>
            </select>
          </label>
        </div>
      </div>

      <p class="note">
        Ponderación fisiológica: <b>Hídrico 30%</b> · <b>Térmico y Heladas 30%</b> · <b>Suelo 20%</b> · <b>Topografía, Luz y Rotación 20%</b>. Incluye calendario hemisferio <b>${isNorth ? 'Norte' : 'Sur'}</b> (<span class="S" style="padding:0 4px">S</span> Siembra, <span class="C" style="padding:0 4px">C</span> Crecimiento, <span class="H" style="padding:0 4px">H</span> Cosecha).
      </p>
      ${missingHtml}

      <div class="grid big" style="margin-top:12px">
        ${rankedCrops
          .map(
            ({ crop, evalRes, irrRes }) => `
          <div class="card">
            <h3>${crop.i} ${crop.n} <small class="note"><i>(${crop.scientific})</i></small></h3>
            <span class="tag ${evalRes.classification.badge === 'warn-orange' ? 'mid' : evalRes.classification.badge}">${evalRes.classification.label}</span>
            <b>${evalRes.score}/100</b>
            ${renderScoreBar(evalRes.score)}
            ${evalRes.cappedByLiebig ? '<p class="note">⚠ Limitado por factor crítico fisiológico (Ley de Liebig).</p>' : ''}

            ${
              evalRes.advantages.length
                ? `<p style="margin:6px 0 2px;font-size:0.86rem"><b>✔ Ventajas:</b></p><ul style="font-size:0.84rem;margin:2px 0 6px 18px">${evalRes.advantages
                    .slice(0, 3)
                    .map((a) => `<li>${escHtml(a)}</li>`)
                    .join('')}</ul>`
                : ''
            }

            ${
              evalRes.limitingFactors.length
                ? `<p style="margin:6px 0 2px;font-size:0.86rem;color:#8a1f13"><b>⚠ Factores limitantes:</b></p><ul style="font-size:0.84rem;margin:2px 0 6px 18px">${evalRes.limitingFactors
                    .map((lf) => `<li>${escHtml(lf)}</li>`)
                    .join('')}</ul>`
                : ''
            }

            <div class="irr-box">
              <b>💧 Riego 7 días:</b> <span class="tag ${irrRes.l}" style="font-size:0.72rem">${irrRes.t}</span>
              <div class="note" style="margin-top:4px">${escHtml(irrRes.why[0])} ${escHtml(irrRes.why[1])}</div>
            </div>

            ${buildInlineCalendarTable(crop, state.loc.lat)}

            <details style="margin-top:8px">
              <summary style="cursor:pointer;font-size:0.83rem;color:#1f4d2b">Ver auditoría completa (${evalRes.criteria.length} criterios evaluados)</summary>
              <ul style="font-size:0.8rem;margin-top:6px">
                ${evalRes.criteria
                  .map((cr) => `<li><b>${cr.label}</b> [Peso ${cr.weight}% · Nota ${cr.score}/100]: ${escHtml(cr.detail)}</li>`)
                  .join('')}
              </ul>
            </details>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  // Renderizar los 3 gráficos científicos
  if (state.era5) {
    const gResult = renderGaussianChart($('#cGauss'), state.charts, state.era5, state.gaussianMode);
    if (gResult && $('#gaussStatsPills')) {
      $('#gaussStatsPills').innerHTML = gResult.curves
        .map(
          (cv) => `
          <div class="stat-pill" style="border-left:4px solid ${cv.color}">
            <b>${cv.label}:</b> Media μ = <b>${cv.stats.mean} °C</b> · Dispersión σ = <b>${cv.stats.std} °C</b> · Rango 68% (${cv.stats.minus1Sigma} a ${cv.stats.plus1Sigma} °C) · Extremos: <b>${cv.stats.min} °C</b> / <b>${cv.stats.max} °C</b>
          </div>`
        )
        .join('');
    }
  }

  renderAnnualHydrologyChart($('#cHydro'), state.charts, state.era5, state.clim);
  renderAgroPhysicsChart($('#cPhysics'), state.charts, state.agroPhysics);

  // Listeners de controles interactivos dentro del panel unificado
  if ($('#gaussModeSel')) {
    $('#gaussModeSel').onchange = (e) => {
      state.gaussianMode = e.target.value;
      renderUnifiedDashboard();
    };
  }
  if ($('#unifiedIrrStage')) {
    $('#unifiedIrrStage').onchange = (e) => {
      state.irrStageFactor = Number(e.target.value);
      renderUnifiedDashboard();
    };
  }
}

function renderBadge(status) {
  if (status === 'measured') return '<span class="src-badge src-measured">Medido</span>';
  if (status === 'estimated') return '<span class="src-badge src-estimated">Estimado externo</span>';
  return '<span class="src-badge src-missing">Faltante</span>';
}

function renderPlots() {
  if (!$('#effectiveSoilSummary')) return;
  const profile = getResolvedProfile();
  const f = profile.fields;

  $('#effectiveSoilSummary').innerHTML = `
    <div class="card">
      <h3>Perfil efectivo utilizado para recomendaciones (${profile.completenessPct}% completo)</h3>
      <p class="note">Origen activo: <b>${escHtml(profile.plotName)}</b></p>
      <ul>
        <li><b>Textura del suelo:</b> ${f.soilTexture.value ? escHtml(f.soilTexture.value) : 'No disponible'} ${renderBadge(f.soilTexture.status)} <small class="note">(${escHtml(f.soilTexture.sourceLabel)})</small></li>
        <li><b>pH del suelo:</b> ${f.ph.value != null ? f.ph.value : 'No disponible'} ${renderBadge(f.ph.status)} <small class="note">(${escHtml(f.ph.sourceLabel)})</small></li>
        <li><b>Materia orgánica:</b> ${f.organicMatter.value != null ? `${f.organicMatter.value} %` : 'No disponible'} ${renderBadge(f.organicMatter.status)} <small class="note">(${escHtml(f.organicMatter.sourceLabel)})</small></li>
        <li><b>Humedad del suelo:</b> ${f.soilMoisture.value != null ? `${f.soilMoisture.value} %` : 'No disponible'} ${renderBadge(f.soilMoisture.status)} <small class="note">(${escHtml(f.soilMoisture.sourceLabel)})</small></li>
        <li><b>Cultivos anteriores:</b> ${f.previousCrop.value ? escHtml(f.previousCrop.value) : 'No disponible'} ${renderBadge(f.previousCrop.status)} <small class="note">(${escHtml(f.previousCrop.sourceLabel)})</small></li>
        <li><b>Disponibilidad hídrica:</b> ${f.waterRegime.value ? escHtml(f.waterRegime.value) : 'No especificado'} ${renderBadge(f.waterRegime.status)} <small class="note">(${escHtml(f.waterRegime.sourceLabel)})</small></li>
      </ul>
      ${
        profile.missingImpactNotes.length
          ? `<div class="warn-box">
              <strong>⚠️ Cómo afectan los datos faltantes a la precisión:</strong>
              <ul>${profile.missingImpactNotes.map((m) => `<li><b>${m.field}:</b> ${m.impact}</li>`).join('')}</ul>
             </div>`
          : '<p class="note" style="color:#166534">✔ Perfil completo: todas las variables edáficas están cubiertas.</p>'
      }
    </div>
  `;

  const list = getPlots();
  const activeId = localStorage.getItem('agroguia.active');
  $('#plotList').innerHTML = list.length
    ? list
        .map(
          (p) => `
      <div class="card">
        <h3>${escHtml(p.name)}</h3>
        <small>
          ${p.area ? `Superficie: ${escHtml(p.area)} ha · ` : ''}Suelo: ${escHtml(p.soil || 'auto-estimar')}<br>
          pH: ${escHtml(p.ph || 'auto')} · MO: ${escHtml(p.om ? p.om + '%' : 'auto')} · Humedad: ${escHtml(p.moist ? p.moist + '%' : 'auto')}<br>
          Agua: ${escHtml(p.water || 'no especificado')} · Anteriores: ${escHtml(p.prev || 'auto')}
        </small>
        <div class="row" style="margin-top:8px">
          <button data-a="${p.id}">${p.id === activeId ? '✔ Activo' : 'Usar este perfil'}</button>
          <button data-d="${p.id}" style="background:#c0392b">Borrar</button>
        </div>
      </div>`
        )
        .join('')
    : '<p class="note">No guardaste perfiles personalizados aún; el sistema está usando automáticamente los datos satelitales y del mapa.</p>';

  $$('[data-a]').forEach((btn) => {
    btn.onclick = () => {
      localStorage.setItem('agroguia.active', btn.dataset.a);
      renderPlots();
      if (state.wx) renderUnifiedDashboard();
    };
  });

  $$('[data-d]').forEach((btn) => {
    btn.onclick = () => {
      if (localStorage.getItem('agroguia.active') === btn.dataset.d) {
        localStorage.removeItem('agroguia.active');
      }
      savePlots(getPlots().filter((p) => p.id !== btn.dataset.d));
      renderPlots();
      if (state.wx) renderUnifiedDashboard();
    };
  });
}

$('#pf').onsubmit = (e) => {
  e.preventDefault();
  const raw = Object.fromEntries(new FormData(e.target));
  const currentCount = getPlots().length + 1;
  const entry = {
    id: String(Date.now()),
    name: raw.name && raw.name.trim() ? raw.name.trim() : `Lote #${currentCount} (${state.loc.name.split(',')[0]})`,
    area: raw.area || '',
    soil: raw.soil || '',
    ph: raw.ph || '',
    om: raw.om || '',
    moist: raw.moist || '',
    water: raw.water || '',
    prev: raw.prev || ''
  };
  savePlots([...getPlots(), entry]);
  localStorage.setItem('agroguia.active', entry.id);
  e.target.reset();
  renderPlots();
  if (state.wx) renderUnifiedDashboard();
};

function setLocation(name, lat, lon) {
  state.loc = { name, lat: Number(lat), lon: Number(lon) };
  $('#lat').value = Number(lat).toFixed(4);
  $('#lon').value = Number(lon).toFixed(4);
  if (state.map) {
    state.map.setView([lat, lon], 8);
    state.marker.setLatLng([lat, lon]);
  }
  loadLocationData();
}

function initMap() {
  if (!state.map) {
    state.map = window.L.map('map').setView([state.loc.lat, state.loc.lon], 7);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(state.map);
    state.marker = window.L.marker([state.loc.lat, state.loc.lon]).addTo(state.map);
    state.map.on('click', (e) => {
      setLocation(`Punto ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`, e.latlng.lat, e.latlng.lng);
    });
  }
  setTimeout(() => state.map.invalidateSize(), 50);
}

$('#prov').innerHTML =
  '<option value="">Región de referencia…</option>' +
  Object.keys(PRESET_REGIONS)
    .map((region) => `<option value="${region}">${region}</option>`)
    .join('');

$('#prov').onchange = (e) => {
  const coords = PRESET_REGIONS[e.target.value];
  if (coords) setLocation(e.target.value, coords[0], coords[1]);
};

$('#qb').onclick = async () => {
  const query = $('#q').value.trim();
  if (!query) return;
  $('#res').innerHTML = '<div class="load">Buscando…</div>';
  try {
    const results = await searchLocations(query);
    $('#res').innerHTML = results.length
      ? `<ul class="res">${results.map((p, idx) => `<li data-i="${idx}">📍 ${escHtml(p.name)}</li>`).join('')}</ul>`
      : '<p class="note">Sin resultados.</p>';
    $$('#res li').forEach((li) => {
      li.onclick = () => {
        const chosen = results[li.dataset.i];
        setLocation(chosen.name, chosen.lat, chosen.lon);
        $('#res').innerHTML = '';
      };
    });
  } catch (err) {
    $('#res').innerHTML = `<div class="err">Error de búsqueda: ${escHtml(err.message)}</div>`;
  }
};

$('#q').onkeydown = (e) => {
  if (e.key === 'Enter') $('#qb').click();
};

$('#gps').onclick = () => {
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation('Mi ubicación', pos.coords.latitude, pos.coords.longitude),
    () => alert('No se concedió el permiso de ubicación.')
  );
};

$('#go').onclick = () => {
  const lat = parseFloat($('#lat').value);
  const lon = parseFloat($('#lon').value);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    alert('Coordenadas inválidas.');
    return;
  }
  setLocation(`Punto ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon);
};

$('#lat').value = state.loc.lat;
$('#lon').value = state.loc.lon;
renderPlots();
loadLocationData();
