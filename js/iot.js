// ===== IoT LIVE EMISSIONS MONITORING MODULE =====
// Real-time environmental monitoring + simulated A5 construction vehicle transport emissions
// Uses OpenWeatherMap Air Pollution API for live air quality data
// Coordinates: Project site area (24.96°N, 46.70°E)

const IOT_CONFIG = {
  lat: 24.96,
  lon: 46.70,
  // OpenWeatherMap free tier Air Pollution API
  apiBase: 'https://api.openweathermap.org/data/2.5/air_pollution',
  apiKey: '', // Set via setIoTApiKey() or prompt in UI
  refreshInterval: 120000, // 2 minutes
  localStorageKey: 'ct_owm_api_key'
};

// AQI level labels per OpenWeatherMap scale (1–5)
const AQI_LEVELS = [
  { level: 1, label: 'Good', color: 'var(--green)', bg: 'rgba(52,211,153,0.12)' },
  { level: 2, label: 'Fair', color: 'var(--cyan)', bg: 'rgba(34,211,238,0.12)' },
  { level: 3, label: 'Moderate', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)' },
  { level: 4, label: 'Poor', color: 'var(--orange)', bg: 'rgba(251,146,60,0.12)' },
  { level: 5, label: 'Very Poor', color: 'var(--red)', bg: 'rgba(248,113,113,0.12)' }
];

// Pollutant thresholds for gauge rendering (WHO guideline reference values in µg/m³)
const POLLUTANT_META = {
  pm2_5: { label: 'PM2.5', unit: 'µg/m³', who: 15, max: 150, color: 'var(--red)', icon: '🫁' },
  pm10:  { label: 'PM10',  unit: 'µg/m³', who: 45, max: 300, color: 'var(--orange)', icon: '🌫️' },
  co:    { label: 'CO',    unit: 'µg/m³', who: 4000, max: 20000, color: 'var(--slate3)', icon: '💨' },
  no2:   { label: 'NO₂',   unit: 'µg/m³', who: 25, max: 200, color: 'var(--purple)', icon: '🏭' },
  so2:   { label: 'SO₂',   unit: 'µg/m³', who: 40, max: 350, color: 'var(--yellow)', icon: '⚗️' },
  o3:    { label: 'O₃',    unit: 'µg/m³', who: 100, max: 300, color: 'var(--cyan)', icon: '☀️' }
};

// Simulated A5 construction vehicle fleet — trucks transporting materials to site
const VEHICLE_FLEET = [
  { id: 'V-01', type: 'Concrete Mixer', material: 'Concrete', capacity: 8, unit: 'm³', fuelType: 'Diesel', fuelRate: 0.35, routeKm: 42, supplier: 'Saudi Readymix', massFactor: 2400 },
  { id: 'V-02', type: 'Flatbed Trailer', material: 'Steel Rebar', capacity: 25000, unit: 'kg', fuelType: 'Diesel', fuelRate: 0.28, routeKm: 67, supplier: 'SABIC Steel', massFactor: 1 },
  { id: 'V-03', type: 'Dump Truck', material: 'Asphalt', capacity: 18, unit: 'tons', fuelType: 'Diesel', fuelRate: 0.42, routeKm: 35, supplier: 'Saudi Asphalt Co', massFactor: 1000 },
  { id: 'V-04', type: 'Tanker Truck', material: 'Water', capacity: 20, unit: 'm³', fuelType: 'Diesel', fuelRate: 0.31, routeKm: 28, supplier: 'NWC Supply', massFactor: 1000 },
  { id: 'V-05', type: 'Concrete Mixer', material: 'Concrete', capacity: 10, unit: 'm³', fuelType: 'Diesel', fuelRate: 0.38, routeKm: 55, supplier: 'Yamama Cement', massFactor: 2400 },
  { id: 'V-06', type: 'Lowbed Trailer', material: 'Steel Beams', capacity: 30000, unit: 'kg', fuelType: 'Diesel', fuelRate: 0.32, routeKm: 82, supplier: 'Rajhi Steel', massFactor: 1 },
  { id: 'V-07', type: 'Tipper Truck', material: 'Aggregate', capacity: 16, unit: 'tons', fuelType: 'Diesel', fuelRate: 0.39, routeKm: 22, supplier: 'Riyadh Quarry', massFactor: 1000 },
  { id: 'V-08', type: 'Flatbed Trailer', material: 'Glass Panels', capacity: 8000, unit: 'kg', fuelType: 'Diesel', fuelRate: 0.25, routeKm: 95, supplier: 'Obeikan Glass', massFactor: 1 }
];

