<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgroGuía</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌱</text></svg>">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css">
  <link rel="stylesheet" href="./css/styles.css">
</head>
<body>
  <nav>
    <div class="brand">🌱 AgroGuía</div>
    <button data-s="dash" class="on">📊 Panel</button>
    <button data-s="loc">📍 Ubicación</button>
    <button data-s="crops">🌾 ¿Qué plantar?</button>
    <button data-s="cal">📅 Calendario</button>
    <button data-s="plots">🧪 Suelo y Lote</button>
    <button data-s="irr">💧 Riego</button>
    <button data-s="alerts">⚠️ Alertas</button>
    <small id="where"></small>
  </nav>

  <main>
    <section id="dash" class="on">
      <div class="hero">
        <h1>🌱 AgroGuía</h1>
        <p>Decisiones agrícolas con datos meteorológicos, climáticos y satelitales reales.</p>
      </div>
      <div id="status"></div>
      <div id="dashBody"></div>
    </section>

    <section id="loc">
      <h2>Ubicación geográfica</h2>
      <div class="card">
        <div class="row">
          <input id="q" placeholder="Buscar localidad o región…">
          <button id="qb">Buscar</button>
          <button id="gps">Usar mi ubicación</button>
          <select id="prov"></select>
        </div>
        <div id="res"></div>
        <div class="row">
          <label>Lat <input id="lat" size="9"></label>
          <label>Lon <input id="lon" size="9"></label>
          <button id="go">Consultar</button>
        </div>
      </div>
      <div id="map"></div>
      <p class="note">Hacé clic en el mapa para elegir el punto exacto de análisis.</p>
    </section>

    <section id="crops">
      <h2>¿Qué puedo plantar?</h2>
      <div id="cropsBody"></div>
    </section>

    <section id="cal">
      <h2>Calendario agrícola</h2>
      <div class="row">
        <select id="calCrop"></select>
      </div>
      <div id="calBody"></div>
    </section>

    <section id="plots">
      <h2>Características del terreno y suelo</h2>
      <div class="info-banner">
        <div>
          <strong>📍 Ubicación vinculada:</strong> <span id="plotActiveLoc">San Luis, Argentina</span>
          <div class="note">Todos los campos abajo son opcionales. Si no conocés un dato, usaremos estimaciones satelitales o evaluaremos con las variables disponibles.</div>
        </div>
        <button type="button" class="secondary" id="btnChangeLoc">Cambiar en mapa</button>
      </div>

      <div class="card">
        <form id="pf" class="grid">
          <div class="field-group">
            <label>Identificador del lote <span class="opt-tag">(opcional)</span></label>
            <input name="name" placeholder="Ej: Lote Norte (auto si vacío)">
          </div>

          <div class="field-group">
            <label>Superficie (ha) <span class="opt-tag">(opcional)</span></label>
            <input name="area" type="number" step="any" min="0" placeholder="Ej: 25">
          </div>

          <div class="field-group">
            <label>Textura del suelo <span class="opt-tag">(opcional)</span></label>
            <select name="soil">
              <option value="">No lo sé (auto-estimar)</option>
              <option value="franco">Franco</option>
              <option value="franco-arenoso">Franco-arenoso</option>
              <option value="arenoso">Arenoso</option>
              <option value="arcilloso">Arcilloso</option>
            </select>
          </div>

          <div class="field-group">
            <label>pH del suelo <span class="opt-tag">(opcional)</span></label>
            <input name="ph" type="number" step="0.1" min="3" max="11" placeholder="Ej: 6.5">
          </div>

          <div class="field-group">
            <label>Materia orgánica (%) <span class="opt-tag">(opcional)</span></label>
            <input name="om" type="number" step="0.1" min="0" max="100" placeholder="Ej: 2.8">
          </div>

          <div class="field-group">
            <label>Humedad del suelo (%) <span class="opt-tag">(opcional)</span></label>
            <input name="moist" type="number" step="any" min="0" max="100" placeholder="Ej: 22">
          </div>

          <div class="field-group">
            <label>Disponibilidad hídrica <span class="opt-tag">(opcional)</span></label>
            <select name="water">
              <option value="">No especificado</option>
              <option value="riego">Con riego</option>
              <option value="secano">Solo lluvia (secano)</option>
              <option value="escasa">Agua escasa</option>
            </select>
          </div>

          <div class="field-group">
            <label>Cultivos anteriores <span class="opt-tag">(opcional)</span></label>
            <input name="prev" placeholder="Ej: Maíz, Soja">
          </div>

          <div class="field-group" style="justify-content: flex-end;">
            <button type="submit">Guardar configuración</button>
          </div>
        </form>
      </div>

      <div id="effectiveSoilSummary"></div>
      <div id="plotList" class="grid"></div>
    </section>

    <section id="irr">
      <h2>Recomendaciones de riego</h2>
      <div class="row">
        <select id="irrCrop"></select>
        <select id="irrStage">
          <option value=".4">Inicial</option>
          <option value=".75" selected>Desarrollo</option>
          <option value="1">Media (floración)</option>
          <option value=".7">Final</option>
        </select>
      </div>
      <div id="irrBody"></div>
    </section>

    <section id="alerts">
      <h2>Alertas y riesgos</h2>
      <div id="alertBody"></div>
    </section>

    <footer>
      Datos: Open-Meteo (ERA5/SRTM) · NASA POWER (GPM/SMAP) · ISRIC SoilGrids · USDA · OpenStreetMap. Información orientativa; no garantiza rendimientos.
    </footer>
  </main>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
