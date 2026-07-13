import { pushState, mutateState, pushLog, listenToGameState, clearLog, listenToLog } from './firebase.js';
import { initMap, addMarkers, getMap } from './map.js';
import { initSettings } from './settings.js';
import { renderAll } from './ui.js';
import { allLocations, allChallenges, gameState, fixArrays, toKey,
         spawnChallenge, drawChallenge, buildPool, esc, states,
         formatCountdown } from './shared.js';

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
  let cachedEntries = [];

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

    const teamNames = (gameState.data && gameState.data.teamNames) || {};

    // Each entry is badged with the team it belongs to, in that team's colour
    function teamBadge(t) {
      if (!t || !states[t]) return { color: '#6b7280', label: 'Admin' };
      return { color: states[t].color, label: teamNames[t] || states[t].label };
    }

    container.innerHTML = filtered.map(e => {
      const time  = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Timer events (countdown started/ended) get a full-width banner
      if (e.type === 'timer') {
        return (
          '<div style="background:#111827;color:white;border-radius:12px;padding:10px 14px;' +
          'margin-bottom:8px;text-align:center;font-size:13px;font-weight:700;">' +
            esc(e.message) +
            ' <span style="opacity:0.6;font-weight:600;font-size:11px;">' + time + '</span>' +
          '</div>'
        );
      }

      const badge = teamBadge(e.team);
      return (
        '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;' +
        'padding:10px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;' +
            'font-weight:700;color:white;background:' + badge.color + ';">' + esc(badge.label) + '</span>' +
            '<span style="font-size:11px;color:#9ca3af;font-weight:600;">' + time + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:#374151;font-weight:500;">' + esc(e.message) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ── Toasts for big events ──────────────────────────────────────
  const toastColors = { 0: '#6b7280', 1: '#e63946', 2: '#1d6fd1', 3: '#2a9d3f' };

  function showToast(e) {
    const cont = document.getElementById('toast-container');
    const div  = document.createElement('div');
    div.className = 'toast';
    div.style.borderLeft = '5px solid ' + (toastColors[e.team] || '#6b7280');
    div.textContent = e.message;
    cont.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 300);
    }, 6000);
  }

  let lastToastTs = null;
  function handleToasts(entries) {
    const newest = entries.length ? entries[0].timestamp : 0;
    if (lastToastTs === null) {
      lastToastTs = newest; // don't replay the backlog on page load
      return;
    }
    entries
      .filter(e => e.big && e.timestamp > lastToastTs)
      .reverse()
      .forEach(showToast);
    if (newest > lastToastTs) lastToastTs = newest;
  }

  // One permanent log listener feeds the history screen and the toasts
  listenToLog(entries => {
    cachedEntries = entries;
    if (document.getElementById('screen-history').classList.contains('active')) {
      renderHistory(entries);
    }
    handleToasts(entries);
  });

  // ── Countdown ticker ───────────────────────────────────────────
  let endLogAttempted = false;

  function maybeLogGameEnd() {
    if (endLogAttempted) return;
    endLogAttempted = true;
    // The endLogged flag is flipped in a transaction so exactly one
    // device writes the GAME OVER entry
    mutateState(gs => {
      if (!gs.timer || !gs.timer.endsAt) return;
      if (Date.now() < gs.timer.endsAt) return;
      if (gs.timer.endLogged) return;
      gs.timer.endLogged = true;
      return gs;
    }).then(committed => {
      if (committed) {
        pushLog({
          timestamp: Date.now(),
          team:      0,
          type:      'timer',
          big:       true,
          message:   '🏁 GAME OVER — the countdown has ended! Check the leaderboard for final standings.',
        });
      }
    });
  }

  setInterval(() => {
    const pill = document.getElementById('countdown-pill');
    const t    = gameState.data && gameState.data.timer;
    if (!t || !t.endsAt) {
      pill.style.display = 'none';
      endLogAttempted = false;
      return;
    }
    const remaining = t.endsAt - Date.now();
    pill.style.display = 'block';
    if (remaining <= 0) {
      pill.textContent = '⏱️ GAME OVER';
      pill.classList.add('ended');
      maybeLogGameEnd();
    } else {
      pill.textContent = '⏱️ ' + formatCountdown(remaining);
      pill.classList.remove('ended');
      endLogAttempted = false;
    }
  }, 1000);

  // ── Nav ────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('screen-' + btn.dataset.screen).classList.add('active');
      if (btn.dataset.screen === 'map')     setTimeout(() => getMap().invalidateSize(), 50);
      if (btn.dataset.screen === 'history') renderHistory(cachedEntries);
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
      // Description is everything after the third comma, so it may itself contain commas
      const description = parts.length > 3 ? parts.slice(3).join(',').trim() : '';
      if (isNaN(id) || !type) return;
      allChallenges.push({
        id, type, coinValue,
        description: description ||
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit — challenge text coming soon.',
      });
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
