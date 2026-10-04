(async function () {
  if(window.BennyAppStorage)await BennyAppStorage.ready('dayhub');
  'use strict';

  const WEATHER_STORAGE_KEY = 'dayhub_weather_web_v2';
  const DEFAULT_WEATHER = {
    lat: null,
    lon: null,
    label: ''
  };
  const BACKWARD_MS = 3000;

  const WMO = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Rain showers',
    81: 'Rain showers',
    82: 'Heavy rain showers',
    85: 'Snow showers',
    86: 'Snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm',
    99: 'Thunderstorm'
  };

  const WMO_EMOJI = {
    0: '☀️',
    1: '🌤️',
    2: '⛅',
    3: '☁️',
    45: '🌫️',
    48: '🌫️',
    51: '🌦️',
    53: '🌦️',
    55: '🌦️',
    61: '🌧️',
    63: '🌧️',
    65: '🌧️',
    71: '🌨️',
    73: '🌨️',
    75: '🌨️',
    77: '🌨️',
    80: '🌦️',
    81: '🌧️',
    82: '⛈️',
    85: '🌨️',
    86: '🌨️',
    95: '⛈️',
    96: '⛈️',
    99: '⛈️'
  };

  let lastWeatherJson = null;
  let weatherPrefs = loadWeatherPrefs();
  let scanItems = [];
  let scanIndex = -1;
  let spacebarPressed = false;
  let spacebarPressTime = null;
  let backwardScanningOccurred = false;
  let backwardScanInterval = null;
  let returnPressed = false;
  let returnPressTime = null;
  let choiceScan = null;
  let spaceBraking = false;
  let backwardTimeout = null;
  let currentScanInterval = 2000;

  function loadWeatherPrefs() {
    try {
      const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        const lat = Number(o.lat);
        const lon = Number(o.lon);
        if (o.lat !== null && o.lon !== null && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 && typeof o.label === 'string' && o.label.trim()) {
          return { lat, lon, label: o.label.trim() };
        }
      }
    } catch (e) {
      /* ignore */
    }
    return { ...DEFAULT_WEATHER };
  }

  function saveWeatherPrefs(p) {
    weatherPrefs = { ...p };
    if(window.BennyAppStorage)BennyAppStorage.setItem('dayhub',WEATHER_STORAGE_KEY,JSON.stringify(weatherPrefs));else localStorage.setItem(WEATHER_STORAGE_KEY,JSON.stringify(weatherPrefs));
    updateWeatherLocationLine();
  }

  function isSettingsOpen() {
    const el = document.getElementById('settingsOverlay');
    return el && el.classList.contains('open');
  }

  function wmoLabel(code) {
    return WMO[code] || 'Weather';
  }

  function wmoEmoji(code) {
    return WMO_EMOJI[code] != null ? WMO_EMOJI[code] : '🌡️';
  }

  function ordinalSuffix(n) {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  function ordinalDay(n) {
    return `${n}${ordinalSuffix(n)}`;
  }

  function formatDateLineButton(d) {
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    const month = d.toLocaleDateString(undefined, { month: 'long' });
    const year = d.getFullYear();
    return `${weekday}, ${month} ${ordinalDay(d.getDate())}, ${year}`;
  }

  function formatClockNoSeconds(d) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function buildTimeSpeechAndScanLabel(d) {
    const month = d.toLocaleDateString(undefined, { month: 'long' });
    const ord = ordinalDay(d.getDate());
    const year = d.getFullYear();
    const clock = formatClockNoSeconds(d);
    const speech = `Today is ${month} ${ord}, ${year}, at ${clock}.`;
    return { speech, scanLabel: `Date and time. ${speech}` };
  }

  function updateTimeButton() {
    const btn = document.getElementById('btnTime');
    const dateEl = document.getElementById('btnTimeDateLine');
    const clockEl = document.getElementById('btnTimeClockLine');
    if (!btn || !dateEl || !clockEl) return;
    const now = new Date();
    dateEl.textContent = formatDateLineButton(now);
    clockEl.textContent = formatClockNoSeconds(now);
    const { scanLabel } = buildTimeSpeechAndScanLabel(now);
    btn.setAttribute('data-scan-label', scanLabel);
  }

  function speak(text) {
    if (!text) return;
    if (window.NarbeVoiceManager) {
      window.NarbeVoiceManager.cancel();
      window.NarbeVoiceManager.speak(text);
    }
  }

  function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getScanTimings() {
    return {
      forward: currentScanInterval,
      backward: currentScanInterval,
      longPress: BACKWARD_MS
    };
  }

  currentScanInterval = NarbeScanManager.getScanInterval();
  let autoMode=NarbeScanManager.getSettings().autoScan;
  NarbeScanManager.subscribe(settings => {
    if(autoMode!==settings.autoScan&&spacebarPressed&&!spaceBraking){clearTimeout(backwardTimeout);clearInterval(backwardScanInterval);backwardScanningOccurred=true;}
    autoMode=settings.autoScan;currentScanInterval=settings.scanInterval;
  });

  function gateOpen() { return !!document.querySelector('#companion-required')?.open; }
  function startAutoScan() { choiceScan?.setSuspended(isSettingsOpen() || gateOpen()); }
  function stopAutoScan() { choiceScan?.setSuspended(true); }

  function rebuildScanItems() {
    scanItems = [
      document.getElementById('btnTime'),
      document.getElementById('btnTodayWeather'),
      document.getElementById('btnWeekWeather'),
      document.getElementById('btnCalendar'),
      document.getElementById('btnNews'),
      document.getElementById('btnExit')
    ].filter(Boolean);
    choiceScan?.setItems(scanItems);
  }

  function clearHighlights() {
    document.querySelectorAll('.highlighted').forEach((el) => el.classList.remove('highlighted'));
  }

  function highlightCurrent() {
    clearHighlights();
    if (scanIndex >= 0 && scanItems[scanIndex]) {
      scanItems[scanIndex].classList.add('highlighted');
      scanItems[scanIndex].focus({ preventScroll: true });
    }
  }

  function speakScanPrompt(el) {
    if (!el) return;
    const label = el.getAttribute('data-scan-label');
    if (label) {
      speak(label);
      return;
    }
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) speak(t);
  }

  function handleScanForward() { if (!isSettingsOpen()) choiceScan?.step(1); }
  function handleScanBack() { if (!isSettingsOpen()) choiceScan?.step(-1); }
  function handleSelect() { if (!isSettingsOpen()) choiceScan?.select(); }

  function exitHub() {
    speak('Back to hub');
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'focusBackButton' }, '*');
    }
  }

  function buildForecastUrl(lat, lon) {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      temperature_unit: 'fahrenheit',
      current: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '7'
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
  }

  async function loadWeather(lat, lon) {
    const res = await fetch(buildForecastUrl(lat, lon));
    if (!res.ok) throw new Error('Weather failed');
    return res.json();
  }

  function updateWeatherLocationLine() {
    const el = document.getElementById('weatherLocationLine');
    if (el) {
      el.textContent = weatherPrefs.label ? `Weather: ${weatherPrefs.label} (°F)` : 'Weather: choose a location in Settings';
    }
  }

  function speakTodayWeather() {
    const data = lastWeatherJson;
    if (!data || !data.daily || !data.daily.time) {
      speak(weatherPrefs.label ? 'Weather is not ready yet.' : 'Choose a weather location in Settings first.');
      return;
    }
    const todayKey = localDateKey(new Date());
    let idx = data.daily.time.indexOf(todayKey);
    if (idx < 0) idx = 0;
    const t = data.daily.time[idx];
    const d = new Date(t + 'T12:00:00');
    const longDow = d.toLocaleDateString(undefined, { weekday: 'long' });
    const month = d.toLocaleDateString(undefined, { month: 'long' });
    const dayOrd = ordinalDay(d.getDate());
    const hi = Math.round(data.daily.temperature_2m_max[idx]);
    const lo = Math.round(data.daily.temperature_2m_min[idx]);
    const wc = wmoLabel(data.daily.weather_code[idx]);
    const cur = data.current;
    const nowLine =
      cur && cur.temperature_2m != null
        ? ` Right now about ${Math.round(cur.temperature_2m)} degrees.`
        : '';
    const lead = t === todayKey ? 'Today' : `${longDow}, ${month} ${dayOrd}`;
    speak(`${weatherPrefs.label}. ${lead}.${nowLine} High ${hi}, low ${lo}. ${wc}.`);
  }

  function speakWeekWeather() {
    const data = lastWeatherJson;
    if (!data || !data.daily || !data.daily.time) {
      speak(weatherPrefs.label ? 'Weather is not ready yet.' : 'Choose a weather location in Settings first.');
      return;
    }
    const n = Math.min(7, data.daily.time.length);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = data.daily.time[i];
      const d = new Date(t + 'T12:00:00');
      const longDow = d.toLocaleDateString(undefined, { weekday: 'long' });
      const month = d.toLocaleDateString(undefined, { month: 'long' });
      const dayOrd = ordinalDay(d.getDate());
      const hi = Math.round(data.daily.temperature_2m_max[i]);
      const lo = Math.round(data.daily.temperature_2m_min[i]);
      const wc = wmoLabel(data.daily.weather_code[i]);
      parts.push(`${longDow}, ${month} ${dayOrd}. High ${hi}, low ${lo}. ${wc}`);
    }
    speak(`Weekly forecast for ${weatherPrefs.label}. ${parts.join('. ')}.`);
  }

  function speakTimeNow() {
    const { speech } = buildTimeSpeechAndScanLabel(new Date());
    speak(speech);
  }

  function speakNumberedHeadlines(intro, items) {
    if (!items || items.length === 0) return `${intro} No headlines available.`;
    const parts = items.map((t, i) => `${i + 1}. ${t}`);
    return `${intro} ${parts.join('. ')}.`;
  }

  async function speakNewsHighlights() {
    if (!window.BennyDay || !window.BennyDay.news) {
      speak('News highlights work with the companion extension.');
      return;
    }
    speak('Loading headlines.');
    let r;
    try {
      r = await window.BennyDay.news.fetchHighlights({ localLabel: weatherPrefs.label });
    } catch {
      speak('Could not load news.');
      return;
    }
    if (!r || !r.ok) {
      speak((r && r.error) || 'Could not load news.');
      return;
    }
    const localBlock = speakNumberedHeadlines(
      `Local headlines near ${r.localLabel || weatherPrefs.label}, from Google News.`,
      r.local
    );
    const nationalBlock = speakNumberedHeadlines('National headlines from NPR.', r.national);
    const worldBlock = speakNumberedHeadlines('World headlines from BBC News.', r.world);
    speak(`${localBlock} ${nationalBlock} ${worldBlock}`);
  }

  async function speakWeeklySchedule() {
    if (!window.BennyDay || !window.BennyDay.calendar) {
      speak('Calendar works with the companion extension.');
      return;
    }
    speak('Loading calendar.');
    let r;
    try {
      r = await window.BennyDay.calendar.fetchWeek();
    } catch {
      speak('Could not load calendar.');
      return;
    }
    if (!r || !r.ok) {
      speak((r && r.error) || 'Could not load calendar.');
      return;
    }
    if (r.totalCount === 0) {
      speak('No events scheduled for the next 7 days.');
      return;
    }
    // Build speech for each day
    const dayParts = [];
    for (const [day, events] of Object.entries(r.events)) {
      const eventDescs = events.map(e => {
        if (e.allDay) {
          return e.summary;
        } else if (e.time) {
          return `${e.time}, ${e.summary}`;
        } else {
          return e.summary;
        }
      });
      dayParts.push(`${day}: ${eventDescs.join('. ')}`);
    }
    speak(`Weekly schedule. ${r.totalCount} event${r.totalCount === 1 ? '' : 's'}. ${dayParts.join('. ')}.`);
  }

  function updateWeatherButtonsUI() {
    const btnToday = document.getElementById('btnTodayWeather');
    const btnWeek = document.getElementById('btnWeekWeather');
    const data = lastWeatherJson;

    if (!data || !data.daily || !data.daily.time) {
      if (btnToday) {
        btnToday.setAttribute(
          'data-scan-label',
          weatherPrefs.label ? "Today's weather. Forecast unavailable." : "Today's weather. Choose a location in Settings."
        );
        document.getElementById('btnTodayWxEmoji').textContent = '🌡️';
        document.getElementById('btnTodayWxNow').textContent = '—°';
        document.getElementById('btnTodayWxHiLo').textContent = '↑—° ↓—°';
        document.getElementById('btnTodayWxDesc').textContent = weatherPrefs.label ? 'Forecast unavailable. Check your connection.' : 'Choose a location in Settings';
      }
      if (btnWeek) {
        btnWeek.setAttribute('data-scan-label', weatherPrefs.label ? 'Weekly weather. Forecast unavailable.' : 'Weekly weather. Choose a location in Settings.');
        document.getElementById('btnWeekStrip').innerHTML = '';
        document.getElementById('btnWeekSub').textContent = weatherPrefs.label ? 'Forecast unavailable' : 'Choose a location in Settings';
      }
      return;
    }

    const todayKey = localDateKey(new Date());
    let idx = data.daily.time.indexOf(todayKey);
    if (idx < 0) idx = 0;

    const dailyCode = data.daily.weather_code[idx];
    const cur = data.current;
    const codeForIcon = cur && cur.weather_code != null ? cur.weather_code : dailyCode;
    const emoji = wmoEmoji(codeForIcon);
    const hi = Math.round(data.daily.temperature_2m_max[idx]);
    const lo = Math.round(data.daily.temperature_2m_min[idx]);
    const nowTemp =
      cur && cur.temperature_2m != null ? Math.round(cur.temperature_2m) : hi;
    const desc = wmoLabel(codeForIcon);

    const emEl = document.getElementById('btnTodayWxEmoji');
    const nowEl = document.getElementById('btnTodayWxNow');
    const hiloEl = document.getElementById('btnTodayWxHiLo');
    const descEl = document.getElementById('btnTodayWxDesc');
    if (emEl) emEl.textContent = emoji;
    if (nowEl) nowEl.textContent = `${nowTemp}°`;
    if (hiloEl) hiloEl.textContent = `↑${hi}° ↓${lo}°`;
    if (descEl) descEl.textContent = `${desc} · ${weatherPrefs.label}`;

    if (btnToday) {
      btnToday.setAttribute(
        'data-scan-label',
        `Today's weather for ${weatherPrefs.label}. Now ${nowTemp} degrees. High ${hi}, low ${lo}. ${desc}. Hear forecast.`
      );
    }

    const strip = document.getElementById('btnWeekStrip');
    const weekSub = document.getElementById('btnWeekSub');
    if (strip) strip.innerHTML = '';
    const fmtDow = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    const n = Math.min(7, data.daily.time.length);
    for (let i = 0; i < n; i++) {
      const t = data.daily.time[i];
      const dayDate = new Date(t + 'T12:00:00');
      const c = document.createElement('div');
      c.className = 'week-strip-cell';
      c.innerHTML = `
        <span class="wsc-dow">${fmtDow.format(dayDate)}</span>
        <span class="wsc-emoji">${wmoEmoji(data.daily.weather_code[i])}</span>
        <span class="wsc-hi">${Math.round(data.daily.temperature_2m_max[i])}°</span>
      `;
      if (strip) strip.appendChild(c);
    }
    if (weekSub) weekSub.textContent = `${n} days · tap to hear each day`;
    if (btnWeek) {
      btnWeek.setAttribute(
        'data-scan-label',
        `Weekly weather for ${weatherPrefs.label}. ${n} days with highs and conditions. Hear details.`
      );
    }
  }

  async function refreshWeatherSilent() {
    if (weatherPrefs.lat === null || weatherPrefs.lon === null || !weatherPrefs.label) {
      lastWeatherJson = null;
      updateWeatherButtonsUI();
      return;
    }
    try {
      lastWeatherJson = await loadWeather(weatherPrefs.lat, weatherPrefs.lon);
    } catch {
      lastWeatherJson = null;
    }
    updateWeatherButtonsUI();
  }

  async function geocodeSearch(query) {
    const q = query.trim();
    if (!q) return null;
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&country=US&lang=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || !data.results.length) return null;
    const r = data.results[0];
    const parts = [r.name];
    if (r.admin1) parts.push(r.admin1);
    if (r.country_code) parts.push(r.country_code);
    const label = parts.join(', ');
    return { lat: r.latitude, lon: r.longitude, label };
  }

  function setWeatherMsg(text, isError) {
    const el = document.getElementById('settingsWeatherMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function setCalendarMsg(text, isError) {
    const el = document.getElementById('settingsCalendarMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  async function populateCalendarFields() {
    document.getElementById('settingsCalendarMsg').textContent = 'Calendar details are managed privately in Companion settings.';
  }


  function populateSettingsWeatherFields() {
    document.getElementById('settingsLat').value = weatherPrefs.lat === null ? '' : String(weatherPrefs.lat);
    document.getElementById('settingsLon').value = weatherPrefs.lon === null ? '' : String(weatherPrefs.lon);
    document.getElementById('settingsLabel').value = weatherPrefs.label;
    document.getElementById('settingsLocationQuery').value = '';
    document.getElementById('settingsWeatherCurrent').textContent = weatherPrefs.label ? `Current: ${weatherPrefs.label} (${weatherPrefs.lat.toFixed(4)}, ${weatherPrefs.lon.toFixed(4)}) — Fahrenheit` : 'No weather location saved';
  }

  function openSettings() {
    resetSwitchInput();
    stopAutoScan();
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    populateSettingsWeatherFields();
    populateCalendarFields();
    setWeatherMsg('');
    setCalendarMsg('');
    clearHighlights();
    scanIndex = -1;
  }

  function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    setWeatherMsg('');
    setCalendarMsg('');
    choiceScan.open(scanItems);
    choiceScan.setSuspended(gateOpen());
  }

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (isSettingsOpen()) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
      }
      return;
    }

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      startScanning();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      startSelecting();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (isSettingsOpen()) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
      }
      return;
    }

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      stopScanning();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      stopSelecting();
    }
  });

  function resetSwitchInput() {
    clearTimeout(backwardTimeout); clearInterval(backwardScanInterval);
    backwardTimeout = backwardScanInterval = null;
    spacebarPressed = returnPressed = spaceBraking = backwardScanningOccurred = false;
    spacebarPressTime = returnPressTime = null;
    choiceScan?.setInputHeld(false);
  }
  document.addEventListener('narbe-input-cancelled', resetSwitchInput);
  window.addEventListener('blur', resetSwitchInput);
  document.addEventListener('narbe-tool-gate-change', () => {
    resetSwitchInput(); choiceScan?.setSuspended(gateOpen() || isSettingsOpen());
  });
  function startScanning() {
    if (spacebarPressed) return;
    spacebarPressed = true; spacebarPressTime = Date.now(); backwardScanningOccurred = false;
    spaceBraking = choiceScan.brakePress();
    if (spaceBraking) return;
    choiceScan.setInputHeld(true);
    backwardTimeout = setTimeout(() => {
      if (!spacebarPressed) return;
      backwardScanningOccurred = true; handleScanBack();
      backwardScanInterval = setInterval(() => { if (spacebarPressed) handleScanBack(); }, currentScanInterval);
    }, BACKWARD_MS);
  }
  function stopScanning() {
    if (!spacebarPressed) return;
    spacebarPressed = false; clearTimeout(backwardTimeout); clearInterval(backwardScanInterval);
    backwardTimeout = backwardScanInterval = null;
    if (spaceBraking) { spaceBraking = false; choiceScan.brakeRelease(); }
    else { if (!backwardScanningOccurred) handleScanForward(); choiceScan.setInputHeld(false); }
    backwardScanningOccurred = false; spacebarPressTime = null;
  }
  function startSelecting() {
    if (returnPressed) return;
    returnPressed = true; choiceScan.setInputHeld(true);
  }
  function stopSelecting() {
    if (!returnPressed) return;
    returnPressed = false; handleSelect(); choiceScan.setInputHeld(false);
  }

  document.getElementById('btnSettings').addEventListener('click', () => openSettings());
  document.getElementById('settingsCloseBtn').addEventListener('click', () => closeSettings());
  document.getElementById('settingsOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'settingsOverlay') closeSettings();
  });

  document.getElementById('settingsLookupBtn').addEventListener('click', async () => {
    const q = document.getElementById('settingsLocationQuery').value;
    setWeatherMsg('Looking up…');
    try {
      const hit = await geocodeSearch(q);
      if (!hit) {
        setWeatherMsg('No match. Try another city or use coordinates.', true);
        return;
      }
      document.getElementById('settingsLat').value = String(hit.lat);
      document.getElementById('settingsLon').value = String(hit.lon);
      document.getElementById('settingsLabel').value = hit.label;
      setWeatherMsg(`Found: ${hit.label}. Save to use for weather.`);
    } catch {
      setWeatherMsg('Look-up failed. Check your connection.', true);
    }
  });

  document.getElementById('settingsSaveWeatherBtn').addEventListener('click', async () => {
    const lat = parseFloat(document.getElementById('settingsLat').value);
    const lon = parseFloat(document.getElementById('settingsLon').value);
    const label = document.getElementById('settingsLabel').value.trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setWeatherMsg('Enter valid latitude and longitude numbers.', true);
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setWeatherMsg('Latitude must be -90 to 90, longitude -180 to 180.', true);
      return;
    }
    if (!label) {
      setWeatherMsg('Enter a short label for this place.', true);
      return;
    }
    saveWeatherPrefs({ lat, lon, label });
    setWeatherMsg('Saved. Loading forecast…');
    await refreshWeatherSilent();
    populateSettingsWeatherFields();
    setWeatherMsg('Weather location saved.');
  });

  document.getElementById('settingsDefaultWeatherBtn').addEventListener('click', async () => {
    saveWeatherPrefs({ ...DEFAULT_WEATHER });
    setWeatherMsg('Weather location cleared.');
    await refreshWeatherSilent();
    populateSettingsWeatherFields();
    setWeatherMsg('Done.');
  });

  // Calendar settings handlers
  document.getElementById('settingsSaveCalendarBtn').addEventListener('click', async () => {
    try { await BennyExtension.request('OPEN_OPTIONS'); }
    catch (error) { setCalendarMsg(error.message, true); }
  });


  document.getElementById('settingsTestCalendarBtn').addEventListener('click', async () => {
    if (!window.BennyDay || !window.BennyDay.calendar) {
      setCalendarMsg('Calendar requires the companion extension.', true);
      return;
    }
    setCalendarMsg('Testing calendar…');
    try {
      const r = await window.BennyDay.calendar.fetchWeek();
      if (r.ok) {
        setCalendarMsg(`Success! Found ${r.totalCount} event${r.totalCount === 1 ? '' : 's'} this week.`);
      } else {
        setCalendarMsg(r.error || 'Could not fetch calendar.', true);
      }
    } catch {
      setCalendarMsg('Could not connect to calendar.', true);
    }
  });

  document.getElementById('btnTime').addEventListener('click', () => speakTimeNow());
  document.getElementById('btnTodayWeather').addEventListener('click', () => speakTodayWeather());
  document.getElementById('btnWeekWeather').addEventListener('click', () => speakWeekWeather());
  document.getElementById('btnCalendar').addEventListener('click', () => speakWeeklySchedule());
  document.getElementById('btnNews').addEventListener('click', () => speakNewsHighlights());
  document.getElementById('btnExit').addEventListener('click', () => exitHub());

  updateWeatherLocationLine();
  updateTimeButton();
  setInterval(updateTimeButton, 30000);
  rebuildScanItems();
  const statusHost = document.createElement('div'); statusHost.id = 'day-scan-status';
  statusHost.setAttribute('aria-label', 'Scan status'); document.getElementById('app').append(statusHost);
  choiceScan = NarbeScanManager.createChoiceScan({
    choice: true, holdThreshold: BACKWARD_MS, items: scanItems, statusHost,
    getId: item => item.id,
    getLabel: item => item.getAttribute('data-scan-label') || item.textContent.replace(/\s+/g, ' ').trim(),
    getLabelElement: item => item.querySelector('.btn-kicker, .btn-label') || item,
    onHighlight(item, state) {
      scanIndex = state.index; clearHighlights();
      const app = document.getElementById('app');
      app.dataset.scanIndex = state.index; app.dataset.scanSelected = state.id || '';
      app.dataset.scanState = state.parked ? 'parked' : state.braked ? 'paused' : 'running';
      if (item && !state.suspended) { item.classList.add('highlighted'); item.focus({preventScroll: true}); item.scrollIntoView({block:'nearest',inline:'nearest'}); }
      else if (document.activeElement?.classList.contains('scan-target')) document.activeElement.blur();
    },
    onSelect: item => item.click()
  });
  choiceScan.setSuspended(gateOpen() || isSettingsOpen());
  refreshWeatherSilent();
})();