// Diesel emission factor (kgCO₂e/L) — consistent with A5_EFS in data.js
const DIESEL_EF = 2.51;

// Module state
let _iotInterval = null;
let _iotData = { aqi: null, pollutants: null, timestamp: null, error: null };
let _iotVehicles = [];
let _iotHistory = [];

// ===== API KEY MANAGEMENT =====
function getIoTApiKey() {
  return IOT_CONFIG.apiKey || localStorage.getItem(IOT_CONFIG.localStorageKey) || '';
}

function setIoTApiKey(key) {
  IOT_CONFIG.apiKey = key;
  localStorage.setItem(IOT_CONFIG.localStorageKey, key);
}

// ===== FETCH LIVE AIR QUALITY =====
async function fetchAirQuality() {
  const key = getIoTApiKey();
  if (!key) {
    _iotData.error = 'API key required';
    return null;
  }
  try {
    const url = `${IOT_CONFIG.apiBase}?lat=${IOT_CONFIG.lat}&lon=${IOT_CONFIG.lon}&appid=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) {
        _iotData.error = 'Invalid API key';
      } else {
        _iotData.error = `API error (HTTP ${res.status})`;
      }
      return null;
    }
    const data = await res.json();
    if (data.list && data.list.length > 0) {
      const reading = data.list[0];
      _iotData = {
        aqi: reading.main.aqi,
        pollutants: reading.components,
        timestamp: new Date(reading.dt * 1000),
        error: null
      };
      // Push to history (keep last 30 readings)
      _iotHistory.push({
        time: _iotData.timestamp,
        aqi: _iotData.aqi,
        pm25: reading.components.pm2_5,
        pm10: reading.components.pm10,
        co: reading.components.co,
        no2: reading.components.no2
      });
      if (_iotHistory.length > 30) _iotHistory.shift();
      return _iotData;
    }
    _iotData.error = 'No data available';
    return null;
  } catch (e) {
    _iotData.error = 'Network error: ' + e.message;
    return null;
  }
}

// ===== SIMULATE VEHICLE TRANSPORT =====
function simulateVehicleTrips() {
  const now = new Date();
  const hour = now.getHours();
  // Simulate active construction hours (6 AM – 6 PM) with higher activity
  const activityFactor = (hour >= 6 && hour < 18) ? 1.0 : 0.15;

  _iotVehicles = VEHICLE_FLEET.map(v => {
    // Randomize trip status
    const rand = Math.random();
    const isActive = rand < (0.6 * activityFactor);
    const status = isActive ? (rand < 0.3 ? 'en-route' : (rand < 0.5 ? 'loading' : 'returning')) : 'idle';

    // Simulate load percentage
    const loadPct = status === 'idle' ? 0 : (status === 'loading' ? Math.random() * 0.4 : 0.5 + Math.random() * 0.5);

    // Calculate per-trip transport emission
    const massKg = v.capacity * v.massFactor * loadPct;
    const distKm = v.routeKm * (status === 'returning' ? 1 : (0.3 + Math.random() * 0.7));
    const fuelL = distKm * v.fuelRate;
    const emissionKg = fuelL * DIESEL_EF;
    // Also calculate A4 transport emission (tkm method from TEF)
    const tkmEmission = (massKg * distKm * TEF.road) / 1000; // tCO₂

    // Daily trip count simulation
    const tripsToday = isActive ? Math.floor(2 + Math.random() * 6) : 0;
    const dailyEmission = tripsToday * emissionKg;

    return {
      ...v,
      status,
      loadPct,
      distKm: Math.round(distKm * 10) / 10,
      fuelL: Math.round(fuelL * 100) / 100,
      emissionKg: Math.round(emissionKg * 100) / 100,
      tkmEmission: Math.round(tkmEmission * 1000) / 1000,
      tripsToday,
      dailyEmissionKg: Math.round(dailyEmission * 100) / 100,
      lastUpdate: now
    };
  });

  return _iotVehicles;
}

// ===== AGGREGATE STATS =====
function getIoTSummary() {
  const vehicles = _iotVehicles.length ? _iotVehicles : simulateVehicleTrips();
  const active = vehicles.filter(v => v.status !== 'idle');
  const totalDailyKg = vehicles.reduce((s, v) => s + v.dailyEmissionKg, 0);
  const totalTrips = vehicles.reduce((s, v) => s + v.tripsToday, 0);
  const totalFuel = vehicles.reduce((s, v) => s + (v.fuelL * v.tripsToday), 0);
  const totalTkm = vehicles.reduce((s, v) => s + (v.tkmEmission * v.tripsToday), 0);

  return {
    activeVehicles: active.length,
    totalVehicles: vehicles.length,
    totalDailyKg,
    totalDailyTon: totalDailyKg / 1000,
    totalTrips,
    totalFuelL: Math.round(totalFuel * 100) / 100,
    totalTkmTon: Math.round(totalTkm * 1000) / 1000,
    aqi: _iotData.aqi,
    aqiLabel: _iotData.aqi ? AQI_LEVELS[_iotData.aqi - 1]?.label : '--',
    pollutants: _iotData.pollutants,
    timestamp: _iotData.timestamp,
    error: _iotData.error
  };
}

// ===== BUILD AQI GAUGE SVG =====
function buildAqiGauge(aqi) {
  if (!aqi) return '<div class="iot-gauge-empty">No data</div>';
  const level = AQI_LEVELS[aqi - 1] || AQI_LEVELS[2];
  const pct = (aqi / 5) * 100;
  const angle = -90 + (pct / 100) * 180;
  const r = 60, cx = 70, cy = 70;
  // Draw arc from -90° to angle
  const startX = cx + r * Math.cos(-90 * Math.PI / 180);
  const startY = cy + r * Math.sin(-90 * Math.PI / 180);
  const endX = cx + r * Math.cos(angle * Math.PI / 180);
  const endY = cy + r * Math.sin(angle * Math.PI / 180);
  const largeArc = (angle - (-90)) > 180 ? 1 : 0;

  return `<svg viewBox="0 0 140 90" class="iot-aqi-gauge">
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--bg3)" stroke-width="10" stroke-linecap="round"/>
    <path d="M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${level.color}" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${level.color}" font-size="28" font-weight="800" font-family="system-ui">${aqi}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="${level.color}" font-size="10" font-weight="700" font-family="system-ui" opacity="0.8">${level.label}</text>
  </svg>`;
}

// ===== BUILD POLLUTANT BAR =====
function buildPollutantBar(key, value) {
  const meta = POLLUTANT_META[key];
  if (!meta) return '';
  const pct = Math.min((value / meta.max) * 100, 100);
  const whoLine = Math.min((meta.who / meta.max) * 100, 100);
  const exceeds = value > meta.who;
  const valColor = exceeds ? 'var(--red)' : 'var(--green)';
  return `<div class="iot-pollutant-row">
    <div class="iot-poll-label"><span class="iot-poll-icon">${meta.icon}</span> ${meta.label}</div>
    <div class="iot-poll-bar-wrap">
      <div class="iot-poll-bar-bg">
        <div class="iot-poll-bar-fill" style="width:${pct}%;background:${meta.color};opacity:${exceeds ? 0.8 : 0.5}"></div>
        <div class="iot-poll-who-line" style="left:${whoLine}%" title="WHO Guideline: ${meta.who} ${meta.unit}"></div>
      </div>
      <div class="iot-poll-value" style="color:${valColor}">${value.toFixed(1)} <span class="iot-poll-unit">${meta.unit}</span></div>
    </div>
  </div>`;
}

// ===== BUILD HISTORY SPARKLINE =====
function buildIoTSparkline(data, key, color) {
  if (!data || data.length < 2) return '<div style="font-size:10px;color:var(--slate5);padding:8px">Collecting data...</div>';
  const vals = data.map(d => d[key] || 0);
  const mx = Math.max(...vals, 1);
  const w = 200, h = 40;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (w - 8) + 4;
    const y = h - 4 - ((v / mx) * (h - 8));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px">
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
    <circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="3" fill="${color}" opacity="0.9"/>
  </svg>`;
}

