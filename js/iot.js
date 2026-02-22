// ===== IoT LIVE EMISSIONS MONITORING MODULE =====
// Real-time environmental monitoring + simulated A5 construction vehicle transport emissions
// Dual-source: Open-Meteo (zero-config, no API key) + OpenWeatherMap (optional, richer data)
// Coordinates: Project site area (24.96°N, 46.70°E) — King Salman International Airport

const IOT_CONFIG = {
  lat: 24.96,
  lon: 46.70,
  // Open-Meteo Air Quality API — zero config, no API key required
  openMeteoBase: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  // OpenWeatherMap free tier Air Pollution API — optional upgrade
  owmBase: 'https://api.openweathermap.org/data/2.5/air_pollution',
  owmApiKey: '', // Set via setIoTApiKey() or prompt in UI
  refreshInterval: 120000, // 2 minutes
  localStorageKey: 'ct_owm_api_key',
  sourceKey: 'ct_iot_source' // 'open-meteo' or 'owm'
};

// US AQI breakpoints (EPA standard 0-500 scale)
const US_AQI_LEVELS = [
  { min: 0, max: 50, label: 'Good', color: 'var(--green)', bg: 'rgba(52,211,153,0.12)' },
  { min: 51, max: 100, label: 'Moderate', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)' },
  { min: 101, max: 150, label: 'Unhealthy (SG)', color: 'var(--orange)', bg: 'rgba(251,146,60,0.12)' },
  { min: 151, max: 200, label: 'Unhealthy', color: 'var(--red)', bg: 'rgba(248,113,113,0.12)' },
  { min: 201, max: 300, label: 'Very Unhealthy', color: 'var(--purple)', bg: 'rgba(167,139,250,0.12)' },
  { min: 301, max: 500, label: 'Hazardous', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' }
];

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
  o3:    { label: 'O₃',    unit: 'µg/m³', who: 100, max: 300, color: 'var(--cyan)', icon: '☀️' },
  dust:  { label: 'Dust',  unit: 'µg/m³', who: 50, max: 500, color: '#d97706', icon: '🏜️' }
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
let _iotData = { aqi: null, usAqi: null, pollutants: null, dust: null, timestamp: null, error: null, source: null };
let _iotVehicles = [];
let _iotHistory = [];
let _iotForecast = null; // 24-hour forecast from Open-Meteo

// ===== DATA SOURCE MANAGEMENT =====
function getIoTSource() {
  return localStorage.getItem(IOT_CONFIG.sourceKey) || 'open-meteo';
}

function setIoTSource(source) {
  localStorage.setItem(IOT_CONFIG.sourceKey, source);
}

// ===== API KEY MANAGEMENT (OWM only) =====
function getIoTApiKey() {
  return IOT_CONFIG.owmApiKey || localStorage.getItem(IOT_CONFIG.localStorageKey) || '';
}

function setIoTApiKey(key) {
  IOT_CONFIG.owmApiKey = key;
  localStorage.setItem(IOT_CONFIG.localStorageKey, key);
}

// ===== FETCH FROM OPEN-METEO (NO API KEY) =====
async function fetchOpenMeteoAirQuality() {
  try {
    const params = [
      `latitude=${IOT_CONFIG.lat}`,
      `longitude=${IOT_CONFIG.lon}`,
      `current=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,us_aqi`,
      `hourly=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,us_aqi`,
      `timezone=Asia/Riyadh`,
      `forecast_days=2`
    ].join('&');
    const url = `${IOT_CONFIG.openMeteoBase}?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      _iotData.error = `Open-Meteo API error (HTTP ${res.status})`;
      return null;
    }
    const data = await res.json();

    // Parse current readings
    if (data.current) {
      const c = data.current;
      const usAqi = c.us_aqi || null;
      _iotData = {
        aqi: usAqiToOwmScale(usAqi),
        usAqi: usAqi,
        pollutants: {
          pm2_5: c.pm2_5 || 0,
          pm10: c.pm10 || 0,
          co: c.carbon_monoxide || 0,
          no2: c.nitrogen_dioxide || 0,
          so2: c.sulphur_dioxide || 0,
          o3: c.ozone || 0
        },
        dust: c.dust || 0,
        timestamp: new Date(),
        error: null,
        source: 'open-meteo'
      };

      // Push to history (keep last 30 readings)
      _iotHistory.push({
        time: _iotData.timestamp,
        aqi: _iotData.usAqi,
        pm25: _iotData.pollutants.pm2_5,
        pm10: _iotData.pollutants.pm10,
        co: _iotData.pollutants.co,
        no2: _iotData.pollutants.no2,
        dust: _iotData.dust
      });
      if (_iotHistory.length > 30) _iotHistory.shift();
    }

    // Parse hourly forecast (next 24 hours)
    if (data.hourly && data.hourly.time) {
      const now = new Date();
      const forecastHours = [];
      for (let i = 0; i < data.hourly.time.length && forecastHours.length < 24; i++) {
        const t = new Date(data.hourly.time[i]);
        if (t >= now) {
          forecastHours.push({
            time: t,
            pm25: data.hourly.pm2_5 ? data.hourly.pm2_5[i] : null,
            pm10: data.hourly.pm10 ? data.hourly.pm10[i] : null,
            co: data.hourly.carbon_monoxide ? data.hourly.carbon_monoxide[i] : null,
            no2: data.hourly.nitrogen_dioxide ? data.hourly.nitrogen_dioxide[i] : null,
            so2: data.hourly.sulphur_dioxide ? data.hourly.sulphur_dioxide[i] : null,
            o3: data.hourly.ozone ? data.hourly.ozone[i] : null,
            dust: data.hourly.dust ? data.hourly.dust[i] : null,
            usAqi: data.hourly.us_aqi ? data.hourly.us_aqi[i] : null
          });
        }
      }
      _iotForecast = forecastHours;
    }

    return _iotData;
  } catch (e) {
    _iotData.error = 'Network error: ' + e.message;
    return null;
  }
}

// Convert US AQI (0-500) to OWM 1-5 scale for backward compatibility
function usAqiToOwmScale(usAqi) {
  if (usAqi == null) return null;
  if (usAqi <= 50) return 1;
  if (usAqi <= 100) return 2;
  if (usAqi <= 150) return 3;
  if (usAqi <= 200) return 4;
  return 5;
}

// ===== FETCH FROM OPENWEATHERMAP (REQUIRES API KEY) =====
async function fetchOwmAirQuality() {
  const key = getIoTApiKey();
  if (!key) {
    _iotData.error = 'OWM API key required';
    return null;
  }
  try {
    const url = `${IOT_CONFIG.owmBase}?lat=${IOT_CONFIG.lat}&lon=${IOT_CONFIG.lon}&appid=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) {
        _iotData.error = 'Invalid OWM API key';
      } else {
        _iotData.error = `OWM API error (HTTP ${res.status})`;
      }
      return null;
    }
    const data = await res.json();
    if (data.list && data.list.length > 0) {
      const reading = data.list[0];
      _iotData = {
        aqi: reading.main.aqi,
        usAqi: owmToUsAqi(reading.main.aqi),
        pollutants: reading.components,
        dust: null, // OWM doesn't provide dust
        timestamp: new Date(reading.dt * 1000),
        error: null,
        source: 'owm'
      };
      // Push to history (keep last 30 readings)
      _iotHistory.push({
        time: _iotData.timestamp,
        aqi: _iotData.usAqi,
        pm25: reading.components.pm2_5,
        pm10: reading.components.pm10,
        co: reading.components.co,
        no2: reading.components.no2,
        dust: 0
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

// Approximate OWM 1-5 scale to US AQI for display consistency
function owmToUsAqi(owmAqi) {
  const map = { 1: 25, 2: 65, 3: 110, 4: 170, 5: 260 };
  return map[owmAqi] || null;
}

// ===== UNIFIED FETCH — routes to active source =====
async function fetchAirQuality() {
  const source = getIoTSource();
  if (source === 'owm' && getIoTApiKey()) {
    return fetchOwmAirQuality();
  }
  // Default to Open-Meteo (no key needed)
  return fetchOpenMeteoAirQuality();
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
    usAqi: _iotData.usAqi,
    aqiLabel: _iotData.aqi ? AQI_LEVELS[_iotData.aqi - 1]?.label : '--',
    usAqiLabel: getUsAqiLabel(_iotData.usAqi),
    pollutants: _iotData.pollutants,
    dust: _iotData.dust,
    timestamp: _iotData.timestamp,
    error: _iotData.error,
    source: _iotData.source
  };
}

function getUsAqiLabel(aqi) {
  if (aqi == null) return '--';
  const level = US_AQI_LEVELS.find(l => aqi >= l.min && aqi <= l.max);
  return level ? level.label : 'Hazardous';
}

function getUsAqiColor(aqi) {
  if (aqi == null) return 'var(--slate5)';
  const level = US_AQI_LEVELS.find(l => aqi >= l.min && aqi <= l.max);
  return level ? level.color : '#dc2626';
}

// ===== BUILD US AQI GAUGE SVG =====
function buildUsAqiGauge(aqi) {
  if (aqi == null) return '<div class="iot-gauge-empty">No data</div>';
  const label = getUsAqiLabel(aqi);
  const color = getUsAqiColor(aqi);
  const pct = Math.min((aqi / 500) * 100, 100);
  const angle = -90 + (pct / 100) * 180;
  const r = 60, cx = 70, cy = 70;
  const startX = cx + r * Math.cos(-90 * Math.PI / 180);
  const startY = cy + r * Math.sin(-90 * Math.PI / 180);
  const endX = cx + r * Math.cos(angle * Math.PI / 180);
  const endY = cy + r * Math.sin(angle * Math.PI / 180);
  const largeArc = (angle - (-90)) > 180 ? 1 : 0;

  return `<svg viewBox="0 0 140 90" class="iot-aqi-gauge">
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--bg3)" stroke-width="10" stroke-linecap="round"/>
    <path d="M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${color}" font-size="26" font-weight="800" font-family="system-ui">${aqi}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="${color}" font-size="8" font-weight="700" font-family="system-ui" opacity="0.8">${label}</text>
  </svg>`;
}

// ===== BUILD AQI GAUGE SVG (OWM 1-5 scale) =====
function buildAqiGauge(aqi) {
  if (!aqi) return '<div class="iot-gauge-empty">No data</div>';
  const level = AQI_LEVELS[aqi - 1] || AQI_LEVELS[2];
  const pct = (aqi / 5) * 100;
  const angle = -90 + (pct / 100) * 180;
  const r = 60, cx = 70, cy = 70;
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
  if (!meta || value == null) return '';
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

// ===== BUILD 24H FORECAST CHART =====
function buildForecastChart(forecast, key, label, color, whoThreshold) {
  if (!forecast || forecast.length < 3) return '<div style="font-size:10px;color:var(--slate5);padding:12px">Loading forecast...</div>';
  const vals = forecast.map(h => h[key] || 0).filter(v => v != null);
  if (vals.length < 3) return '<div style="font-size:10px;color:var(--slate5);padding:12px">No forecast data</div>';
  const mx = Math.max(...vals, whoThreshold || 1, 1);
  const mn = Math.min(...vals, 0);
  const w = 480, h = 80, pad = 4;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - mn) / (mx - mn || 1)) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // WHO line position
  let whoLineY = '';
  if (whoThreshold && whoThreshold <= mx) {
    const yWho = h - pad - ((whoThreshold - mn) / (mx - mn || 1)) * (h - 2 * pad);
    whoLineY = `<line x1="${pad}" y1="${yWho.toFixed(1)}" x2="${w - pad}" y2="${yWho.toFixed(1)}" stroke="var(--red)" stroke-width="1" stroke-dasharray="4,3" opacity="0.5"/>
    <text x="${w - pad - 2}" y="${yWho - 3}" text-anchor="end" fill="var(--red)" font-size="7" opacity="0.7">WHO</text>`;
  }

  // Time labels (show every 6th hour)
  const timeLabels = forecast.map((h, i) => {
    if (i % 6 !== 0 && i !== vals.length - 1) return '';
    const x = pad + (i / (vals.length - 1)) * (w - 2 * pad);
    const hr = h.time.getHours();
    return `<text x="${x.toFixed(1)}" y="${h - 1}" text-anchor="middle" fill="var(--slate5)" font-size="7">${hr}:00</text>`;
  }).join('');

  // Area fill
  const areaPath = `M ${pts[0].split(',')[0]},${h - pad} L ${pts.join(' L ')} L ${pts[pts.length - 1].split(',')[0]},${h - pad} Z`;

  return `<div style="margin-bottom:4px;font-size:9px;font-weight:700;color:var(--slate4);letter-spacing:1px">${label}</div>
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px">
    <path d="${areaPath}" fill="${color}" opacity="0.08"/>
    ${whoLineY}
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
    <circle cx="${pts[0].split(',')[0]}" cy="${pts[0].split(',')[1]}" r="2.5" fill="${color}" opacity="0.9"/>
    <circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="2.5" fill="${color}" opacity="0.9"/>
    <text x="${pts[0].split(',')[0]}" y="${parseFloat(pts[0].split(',')[1]) - 5}" text-anchor="start" fill="${color}" font-size="8" font-weight="700">${vals[0].toFixed(0)}</text>
    <text x="${pts[pts.length - 1].split(',')[0]}" y="${parseFloat(pts[pts.length - 1].split(',')[1]) - 5}" text-anchor="end" fill="${color}" font-size="8" font-weight="700">${vals[vals.length - 1].toFixed(0)}</text>
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

// ===== BUILD DUST CARD =====
function buildDustCard(dust) {
  if (dust == null) return '';
  const meta = POLLUTANT_META.dust;
  const pct = Math.min((dust / meta.max) * 100, 100);
  const severity = dust <= 25 ? { label: 'Low', color: 'var(--green)' }
    : dust <= 75 ? { label: 'Moderate', color: 'var(--yellow)' }
    : dust <= 150 ? { label: 'High', color: 'var(--orange)' }
    : dust <= 300 ? { label: 'Very High', color: 'var(--red)' }
    : { label: 'Severe', color: '#dc2626' };

  return `<div class="card iot-dust-card">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">
      <span>🏜️</span> Saharan Dust & Sand Monitoring
      <span class="iot-source-tag" style="background:${severity.color};color:#000;margin-left:auto;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:800">${severity.label}</span>
    </div>
    <div style="display:flex;align-items:center;gap:24px">
      <div style="text-align:center;min-width:100px">
        <div style="font-size:36px;font-weight:800;color:${severity.color};line-height:1">${dust.toFixed(0)}</div>
        <div style="font-size:10px;color:var(--slate5);margin-top:4px">µg/m³</div>
      </div>
      <div style="flex:1">
        <div class="iot-poll-bar-bg" style="height:16px;border-radius:8px">
          <div class="iot-poll-bar-fill" style="width:${pct}%;background:${severity.color};opacity:0.7;height:100%;border-radius:8px"></div>
          <div class="iot-poll-who-line" style="left:${(meta.who / meta.max * 100).toFixed(1)}%" title="Threshold: ${meta.who} µg/m³"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:9px;color:var(--slate5)">
          <span>0</span>
          <span>Low (25)</span>
          <span>Mod (75)</span>
          <span>High (150)</span>
          <span>500+</span>
        </div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:10px;color:var(--slate5);line-height:1.6">
      Dust levels are critical for Riyadh construction sites — high concentrations affect worker safety (OSHA PEL: 5mg/m³ respirable), equipment performance, and contribute to PM10 readings. Dust storms (Shamal winds) can exceed 1000 µg/m³.
    </div>
  </div>`;
}

// ===== BUILD EMISSIONS IMPACT ESTIMATION =====
function buildEmissionsImpact(summary) {
  // Estimate construction fleet contribution to local pollutants
  // Based on USEPA AP-42 diesel emission factors for heavy-duty vehicles
  const fuelL = summary.totalFuelL || 0;
  // Diesel combustion emission factors (g/L of diesel burned)
  const dieselPollutants = {
    nox: 33.37,   // g NOx/L (includes NO + NO2)
    pm25: 1.07,   // g PM2.5/L
    pm10: 1.17,   // g PM10/L
    co: 6.14,     // g CO/L
    so2: 0.29     // g SO2/L (ULSD)
  };

  const fleetNOx = (fuelL * dieselPollutants.nox / 1000).toFixed(2);
  const fleetPM25 = (fuelL * dieselPollutants.pm25 / 1000).toFixed(3);
  const fleetPM10 = (fuelL * dieselPollutants.pm10 / 1000).toFixed(3);
  const fleetCO = (fuelL * dieselPollutants.co / 1000).toFixed(2);
  const fleetSO2 = (fuelL * dieselPollutants.so2 / 1000).toFixed(3);
  const totalPollutantKg = parseFloat(fleetNOx) + parseFloat(fleetPM25) + parseFloat(fleetPM10) + parseFloat(fleetCO) + parseFloat(fleetSO2);

  return `<div class="card">
    <div class="card-title">Fleet Emissions Impact — Pollutant Estimation</div>
    <div style="font-size:11px;color:var(--slate5);margin:-8px 0 14px 0">Estimated local pollutant contribution from today's fleet operations (USEPA AP-42 diesel emission factors)</div>
    <div class="iot-impact-grid">
      <div class="iot-impact-item">
        <div class="iot-impact-label">NOx</div>
        <div class="iot-impact-value" style="color:var(--purple)">${fleetNOx}</div>
        <div class="iot-impact-unit">kg/day</div>
      </div>
      <div class="iot-impact-item">
        <div class="iot-impact-label">PM2.5</div>
        <div class="iot-impact-value" style="color:var(--red)">${fleetPM25}</div>
        <div class="iot-impact-unit">kg/day</div>
      </div>
      <div class="iot-impact-item">
        <div class="iot-impact-label">PM10</div>
        <div class="iot-impact-value" style="color:var(--orange)">${fleetPM10}</div>
        <div class="iot-impact-unit">kg/day</div>
      </div>
      <div class="iot-impact-item">
        <div class="iot-impact-label">CO</div>
        <div class="iot-impact-value" style="color:var(--slate3)">${fleetCO}</div>
        <div class="iot-impact-unit">kg/day</div>
      </div>
      <div class="iot-impact-item">
        <div class="iot-impact-label">SO₂</div>
        <div class="iot-impact-value" style="color:var(--yellow)">${fleetSO2}</div>
        <div class="iot-impact-unit">kg/day</div>
      </div>
      <div class="iot-impact-item" style="border-color:var(--green)">
        <div class="iot-impact-label">Total</div>
        <div class="iot-impact-value" style="color:var(--green)">${totalPollutantKg.toFixed(2)}</div>
        <div class="iot-impact-unit">kg/day</div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:10px;color:var(--slate5);line-height:1.6;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><strong style="color:var(--text2)">Monthly projection:</strong> ${(totalPollutantKg * 26).toFixed(1)} kg pollutants (26 working days)</div>
      <div><strong style="color:var(--text2)">Diesel basis:</strong> ${fmtI(fuelL)} L consumed today across ${summary.totalTrips} trips</div>
    </div>
  </div>`;
}

// ===== RENDER IOT MONITOR PAGE =====
function renderIoTMonitor(el) {
  const owmKey = getIoTApiKey();
  const source = getIoTSource();
  const summary = getIoTSummary();
  const hasData = !!summary.aqi || !!summary.usAqi;
  const hasDust = summary.dust != null && summary.dust > 0;
  const hasForecast = _iotForecast && _iotForecast.length >= 3;
  const sourceLabel = source === 'owm' ? 'OpenWeatherMap' : 'Open-Meteo';

  el.innerHTML = `
  <!-- DATA SOURCE SELECTOR -->
  <div class="iot-source-bar">
    <div class="iot-source-label">Data Source</div>
    <div class="iot-source-options">
      <button class="iot-source-btn${source === 'open-meteo' ? ' active' : ''}" onclick="switchIoTSource('open-meteo')">
        <span class="iot-source-dot" style="background:var(--green)"></span>
        Open-Meteo <span class="iot-source-tag">No API Key</span>
      </button>
      <button class="iot-source-btn${source === 'owm' ? ' active' : ''}" onclick="switchIoTSource('owm')">
        <span class="iot-source-dot" style="background:var(--blue)"></span>
        OpenWeatherMap ${owmKey ? '<span class="iot-source-tag green">Connected</span>' : '<span class="iot-source-tag">Key Required</span>'}
      </button>
    </div>
    ${source === 'owm' && !owmKey ? `<div class="iot-owm-key-row">
      <input type="text" id="iotApiKeyInput" placeholder="Paste your OpenWeatherMap API key" value="${owmKey}" class="iot-key-input"/>
      <button class="btn btn-primary btn-sm" onclick="saveIoTKey()" style="font-size:10px;padding:6px 14px">Connect</button>
    </div>` : ''}
  </div>

  <div class="iot-live-header">
    <div class="iot-live-dot${hasData ? ' active' : ''}"></div>
    <span class="iot-live-label">${hasData ? 'LIVE' : 'CONNECTING'}</span>
    <span class="iot-live-ts">${summary.timestamp ? summary.timestamp.toLocaleTimeString() : '--:--:--'}</span>
    <span class="iot-live-coord">📍 ${IOT_CONFIG.lat}°N, ${IOT_CONFIG.lon}°E</span>
    <span style="font-size:9px;color:var(--slate5);margin-left:4px">via ${sourceLabel}</span>
    <button class="btn btn-sm btn-secondary" onclick="refreshIoT()" style="margin-left:auto;font-size:10px;padding:5px 12px">↻ Refresh</button>
  </div>

  ${summary.error ? `<div style="padding:10px 14px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--red)">⚠️ ${summary.error}</div>` : ''}

  <!-- TOP STAT CARDS -->
  <div class="stats-row" style="grid-template-columns:repeat(6,1fr)">
    <div class="stat-card ${summary.usAqi != null ? (summary.usAqi <= 50 ? 'green' : summary.usAqi <= 100 ? 'orange' : 'purple') : 'slate'}">
      <div class="sc-label">US AQI (0-500)</div>
      <div class="sc-value">${summary.usAqi != null ? summary.usAqi : '--'}</div>
      <div class="sc-sub">${summary.usAqiLabel}</div>
    </div>
    <div class="stat-card ${hasDust ? (summary.dust <= 50 ? 'green' : summary.dust <= 150 ? 'orange' : 'purple') : 'slate'}">
      <div class="sc-label">Dust Level</div>
      <div class="sc-value">${hasDust ? summary.dust.toFixed(0) : '--'}</div>
      <div class="sc-sub">${hasDust ? 'µg/m³' : 'N/A'}</div>
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

  <!-- DUST MONITORING (Saudi-specific) -->
  ${hasDust ? buildDustCard(summary.dust) : ''}

  <!-- TWO-COLUMN: AQI + POLLUTANTS -->
  <div class="iot-grid-2col">
    <div class="card">
      <div class="card-title">Real-Time Air Quality — Project Site</div>
      <div class="iot-aqi-section">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          ${buildUsAqiGauge(summary.usAqi)}
          <div style="font-size:8px;color:var(--slate5);text-align:center">US EPA AQI</div>
        </div>
        <div class="iot-aqi-details">
          <div class="iot-aqi-detail-row"><span>PM2.5</span><strong style="color:${summary.pollutants && summary.pollutants.pm2_5 > 15 ? 'var(--red)' : 'var(--green)'}">${summary.pollutants ? summary.pollutants.pm2_5.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>PM10</span><strong style="color:${summary.pollutants && summary.pollutants.pm10 > 45 ? 'var(--red)' : 'var(--green)'}">${summary.pollutants ? summary.pollutants.pm10.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>CO</span><strong>${summary.pollutants ? summary.pollutants.co.toFixed(0) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>NO₂</span><strong>${summary.pollutants ? summary.pollutants.no2.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>O₃</span><strong>${summary.pollutants ? summary.pollutants.o3.toFixed(1) : '--'} µg/m³</strong></div>
          <div class="iot-aqi-detail-row"><span>SO₂</span><strong>${summary.pollutants ? summary.pollutants.so2.toFixed(1) : '--'} µg/m³</strong></div>
          ${hasDust ? `<div class="iot-aqi-detail-row"><span>🏜️ Dust</span><strong style="color:${summary.dust > 50 ? 'var(--orange)' : 'var(--green)'}">${summary.dust.toFixed(1)} µg/m³</strong></div>` : ''}
        </div>
      </div>
      <div style="margin-top:14px;font-size:9px;color:var(--slate5)">Source: ${sourceLabel} • WHO guideline thresholds shown</div>
    </div>

    <div class="card">
      <div class="card-title">Pollutant Levels vs WHO Guidelines</div>
      <div class="iot-pollutant-bars" id="iotPollBars">
        ${summary.pollutants ? ['pm2_5','pm10','co','no2','so2','o3'].map(k => buildPollutantBar(k, summary.pollutants[k] || 0)).join('') : '<div class="empty" style="padding:30px"><div class="empty-icon">📡</div>Awaiting sensor data...</div>'}
        ${hasDust ? buildPollutantBar('dust', summary.dust) : ''}
      </div>
    </div>
  </div>

  <!-- 24H FORECAST (Open-Meteo only) -->
  ${hasForecast ? `<div class="card">
    <div class="card-title">24-Hour Air Quality Forecast</div>
    <div style="font-size:10px;color:var(--slate5);margin:-8px 0 12px 0">Hourly forecast from CAMS (Copernicus Atmosphere Monitoring Service) via Open-Meteo • Timezone: Asia/Riyadh</div>
    <div class="iot-forecast-grid">
      <div class="iot-forecast-item">${buildForecastChart(_iotForecast, 'pm25', 'PM2.5 (µg/m³)', 'var(--red)', 15)}</div>
      <div class="iot-forecast-item">${buildForecastChart(_iotForecast, 'pm10', 'PM10 (µg/m³)', 'var(--orange)', 45)}</div>
      <div class="iot-forecast-item">${buildForecastChart(_iotForecast, 'dust', 'DUST (µg/m³)', '#d97706', 50)}</div>
      <div class="iot-forecast-item">${buildForecastChart(_iotForecast, 'no2', 'NO₂ (µg/m³)', 'var(--purple)', 25)}</div>
    </div>
  </div>` : ''}

  <!-- TREND SPARKLINES -->
  <div class="card">
    <div class="card-title">Monitoring Trend — Recent Readings</div>
    <div class="iot-sparkline-grid" style="grid-template-columns:repeat(5,1fr)">
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
      <div class="iot-sparkline-item">
        <div class="iot-sparkline-label">Dust</div>
        ${buildIoTSparkline(_iotHistory, 'dust', '#d97706')}
      </div>
    </div>
  </div>

  <!-- FLEET EMISSIONS IMPACT -->
  ${buildEmissionsImpact(summary)}

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
        <div class="iot-cb-value" style="color:${getUsAqiColor(summary.usAqi)}">AQI ${summary.usAqi != null ? summary.usAqi : '--'} <span>${summary.usAqiLabel}</span></div>
        <div class="iot-cb-sub">PM2.5: ${summary.pollutants ? summary.pollutants.pm2_5.toFixed(1) : '--'} • PM10: ${summary.pollutants ? summary.pollutants.pm10.toFixed(1) : '--'} µg/m³</div>
      </div>
      <div class="iot-combined-block">
        <div class="iot-cb-icon">🏜️</div>
        <div class="iot-cb-title">Desert Dust Index</div>
        <div class="iot-cb-desc">Saharan dust at project site</div>
        <div class="iot-cb-value" style="color:${hasDust && summary.dust > 50 ? 'var(--orange)' : 'var(--green)'}">${hasDust ? summary.dust.toFixed(0) : '--'} <span>µg/m³</span></div>
        <div class="iot-cb-sub">${hasDust ? (summary.dust <= 25 ? 'Clear conditions' : summary.dust <= 75 ? 'Light haze' : summary.dust <= 150 ? 'Moderate dust' : 'Dust storm advisory') : 'No data'}</div>
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
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:11px;color:var(--slate4);line-height:1.6">
      <div>
        <strong style="color:var(--text2)">Environmental Data (Real-Time)</strong><br>
        • Source: ${sourceLabel}${source === 'open-meteo' ? ' (CAMS)' : ''}<br>
        • Coordinates: ${IOT_CONFIG.lat}°N, ${IOT_CONFIG.lon}°E<br>
        • Parameters: PM2.5, PM10, CO, NO₂, SO₂, O₃${source === 'open-meteo' ? ', Dust' : ''}<br>
        • AQI: US EPA 0–500 scale<br>
        • Refresh: Every ${IOT_CONFIG.refreshInterval / 1000}s
      </div>
      <div>
        <strong style="color:var(--text2)">Transport Emissions (Simulated)</strong><br>
        • A5 methodology per ECCS framework<br>
        • Diesel EF: ${DIESEL_EF} kgCO₂e/L (A5_EFS)<br>
        • Road TEF: ${TEF.road} kgCO₂/tkm (EN 15978)<br>
        • Fleet: ${VEHICLE_FLEET.length} vehicles, ${VEHICLE_FLEET.map(v => v.material).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
      </div>
      <div>
        <strong style="color:var(--text2)">Pollutant Estimation</strong><br>
        • Basis: USEPA AP-42 Ch.3 diesel EFs<br>
        • NOx: 33.37 g/L, PM2.5: 1.07 g/L<br>
        • PM10: 1.17 g/L, CO: 6.14 g/L<br>
        • Dust source: CAMS global model<br>
        • Relevant for Saudi construction (Shamal winds)
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
  setIoTSource('owm');
  startIoTMonitoring();
  navigate('iot_monitor');
}

function switchIoTSource(source) {
  setIoTSource(source);
  // Clear stale data to force fresh fetch
  _iotData = { aqi: null, usAqi: null, pollutants: null, dust: null, timestamp: null, error: null, source: null };
  _iotForecast = null;
  if (source === 'owm' && !getIoTApiKey()) {
    // Just re-render to show key input
    navigate('iot_monitor');
    return;
  }
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
