import { CONFIG, PRESET_REGIONS } from './config.js';
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
import {
  t,
  getLang,
  setLang,
  getMonthNames,
  getCropName,
  translateTexture,
  translateWater,
  applyStaticTranslations
} from './i18n/translations.js';

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

const fmtVal = (val, unit, decimals = 1) => (val == null ? t('noData') : `${Number(val).toFixed(decimals)} ${unit}`);
const escHtml = (str) =>
  String(str).replace(/[&<>"]/g, (ch) => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[ch]));
const fmtWindDir = (deg) => {
  if (deg == null) return t('noData');
  const dirs = getLang() === 'es' ? ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${dirs[Math.round(deg / 45) % 8]} (${Math.round(deg)}°)`;
};

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
  $$('nav button[data-s]').forEach((btn) => btn.classList.toggle('on', btn.dataset.s === sectionId));
  if (sectionId === 'loc') initMap();
}

$$('nav button[data-s]').forEach((btn) => {
  btn.onclick = () => navigateTo(btn.dataset.s);
});

$$('[data-lang]').forEach((btn) => {
  btn.onclick = () => {
    setLang(btn.dataset.lang);
    populatePresetRegions();
    renderAll();
  };
});

if ($('#btnChangeLoc')) $('#btnChangeLoc').onclick = () => navigateTo('loc');
if ($('#heroChangeLoc')) $('#heroChangeLoc').onclick = () => navigateTo('loc');
if ($('#heroEditSoil')) $('#heroEditSoil').onclick = () => navigateTo('plots');

async function loadLocationData() {
  if (state.abortCtrl) state.abortCtrl.abort();
  state.abortCtrl = new AbortController();
  const { signal } = state.abortCtrl;

  const locDisplay = `${state.loc.name} (${state.loc.lat.toFixed(3)}, ${state.loc.lon.toFixed(3)})`;
  $('#where').textContent = `📍 ${state.loc.name}`;
  if ($('#plotActiveLoc')) $('#plotActiveLoc').textContent = locDisplay;
  $('#status').innerHTML = `<div class="load">${escHtml(t('loadingData'))}</div>`;

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
      $('#status').innerHTML = `<div class="err">${escHtml(t('weatherFetchError', { msg: wxRes.reason.message }))}</div>`;
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
    $('#status').innerHTML = `<div class="err">${escHtml(t('unexpectedError'))}: ${escHtml(err.message)}</div>`;
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
  const months = getMonthNames();
  const gCode = t('calCodeG');

  for (let i = 0; i <= durationMonths; i++) {
    cells[(s0 + i) % 12] = i === durationMonths ? 'H' : 'C';
  }
  sowMonths.forEach((m) => {
    cells[m - 1] = 'S';
  });

  return `
    <div class="tw mini-cal" style="margin-top:8px">
      <table>
        <tr>${months.map((m) => `<th>${m[0]}</th>`).join('')}</tr>
        <tr>${cells.map((code) => `<td class="${code}">${code === 'C' ? gCode : code || '·'}</td>`).join('')}</tr>
      </table>
    </div>
  `;
}

function translateTerrainClass(raw) {
  if (getLang() === 'es' || !raw) return raw;
  return {
    Llano: 'Flat',
    'Suavemente ondulado': 'Gently undulating',
    'Moderadamente inclinado': 'Moderately sloped',
    Escarpado: 'Steep'
  }[raw] || raw;
}

function translateTrend(raw) {
  if (getLang() === 'es' || !raw) return raw;
  return { 'en aumento': 'rising', 'en descenso': 'declining', estable: 'stable' }[raw] || raw;
}

function translateFrostLevel(raw) {
  if (getLang() === 'es' || !raw) return raw;
  return { bajo: 'Low', moderado: 'Moderate', alto: 'High' }[raw] || raw;
}

function renderUnifiedDashboard() {
  const el = $('#dashBody');
  if (!state.wx) {
    el.innerHTML = `<div class="err">${escHtml(t('noWeatherData'))}</div>`;
    return;
  }

  const isEn = getLang() === 'en';
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
  const cacheBadge = w.fromCache ? ` · (${t('localCache')})` : '';

  const alertsHtml = generateAlerts(w, ap)
    .map((a) => `<div class="al ${a.l}"><b>${escHtml(a.t)}</b><br>${escHtml(a.x)}</div>`)
    .join('');

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
        <strong>${escHtml(t('missingImpactHeader'))} (${profile.completenessPct}%):</strong>
        <ul>${profile.missingImpactNotes.map((m) => `<li><b>${escHtml(m.field)}:</b> ${escHtml(m.impact)}</li>`).join('')}</ul>
       </div>`
    : '';

  const frostSub = ap?.frostRisk
    ? `${t('kpiHistorical')}: ${ap.frostRisk.annualFrostDays} d/${isEn ? 'yr' : 'año'}${ap.frostRisk.peakFrostMonths.length ? ` · ${t('kpiPeak')}: ${ap.frostRisk.peakFrostMonths[0]}` : ''}`
    : '';

  const cropScapeSub = cs?.available
    ? cs.history.map((h) => `${h.year}: ${h.cropName}`).join(' · ')
    : isEn && !cs?.inCoverage
    ? 'Outside US coverage (CONUS only)'
    : cs?.reason || '';

  el.innerHTML = `
    <div class="info-banner">
      <div>
        <strong>📍 ${escHtml(state.loc.name)}</strong> · Lat ${state.loc.lat.toFixed(3)}, Lon ${state.loc.lon.toFixed(3)} · <b>${isNorth ? t('hemisphereNorth') : t('hemisphereSouth')}</b><br>
        <small class="note">
          ⛰️ ${t('altitudeSrtm')}: <b>${state.topo?.elevationMeters != null ? state.topo.elevationMeters + ' m' : t('noData')}</b>
          ${state.topo?.slopePercent != null ? `· ${t('slopeLabel')}: <b>${state.topo.slopePercent}%</b> (${translateTerrainClass(state.topo.terrainClass)})` : ''}
          · 🧪 ${t('activeProfileShort')}: <b>${escHtml(profile.plotName)}</b> (${profile.completenessPct}% ${t('completeShort')})
        </small>
      </div>
      <small class="note">${t('updatedAt')}: ${w.fetchedAt.toLocaleString(isEn ? 'en-US' : 'es-AR')}${cacheBadge}</small>
    </div>

    <div id="blk-alerts" class="dash-block">
      <div class="block-header">
        <h2>${t('blkAlertsTitle')}</h2>
        <small class="note">${t('blkAlertsSub')}</small>
      </div>
      ${alertsHtml}

      <div class="domain-title">${t('domAtmosphere')}</div>
      <div class="grid">
        ${kpi(t('kpiAirTemp'), fmtVal(c.temp, '°C'), t('kpiAirTempSub'))}
        ${kpi(t('kpiSkinTemp'), nd?.latestSkinTemp != null ? `${nd.latestSkinTemp} °C` : t('noData'), t('kpiSkinTempSub'))}
        ${kpi(t('kpiEcostress'), eco?.available ? `${eco.lstCelsius} °C` : t('kpiNoProxy'), eco?.available ? eco.stressStatus : (isEn ? 'Requires Earthdata proxy' : eco?.reason || ''))}
        ${kpi(t('kpiRadWind'), `${fmtVal(c.radiation, 'W/m²', 0)} · ${fmtVal(c.wind, 'km/h', 0)}`, `${t('kpiDirection')}: ${fmtWindDir(c.windDir)}`)}
      </div>

      <div class="domain-title">${t('domHydrology')}</div>
      <div class="grid">
        ${kpi(t('kpiRain7dRh'), `${w.daily.reduce((s, d) => s + d.rain, 0).toFixed(1)} mm · ${fmtVal(c.rh, '%', 0)}`, `${t('kpiLastHour')}: ${fmtVal(c.rain, 'mm')}`)}
        ${kpi(t('kpiAnnualRain'), nd ? `${nd.annualRainMm} mm` : t('noData'), nd ? `${t('kpiLast30d')}: ${nd.rain30dMm} mm · ${t('kpiDrySpell')}: ${nd.maxDrySpell90d}d` : '')}
        ${kpi(t('kpiSoilMoisture'), nd?.latestSoilRootPct != null ? `${t('kpiRootZone')}: ${nd.latestSoilRootPct}%` : t('noData'), nd ? `${t('kpiSurface')}: ${nd.latestSoilTopPct}% · ${t('kpiTrend')}: ${translateTrend(nd.rootTrend)}` : '')}
        ${kpi(t('kpiEt0'), fmtVal(d0.et0, 'mm'), `${t('kpi7dSum')}: ${w.daily.reduce((s, d) => s + d.et0, 0).toFixed(1)} mm`)}
      </div>

      <div class="domain-title">${t('domPhysics')}</div>
      <div class="grid">
        ${kpi(t('kpiDaylight'), ap?.photoperiod ? `${ap.photoperiod.currentDaylightHours} h/d` : t('noData'), ap?.photoperiod ? `${t('kpiAnnualRange')}: ${ap.photoperiod.minDaylightHours}–${ap.photoperiod.maxDaylightHours} h` : '')}
        ${kpi(t('kpiFrostRisk'), ap?.frostRisk ? `${t('kpiLevel')}: ${translateFrostLevel(ap.frostRisk.immediateLevel)}` : t('noData'), frostSub)}
        ${kpi(t('kpiFreezeThaw'), ap?.freezeThaw?.available ? `${ap.freezeThaw.annualFreezeThawCycles} ${t('kpiCyclesYr')}` : t('noData'), ap?.freezeThaw?.available ? `${t('kpiSubZeroDays')}: ${ap.freezeThaw.annualSubZeroDays}/yr · ${t('kpiMaxSpell')}: ${ap.freezeThaw.maxSubZeroSpellDays}d` : '')}
        ${kpi(t('kpiLandUse'), cs?.inCoverage ? (cs.available ? cs.history[0]?.cropName : t('kpiInUs')) : t('kpiOutsideUs'), cropScapeSub)}
      </div>
    </div>

    <div id="blk-gauss" class="dash-block">
      <div class="block-header">
        <h2>${t('blkGaussTitle')}</h2>
        <div class="row" style="margin:0">
          <label style="font-size:0.85rem"><b>${t('gaussianViewLabel')}</b>
            <select id="gaussModeSel">
              <option value="all_curves" ${state.gaussianMode === 'all_curves' ? 'selected' : ''}>${t('optGaussAll')}</option>
              <option value="compare_periods" ${state.gaussianMode === 'compare_periods' ? 'selected' : ''}>${t('optGaussPeriods')}</option>
              <option value="seasonal" ${state.gaussianMode === 'seasonal' ? 'selected' : ''}>${t('optGaussSeasonal')}</option>
            </select>
          </label>
        </div>
      </div>

      ${
        state.era5
          ? `<div class="card">
              <div class="cv-tall"><canvas id="cGauss"></canvas></div>
              <div id="gaussStatsPills" class="stat-pills"></div>
              <p class="note" style="margin-top:8px">${escHtml(t('gaussNote', { days: state.era5.period.totalDays, source: state.era5.source }))}</p>
            </div>`
          : `<div class="card"><p class="note">${escHtml(t('era5Unavailable'))}</p></div>`
      }

      <div class="charts">
        <div class="card"><div class="cv"><canvas id="cHydro"></canvas></div></div>
        <div class="card"><div class="cv"><canvas id="cPhysics"></canvas></div></div>
      </div>
    </div>

    <div id="blk-crops" class="dash-block">
      <div class="block-header">
        <h2>${t('blkCropsTitle')}</h2>
        <div class="row" style="margin:0">
          <label style="font-size:0.85rem"><b>${t('irrStageLabel')}</b>
            <select id="unifiedIrrStage">
              <option value="0.4" ${state.irrStageFactor === 0.4 ? 'selected' : ''}>${t('stageInitial')}</option>
              <option value="0.75" ${state.irrStageFactor === 0.75 ? 'selected' : ''}>${t('stageDev')}</option>
              <option value="1" ${state.irrStageFactor === 1 ? 'selected' : ''}>${t('stageMid')}</option>
              <option value="0.7" ${state.irrStageFactor === 0.7 ? 'selected' : ''}>${t('stageLate')}</option>
            </select>
          </label>
        </div>
      </div>

      <p class="note">
        ${escHtml(t('weightsSummary'))} <b>${isNorth ? t('hemisphereNorth') : t('hemisphereSouth')}</b> (<span class="S" style="padding:0 4px">S</span> ${t('calLegendS')}, <span class="C" style="padding:0 4px">${t('calCodeG')}</span> ${t('calLegendG')}, <span class="H" style="padding:0 4px">H</span> ${t('calLegendH')}).
      </p>
      ${missingHtml}

      <div class="grid big" style="margin-top:12px">
        ${rankedCrops
          .map(
            ({ crop, evalRes, irrRes }) => `
          <div class="card">
            <h3>${crop.i} ${escHtml(getCropName(crop))} <small class="note"><i>(${crop.scientific})</i></small></h3>
            <span class="tag ${evalRes.classification.badge === 'warn-orange' ? 'mid' : evalRes.classification.badge}">${escHtml(evalRes.classification.label)}</span>
            <b>${evalRes.score}/100</b>
            ${renderScoreBar(evalRes.score)}
            ${evalRes.cappedByLiebig ? `<p class="note">${escHtml(t('liebigCapNote'))}</p>` : ''}

            ${
              evalRes.advantages.length
                ? `<p style="margin:6px 0 2px;font-size:0.86rem"><b>${escHtml(t('advantagesTitle'))}</b></p><ul style="font-size:0.84rem;margin:2px 0 6px 18px">${evalRes.advantages
                    .slice(0, 3)
                    .map((a) => `<li>${escHtml(a)}</li>`)
                    .join('')}</ul>`
                : ''
            }

            ${
              evalRes.limitingFactors.length
                ? `<p style="margin:6px 0 2px;font-size:0.86rem;color:#8a1f13"><b>${escHtml(t('limitingTitle'))}</b></p><ul style="font-size:0.84rem;margin:2px 0 6px 18px">${evalRes.limitingFactors
                    .map((lf) => `<li>${escHtml(lf)}</li>`)
                    .join('')}</ul>`
                : ''
            }

            <div class="irr-box">
              <b>${escHtml(t('irr7dTitle'))}</b> <span class="tag ${irrRes.l}" style="font-size:0.72rem">${escHtml(irrRes.t)}</span>
              <div class="note" style="margin-top:4px">${escHtml(irrRes.why[0])} ${escHtml(irrRes.why[1])}</div>
            </div>

            ${buildInlineCalendarTable(crop, state.loc.lat)}

            <details style="margin-top:8px">
              <summary style="cursor:pointer;font-size:0.83rem;color:#1f4d2b">${escHtml(t('auditSummary', { count: evalRes.criteria.length }))}</summary>
              <ul style="font-size:0.8rem;margin-top:6px">
                ${evalRes.criteria
                  .map((cr) => `<li><b>${escHtml(cr.label)}</b> [${t('weightWord')} ${cr.weight}% · ${t('scoreWord')} ${cr.score}/100]: ${escHtml(cr.detail)}</li>`)
                  .join('')}
              </ul>
            </details>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  if (state.era5) {
    const gResult = renderGaussianChart($('#cGauss'), state.charts, state.era5, state.gaussianMode);
    if (gResult && $('#gaussStatsPills')) {
      $('#gaussStatsPills').innerHTML = gResult.curves
        .map(
          (cv) => `
          <div class="stat-pill" style="border-left:4px solid ${cv.color}">
            <b>${escHtml(cv.label)}:</b> ${t('statMean')} = <b>${cv.stats.mean} °C</b> · ${t('statStd')} = <b>${cv.stats.std} °C</b> · ${t('statRange68')} (${cv.stats.minus1Sigma} to ${cv.stats.plus1Sigma} °C) · ${t('statExtremes')}: <b>${cv.stats.min} °C</b> / <b>${cv.stats.max} °C</b>
          </div>`
        )
        .join('');
    }
  }

  renderAnnualHydrologyChart($('#cHydro'), state.charts, state.era5, state.clim);
  renderAgroPhysicsChart($('#cPhysics'), state.charts, state.agroPhysics);

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
  if (status === 'measured') return `<span class="src-badge src-measured">${t('badgeMeasured')}</span>`;
  if (status === 'estimated') return `<span class="src-badge src-estimated">${t('badgeEstimated')}</span>`;
  return `<span class="src-badge src-missing">${t('badgeMissing')}</span>`;
}

function renderPlots() {
  if (!$('#effectiveSoilSummary')) return;
  const profile = getResolvedProfile();
  const f = profile.fields;

  $('#effectiveSoilSummary').innerHTML = `
    <div class="card">
      <h3>${escHtml(t('effectiveProfileTitle', { pct: profile.completenessPct }))}</h3>
      <p class="note">${t('activeOrigin')} <b>${escHtml(profile.plotName)}</b></p>
      <ul>
        <li><b>${t('fieldTexture')}:</b> ${f.soilTexture.value ? escHtml(translateTexture(f.soilTexture.value)) : t('notAvailable')} ${renderBadge(f.soilTexture.status)} <small class="note">(${escHtml(f.soilTexture.sourceLabel)})</small></li>
        <li><b>${t('fieldPh')}:</b> ${f.ph.value != null ? f.ph.value : t('notAvailable')} ${renderBadge(f.ph.status)} <small class="note">(${escHtml(f.ph.sourceLabel)})</small></li>
        <li><b>${t('fieldOm')}:</b> ${f.organicMatter.value != null ? `${f.organicMatter.value} %` : t('notAvailable')} ${renderBadge(f.organicMatter.status)} <small class="note">(${escHtml(f.organicMatter.sourceLabel)})</small></li>
        <li><b>${t('fieldMoisture')}:</b> ${f.soilMoisture.value != null ? `${f.soilMoisture.value} %` : t('notAvailable')} ${renderBadge(f.soilMoisture.status)} <small class="note">(${escHtml(f.soilMoisture.sourceLabel)})</small></li>
        <li><b>${t('fieldPrevCrop')}:</b> ${f.previousCrop.value ? escHtml(f.previousCrop.value) : t('notAvailable')} ${renderBadge(f.previousCrop.status)} <small class="note">(${escHtml(f.previousCrop.sourceLabel)})</small></li>
        <li><b>${t('fieldWater')}:</b> ${f.waterRegime.value ? escHtml(translateWater(f.waterRegime.value)) : t('notSpecified')} ${renderBadge(f.waterRegime.status)} <small class="note">(${escHtml(f.waterRegime.sourceLabel)})</small></li>
      </ul>
      ${
        profile.missingImpactNotes.length
          ? `<div class="warn-box">
              <strong>${escHtml(t('missingImpactHeader'))}</strong>
              <ul>${profile.missingImpactNotes.map((m) => `<li><b>${escHtml(m.field)}:</b> ${escHtml(m.impact)}</li>`).join('')}</ul>
             </div>`
          : `<p class="note" style="color:#166534">${escHtml(t('profileCompleteMsg'))}</p>`
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
          ${p.area ? `${t('lblArea')}: ${escHtml(p.area)} ha · ` : ''}${t('fieldTexture')}: ${escHtml(p.soil ? translateTexture(p.soil) : 'auto')}<br>
          pH: ${escHtml(p.ph || 'auto')} · OM: ${escHtml(p.om ? p.om + '%' : 'auto')} · Moisture: ${escHtml(p.moist ? p.moist + '%' : 'auto')}<br>
          ${t('fieldWater')}: ${escHtml(p.water ? translateWater(p.water) : t('notSpecified'))} · ${t('fieldPrevCrop')}: ${escHtml(p.prev || 'auto')}
        </small>
        <div class="row" style="margin-top:8px">
          <button data-a="${p.id}">${p.id === activeId ? t('btnActiveProfile') : t('btnUseProfile')}</button>
          <button data-d="${p.id}" style="background:#c0392b">${t('btnDelete')}</button>
        </div>
      </div>`
        )
        .join('')
    : `<p class="note">${escHtml(t('savedProfilesEmpty'))}</p>`;

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
    name: raw.name && raw.name.trim() ? raw.name.trim() : `Plot #${currentCount} (${state.loc.name.split(',')[0]})`,
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
      setLocation(`Point ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`, e.latlng.lat, e.latlng.lng);
    });
  }
  setTimeout(() => state.map.invalidateSize(), 50);
}