// ===== VEHICLE STATUS BADGE =====
function vehicleStatusBadge(status) {
  const map = {
    'en-route': { color: 'var(--green)', bg: 'rgba(52,211,153,0.12)', icon: '🚛' },
    'loading': { color: 'var(--blue)', bg: 'rgba(96,165,250,0.12)', icon: '📦' },
    'returning': { color: 'var(--cyan)', bg: 'rgba(34,211,238,0.12)', icon: '↩️' },
    'idle': { color: 'var(--slate5)', bg: 'rgba(100,116,139,0.12)', icon: '⏸️' }
  };
  const s = map[status] || map['idle'];
  return `<span class="iot-vstatus" style="background:${s.bg};color:${s.color}">${s.icon} ${status}</span>`;
}

// ===== RENDER IOT MONITOR PAGE =====
function renderIoTMonitor(el) {
  const key = getIoTApiKey();
  const summary = getIoTSummary();
  const hasKey = !!key;
  const hasData = !!summary.aqi;

  el.innerHTML = `
  ${!hasKey ? `<div class="card" style="border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.03)">
    <div class="card-title">API Configuration Required</div>
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
      <div style="font-size:28px">🔑</div>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text2);line-height:1.6">
          This module uses the <strong style="color:var(--green)">OpenWeatherMap Air Pollution API</strong> (free tier) for real-time environmental data from the project site coordinates.<br>
          <span style="color:var(--slate5);font-size:11px">1. Sign up free at <strong>openweathermap.org</strong> &nbsp; 2. Copy your API key &nbsp; 3. Paste below</span>
        </div>
      </div>
    </div>
    <div class="form-row c2" style="max-width:600px">
      <div class="fg"><label>API Key</label><input type="text" id="iotApiKeyInput" placeholder="Paste your OpenWeatherMap API key" value="${key}" /></div>
      <div class="fg" style="display:flex;align-items:flex-end"><button class="btn btn-primary" onclick="saveIoTKey()">Connect & Start Monitoring</button></div>
    </div>
  </div>` : ''}

  <div class="iot-live-header">
    <div class="iot-live-dot${hasData ? ' active' : ''}"></div>
    <span class="iot-live-label">${hasData ? 'LIVE' : 'OFFLINE'}</span>
    <span class="iot-live-ts">${summary.timestamp ? summary.timestamp.toLocaleTimeString() : '--:--:--'}</span>
    <span class="iot-live-coord">📍 ${IOT_CONFIG.lat}°N, ${IOT_CONFIG.lon}°E</span>
    ${hasKey ? `<button class="btn btn-sm btn-secondary" onclick="refreshIoT()" style="margin-left:auto;font-size:10px;padding:5px 12px">↻ Refresh</button>` : ''}
  </div>

  ${summary.error && hasKey ? `<div style="padding:10px 14px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--red)">⚠️ ${summary.error}</div>` : ''}

  <!-- TOP STAT CARDS -->
  <div class="stats-row" style="grid-template-columns:repeat(5,1fr)">
    <div class="stat-card ${summary.aqi && summary.aqi <= 2 ? 'green' : summary.aqi && summary.aqi <= 3 ? 'orange' : summary.aqi ? 'purple' : 'slate'}">
      <div class="sc-label">Air Quality Index</div>
      <div class="sc-value">${summary.aqi || '--'}</div>
      <div class="sc-sub">${summary.aqiLabel}</div>
    </div>
    <div class="stat-card cyan">
      <div class="sc-label">Active Vehicles</div>
      <div class="sc-value">${summary.activeVehicles}/${summary.totalVehicles}</div>
      <div class="sc-sub">On-site fleet</div>
    </div>
    <div class="stat-card orange">
      <div class="sc-label">Daily Transport CO₂</div>
      <div class="sc-value">${fmt(summary.totalDailyTon)}</div>
      <div class="sc-sub">tCO₂eq today</div>
    </div>
    <div class="stat-card blue">
      <div class="sc-label">Total Trips</div>
      <div class="sc-value">${summary.totalTrips}</div>
      <div class="sc-sub">Vehicle movements</div>
    </div>
    <div class="stat-card green">
      <div class="sc-label">Fuel Consumed</div>
      <div class="sc-value">${fmtI(summary.totalFuelL)}</div>
      <div class="sc-sub">Litres diesel</div>
    </div>
  </div>

  <!-- TWO-COLUMN: AQI + POLLUTANTS -->
  <div class="iot-grid-2col">
    <div class="card">
      <div class="card-title">Real-Time Air Quality — Project Site</div>
      <div class="iot-aqi-section">
        ${buildAqiGauge(summary.aqi)}
        <div class="iot-aqi-details">
          <div class="iot-aqi-detail-row"><span>PM2.5</span><strong style="color:${summary.pollutants && summary.pollutants.pm2_5 > 15 ? 'var(--red)' : 'var(--green)'}">${summary.pollutants ? summary.pollutants.pm2_5.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>PM10</span><strong style="color:${summary.pollutants && summary.pollutants.pm10 > 45 ? 'var(--red)' : 'var(--green)'}">${summary.pollutants ? summary.pollutants.pm10.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>CO</span><strong>${summary.pollutants ? summary.pollutants.co.toFixed(0) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>NO₂</span><strong>${summary.pollutants ? summary.pollutants.no2.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>O₃</span><strong>${summary.pollutants ? summary.pollutants.o3.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>SO₂</span><strong>${summary.pollutants ? summary.pollutants.so2.toFixed(1) : '--'} µg/m³</strong></div>
        </div>
      </div>
      <div style="margin-top:14px;font-size:9px;color:var(--slate5)">Source: OpenWeatherMap Air Pollution API • WHO guideline thresholds shown</div>
    </div>

    <div class="card">
      <div class="card-title">Pollutant Levels vs WHO Guidelines</div>
      <div class="iot-pollutant-bars" id="iotPollBars">
        ${summary.pollutants ? Object.keys(POLLUTANT_META).map(k => buildPollutantBar(k, summary.pollutants[k] || 0)).join('') : '<div class="empty" style="padding:30px"><div class="empty-icon">📡</div>Awaiting sensor data...</div>'}
      </div>
    </div>
  </div>

  <!-- TREND SPARKLINES -->
  <div class="card">
    <div class="card-title">Monitoring Trend — Recent Readings</div>
    <div class="iot-sparkline-grid">
      <div class="iot-sparkline-item">
        <div class="iot-sparkline-label">PM2.5</div>
        ${buildIoTSparkline(_iotHistory, 'pm25', 'var(--red)')}
      </div>
      <div class="iot-sparkline-item">
        <div class="iot-sparkline-label">PM10</div>
        ${buildIoTSparkline(_iotHistory, 'pm10', 'var(--orange)')}
      </div>
      <div class="iot-sparkline-item">
        <div class="iot-sparkline-label">CO</div>
        ${buildIoTSparkline(_iotHistory, 'co', 'var(--slate3)')}
      </div>
      <div class="iot-sparkline-item">
        <div class="iot-sparkline-label">NO₂</div>
        ${buildIoTSparkline(_iotHistory, 'no2', 'var(--purple)')}
      </div>
    </div>
  </div>

  <!-- VEHICLE FLEET TABLE -->
  <div class="card">
    <div class="card-title">A5 Construction Vehicle Fleet — Live Transport Emissions</div>
    <div style="font-size:11px;color:var(--slate5);margin:-8px 0 12px 0">Simulated fleet tracking • Emissions calculated using ECCS A4/A5 methodology (TEF road = ${TEF.road} kgCO₂/tkm, Diesel EF = ${DIESEL_EF} kgCO₂e/L)</div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Vehicle</th>
            <th>Material</th>
            <th>Supplier</th>
            <th>Status</th>
            <th class="r">Load</th>
            <th class="r">Dist (km)</th>
            <th class="r">Fuel (L)</th>
            <th class="r">CO₂ (kg)</th>
            <th class="r">Trips</th>
            <th class="r">Daily CO₂</th>
          </tr>
        </thead>
        <tbody id="iotFleetTbl">
          ${_iotVehicles.length ? _iotVehicles.map(v => `<tr>
            <td style="font-weight:700;color:var(--cyan);font-size:11px">${v.id}</td>
            <td style="font-size:11px">${v.type}</td>
            <td style="font-weight:600;font-size:11px">${v.material}</td>
            <td style="font-size:10px;color:var(--slate5)">${v.supplier}</td>
            <td>${vehicleStatusBadge(v.status)}</td>
            <td class="r mono" style="font-size:11px">${(v.loadPct * 100).toFixed(0)}%</td>
            <td class="r mono" style="font-size:11px">${v.distKm}</td>
            <td class="r mono" style="font-size:11px">${v.fuelL}</td>
            <td class="r mono" style="font-size:11px;font-weight:700;color:var(--orange)">${v.emissionKg}</td>
            <td class="r mono" style="font-size:11px">${v.tripsToday}</td>
            <td class="r mono" style="font-size:11px;font-weight:700;color:var(--red)">${fmt(v.dailyEmissionKg / 1000)} t</td>
          </tr>`).join('') : '<tr><td colspan="11" class="empty">Initializing fleet data...</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <!-- COMBINED EMISSIONS SUMMARY -->
  <div class="card">
    <div class="card-title">Combined Emissions Overview — Construction + Environmental</div>
    <div class="iot-combined-grid">
      <div class="iot-combined-block">
        <div class="iot-cb-icon">🏗️</div>
        <div class="iot-cb-title">Construction Phase (A5)</div>
        <div class="iot-cb-desc">Vehicle transport + on-site fuel</div>
        <div class="iot-cb-value" style="color:var(--orange)">${fmt(summary.totalDailyTon)} <span>tCO₂/day</span></div>
        <div class="iot-cb-sub">${summary.totalTrips} trips • ${fmtI(summary.totalFuelL)} L diesel</div>
      </div>
      <div class="iot-combined-block">
        <div class="iot-cb-icon">🌍</div>
        <div class="iot-cb-title">Environmental Baseline</div>
        <div class="iot-cb-desc">Ambient air quality at project site</div>
        <div class="iot-cb-value" style="color:${summary.aqi && summary.aqi <= 2 ? 'var(--green)' : summary.aqi && summary.aqi <= 3 ? 'var(--yellow)' : 'var(--red)'}">AQI ${summary.aqi || '--'} <span>${summary.aqiLabel}</span></div>
        <div class="iot-cb-sub">PM2.5: ${summary.pollutants ? summary.pollutants.pm2_5.toFixed(1) : '--'} • PM10: ${summary.pollutants ? summary.pollutants.pm10.toFixed(1) : '--'} µg/m³</div>
      </div>
      <div class="iot-combined-block">
        <div class="iot-cb-icon">📊</div>
        <div class="iot-cb-title">Monthly Projection</div>
        <div class="iot-cb-desc">Estimated A5 transport at current rate</div>
        <div class="iot-cb-value" style="color:var(--blue)">${fmt(summary.totalDailyTon * 26)} <span>tCO₂/month</span></div>
        <div class="iot-cb-sub">Based on 26 working days/month</div>
      </div>
    </div>
  </div>

  <!-- METHODOLOGY NOTE -->
  <div class="card" style="border:1px solid rgba(96,165,250,0.15);background:rgba(96,165,250,0.03)">
    <div class="card-title" style="color:var(--blue)">Methodology & Data Sources</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:11px;color:var(--slate4);line-height:1.6">
      <div>
        <strong style="color:var(--text2)">Environmental Data (Real-Time)</strong><br>
        • Source: OpenWeatherMap Air Pollution API<br>
        • Coordinates: ${IOT_CONFIG.lat}°N, ${IOT_CONFIG.lon}°E<br>
        • Parameters: PM2.5, PM10, CO, NO₂, SO₂, O₃<br>
        • Refresh: Every ${IOT_CONFIG.refreshInterval / 1000}s • AQI: 1–5 scale
      </div>
      <div>
        <strong style="color:var(--text2)">Transport Emissions (Simulated)</strong><br>
        • A5 methodology per ECCS framework<br>
        • Diesel EF: ${DIESEL_EF} kgCO₂e/L (A5_EFS)<br>
        • Road TEF: ${TEF.road} kgCO₂/tkm (EN 15978)<br>
        • Fleet: ${VEHICLE_FLEET.length} vehicles, ${VEHICLE_FLEET.map(v => v.material).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
      </div>
    </div>
  </div>`;
}

// ===== ACTIONS =====
function saveIoTKey() {
  const input = $('iotApiKeyInput');
  if (!input) return;
  const key = input.value.trim();
  if (!key) { alert('Please enter a valid API key.'); return; }
  setIoTApiKey(key);
  startIoTMonitoring();
  navigate('iot_monitor');
}

async function refreshIoT() {
  simulateVehicleTrips();
  await fetchAirQuality();
  if (state.page === 'iot_monitor') navigate('iot_monitor');
}

function startIoTMonitoring() {
  if (_iotInterval) clearInterval(_iotInterval);
  simulateVehicleTrips();
  fetchAirQuality().then(() => {
    if (state.page === 'iot_monitor') navigate('iot_monitor');
  });
  _iotInterval = setInterval(async () => {
    simulateVehicleTrips();
    await fetchAirQuality();
    if (state.page === 'iot_monitor') navigate('iot_monitor');
  }, IOT_CONFIG.refreshInterval);
}

function stopIoTMonitoring() {
  if (_iotInterval) { clearInterval(_iotInterval); _iotInterval = null; }
}
