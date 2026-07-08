import { pushState, listenToGameState, clearLog, listenToLog } from './firebase.js';
import { initMap, addMarkers, getMap } from './map.js';
import { initSettings } from './settings.js';
import { renderAll } from './ui.js';
import { allLocations, allChallenges, gameState, fixArrays, toKey,
         spawnChallenge, drawChallenge, buildPool, esc } from './shared.js';

console.log('✅ main.js loaded');

function defaultState(locations) {
  const stops = {};
  locations.forEach(loc => {
    stops[toKey(loc.name)] = {
      stateIndex:  0,
      value:       0,
      challenge:   null,
      route:       '',
      displayName: loc.name
    };
  });
  return {
    stops,
    coins:            { 1: 50, 2: 50, 3: 50 },
    activeChallenges: {},
    heldChallenges:   { 1: [], 2: [], 3: [] },
    pool:             buildPool(),
    usedStops:        [],
    routeLog:         { 1: [], 2: [], 3: [] },
  };
}

function spawnInitialChallenges(gs) {
  const n = Math.min(3, allLocations.length);
  for (let i = 0; i < n; i++) {
    const ch = drawChallenge(gs.pool);
    if (ch) spawnChallenge(gs, null, ch);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOMContentLoaded fired');

  const settings = initSettings(() => {
    console.log('🔄 Reset triggered, allChallenges:', allChallenges.length);
    const gs = defaultState(allLocations);
    spawnInitialChallenges(gs);
    pushState(gs);
    clearLog();
  });

  const mapDiv = document.getElementById('map');
  console.log('🗺️ #map div found:', mapDiv);

  try {
    initMap();
    console.log('✅ initMap() completed');
  } catch (e) {
    console.error('❌ initMap() failed:', e);
  }

  // ── History state ──────────────────────────────────────────────
  let historyUnsubscribe = null;
  let cachedEntries      = [];

  function renderHistory(entries) {
    const container  = document.getElementById('history-list');
    const teamFilter = document.getElementById('history-filter-team').value;
    const typeFilter = document.getElementById('history-filter-type').value;

    const filtered = entries.filter(e => {
      const teamMatch = teamFilter === 'all' || String(e.team) === teamFilter;
      const typeMatch = typeFilter === 'all' || e.type === typeFilter;
      return teamMatch && typeMatch;
    });

    if (filtered.length === 0) {
      container.innerHTML =
        '<span style="font-size:13px;color:#9ca3af;font-style:italic;">No entries found.</span>';
      return;
    }

    const typeColors = {
      stop:      '#1d6fd1',
      challenge: '#f59e0b',
      coin:      '#2a9d3f',
    };
    const typeLabels = {
      stop:      '🚏 Stop',
      challenge: '⚡ Challenge',
      coin:      '🪙 Coin',
    };

    container.innerHTML = filtered.map(e => {
      const time  = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const color = typeColors[e.type] || '#6b7280';
      const label = typeLabels[e.type]  || e.type;
      return (
        '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;' +
        'padding:10px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;' +
            'font-weight:700;color:white;background:' + color + ';">' + label + '</span>' +
            '<span style="font-size:11px;color:#9ca3af;font-weight:600;">' + time + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:#374151;font-weight:500;">' + esc(e.message) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function loadHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML =
      '<span style="font-size:13px;color:#9ca3af;font-style:italic;">Loading...</span>';

    if (historyUnsubscribe) {
      historyUnsubscribe();
      historyUnsubscribe = null;
    }

    historyUnsubscribe = listenToLog(entries => {
      cachedEntries = entries;
      renderHistory(entries);
    });
  }

  // ── Nav ────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('screen-' + btn.dataset.screen).classList.add('active');
      if (btn.dataset.screen === 'map')     setTimeout(() => getMap().invalidateSize(), 50);
      if (btn.dataset.screen === 'history') loadHistory();
    });
  });

  // ── Filter dropdowns ───────────────────────────────────────────
  document.getElementById('history-filter-team').addEventListener('change', () => {
    renderHistory(cachedEntries);
  });
  document.getElementById('history-filter-type').addEventListener('change', () => {
    renderHistory(cachedEntries);
  });

  // ── Accordion ──────────────────────────────────────────────────
  document.querySelectorAll('.accordion-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const body = btn.nextElementSibling;
      btn.classList.toggle('open');
      body.classList.toggle('open');
    });
  });

  console.log('📂 Fetching CSVs...');
  Promise.all([
    fetch('locations.csv').then(r => r.text()),
    fetch('challenges.csv').then(r => r.text()),
  ])
  .then(([locationsCsv, challengesCsv]) => {

    // ── Parse locations ──────────────────────────────────────────
    const locLines = locationsCsv.trim().split('\n');
    locLines.shift();
    locLines.forEach(line => {
      const [name, lat, lng] = line.split('\t');
      if (!name || !lat || !lng) return;
      allLocations.push({
        name: name.trim(),
        lat:  parseFloat(lat),
        lng:  parseFloat(lng)
      });
    });
    console.log('📍 Locations loaded:', allLocations.length);

    // ── Parse challenges ─────────────────────────────────────────
    const chLines = challengesCsv.trim().split('\n');
    chLines.shift();
    chLines.forEach(line => {
      const parts = line.split(',');
      if (parts.length < 2) return;
      const id        = parseInt(parts[0].trim());
      const type      = parts[1].trim();
      const coinValue = parts[2] && parts[2].trim() !== '' ? parseInt(parts[2].trim()) : null;
      if (isNaN(id) || !type) return;
      allChallenges.push({ id, type, coinValue });
    });
    console.log('⚡ Challenges loaded:', allChallenges.length);

    // ── Abort if data is empty ───────────────────────────────────
    if (allLocations.length === 0 || allChallenges.length === 0) {
      console.error('❌ CSV data empty — aborting boot');
      document.getElementById('sync-status').textContent = '🔴 CSV Error';
      return;
    }

    addMarkers(allLocations);
    console.log('📍 Markers added');

    // ── Firebase listener ────────────────────────────────────────
    console.log('🔥 Starting Firebase listener...');
    listenToGameState((data) => {
      if (data) {
        console.log('🔥 Firebase data received, activeChallenges:',
          Object.keys(data.activeChallenges || {}).length);
        gameState.data = data;
        fixArrays(gameState.data);
        document.getElementById('sync-status').textContent = '🟢 Live';
        renderAll(gameState.data);
        settings.refresh();
      } else {
        console.log('🔥 No Firebase data — creating default state');
        console.log('   allChallenges.length =', allChallenges.length);
        const gs = defaultState(allLocations);
        spawnInitialChallenges(gs);
        console.log('   activeChallenges after spawn:',
          Object.keys(gs.activeChallenges).length);
        pushState(gs);
      }
    }, () => {
      document.getElementById('sync-status').textContent = '🔴 Offline';
    });

  })
  .catch(err => {
    console.error('❌ Boot error:', err);
    document.getElementById('sync-status').textContent = '🔴 Offline';
  });

});