function populatePresetRegions() {
  $('#prov').innerHTML =
    `<option value="">${escHtml(t('presetDefault'))}</option>` +
    Object.keys(PRESET_REGIONS)
      .map((region) => `<option value="${region}">${region}</option>`)
      .join('');
}

$('#prov').onchange = (e) => {
  const coords = PRESET_REGIONS[e.target.value];
  if (coords) setLocation(e.target.value, coords[0], coords[1]);
};

$('#qb').onclick = async () => {
  const query = $('#q').value.trim();
  if (!query) return;
  $('#res').innerHTML = `<div class="load">${escHtml(t('searching'))}</div>`;
  try {
    const results = await searchLocations(query);
    $('#res').innerHTML = results.length
      ? `<ul class="res">${results.map((p, idx) => `<li data-i="${idx}">📍 ${escHtml(p.name)}</li>`).join('')}</ul>`
      : `<p class="note">${escHtml(t('noResults'))}</p>`;
    $$('#res li').forEach((li) => {
      li.onclick = () => {
        const chosen = results[li.dataset.i];
        setLocation(chosen.name, chosen.lat, chosen.lon);
        $('#res').innerHTML = '';
      };
    });
  } catch (err) {
    $('#res').innerHTML = `<div class="err">${escHtml(t('searchError'))}: ${escHtml(err.message)}</div>`;
  }
};

$('#q').onkeydown = (e) => {
  if (e.key === 'Enter') $('#qb').click();
};

$('#gps').onclick = () => {
  if (!navigator.geolocation) {
    alert(t('geoUnsupported'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation(t('myLocation'), pos.coords.latitude, pos.coords.longitude),
    () => alert(t('geoDenied'))
  );
};

$('#go').onclick = () => {
  const lat = parseFloat($('#lat').value);
  const lon = parseFloat($('#lon').value);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    alert(t('invalidCoords'));
    return;
  }
  setLocation(`Point ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon);
};

// Inicialización con idioma Inglés por defecto (o preferencia guardada)
applyStaticTranslations();
populatePresetRegions();
$('#lat').value = state.loc.lat;
$('#lon').value = state.loc.lon;
renderPlots();
loadLocationData();
