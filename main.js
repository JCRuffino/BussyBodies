import { pushState, listenToGameState } from './firebase.js';
import { initMap, addMarkers, getMap } from './map.js';
import { initSettings } from './settings.js';
import { renderAll } from './ui.js';
import { allLocations, allChallenges, gameState, fixArrays, toKey,
         spawnChallenge, drawChallenge, buildPool } from './shared.js';

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
  });

  const mapDiv = document.getElementById('map');
  console.log('🗺️ #map div found:', mapDiv);

  try {
    initMap();
    console.log('✅ initMap() completed');
  } catch (e) {
    console.error('❌ initMap() failed:', e);
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('screen-' + btn.dataset.screen).classList.add('active');
      if (btn.dataset.screen === 'map') setTimeout(() => getMap().invalidateSize(), 50);
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

    // ── Firebase listener starts ONLY after CSVs are ready ───────
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
    });

  })
  .catch(err => {
    console.error('❌ Boot error:', err);
    document.getElementById('sync-status').textContent = '🔴 Offline';
  });

});
