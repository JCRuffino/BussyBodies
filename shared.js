export const MAX_ACTIVE = 6;
export const MAX_HELD   = 3;

export const states = [
  { label: "No Control", color: "#808080" },
  { label: "Team A",     color: "#e63946" },
  { label: "Team B",     color: "#1d6fd1" },
  { label: "Team C",     color: "#2a9d3f" },
];

// Escape user-supplied strings before inserting into innerHTML
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getMyTeam() {
  const v = localStorage.getItem('myTeam');
  return v ? parseInt(v) : null;
}

export function setMyTeam(t) {
  if (t === null) localStorage.removeItem('myTeam');
  else localStorage.setItem('myTeam', String(t));
}

export const challengeTypes = {
  star:    { symbol: '★', label: 'Standard', color: '#f4a300' },
  percent: { symbol: '%', label: 'Variable',  color: '#9b59b6' },
  dollar:  { symbol: '$', label: 'Steal',     color: '#e63946' },
};

export const allMarkers    = {};
export const allLocations  = [];
export const allChallenges = []; // populated from challenges.csv
export const gameState = { data:null};  


export function toKey(name) {
  return name.replace(/[.#$\/\[\]]/g, '_');
}

export function displayValue(ch) {
  if (!ch) return '';
  if (ch.type === 'percent') return '?';
  if (ch.type === 'dollar')  return ch.stealPercent + '%';
  return ch.coinValue;
}

export function countActive(gs) {
  return Object.keys(gs.activeChallenges || {}).length;
}

export function fixArrays(gs) {
  if (!gs.heldChallenges) {
    gs.heldChallenges = { 1: [], 2: [], 3: [] };
  } else {
    [1, 2, 3].forEach(i => {
      const hc = gs.heldChallenges[i];
      gs.heldChallenges[i] = hc && Array.isArray(hc) ? hc : (hc ? Object.values(hc) : []);
    });
  }
  if (gs.usedStops && !Array.isArray(gs.usedStops))
    gs.usedStops = Object.values(gs.usedStops);
  if (gs.pool && gs.pool.shuffledIds && !Array.isArray(gs.pool.shuffledIds))
    gs.pool.shuffledIds = Object.values(gs.pool.shuffledIds);
}

export function resolveSteal(gs, teamIndex, stealPercent) {
  [1, 2, 3].filter(i => i !== teamIndex).forEach(ti => {
    const take = Math.floor(gs.coins[ti] * (stealPercent / 100));
    gs.coins[ti] -= take;
    gs.coins[teamIndex] += take;
  });
}

export function pickRandomStop(gs, excludedKeys) {
  excludedKeys = excludedKeys || [];
  const used   = Array.isArray(gs.usedStops) ? gs.usedStops : Object.values(gs.usedStops || {});
  const active = Object.keys(gs.activeChallenges || {});
  const available = allLocations.filter(loc => {
    const k = toKey(loc.name);
    return !active.includes(k) && !used.includes(k) && !excludedKeys.includes(k);
  });
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function pickRandomStopForFailed(gs, excludedKeys) {
  excludedKeys = excludedKeys || [];
  const active = Object.keys(gs.activeChallenges || {});
  const available = allLocations.filter(loc => {
    const k = toKey(loc.name);
    return !active.includes(k) && !excludedKeys.includes(k);
  });
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function spawnChallenge(gs, forcedStop, challengeData) {
  const stop = forcedStop || pickRandomStop(gs, []);
  if (!stop) return;
  const ch = challengeData;
  if (!ch) return;
  const key = toKey(stop.name);
  if (!Array.isArray(gs.usedStops)) gs.usedStops = [];
  if (!gs.usedStops.includes(key)) gs.usedStops.push(key);
  if (!gs.activeChallenges) gs.activeChallenges = {};
  gs.activeChallenges[key] = { ...ch, locationName: stop.name };
  if (gs.stops[key]) gs.stops[key].challenge = ch;
}

// Move an active challenge into a team's held list; returns the picked
// challenge, or null if it no longer exists or the team is at MAX_HELD
export function pickUpChallenge(gs, key, teamIndex) {
  const reg = gs.activeChallenges && gs.activeChallenges[key];
  if (!reg) return null;
  if (!gs.heldChallenges) gs.heldChallenges = { 1: [], 2: [], 3: [] };
  if (!gs.heldChallenges[teamIndex]) gs.heldChallenges[teamIndex] = [];
  if (gs.heldChallenges[teamIndex].length >= MAX_HELD) return null;
  gs.heldChallenges[teamIndex].push({
    challengeNumber: reg.challengeNumber,
    locationName:    reg.locationName,
    type:            reg.type,
    coinValue:       reg.coinValue,
    stealPercent:    reg.stealPercent,
    failedBy:        [...(reg.failedBy || [])],
    failCount:       reg.failCount || 0,
    pickedUpBy:      teamIndex,
  });
  if (gs.stops[key]) gs.stops[key].challenge = null;
  delete gs.activeChallenges[key];
  if (countActive(gs) < MAX_ACTIVE) {
    spawnChallenge(gs, null, drawChallenge(gs.pool));
  }
  return reg;
}

export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Build a fresh pool from allChallenges — called at game init/reset
export function buildPool() {
  const ids = allChallenges.map(c => c.id);
  shuffleArray(ids);
  return {
    shuffledIds: ids,
    currentIdx:  0,
  };
}

// Draw the next challenge from the pool — no duplicates ever
export function drawChallenge(pool) {
  if (pool.currentIdx >= pool.shuffledIds.length) return null;

  const id = pool.shuffledIds[pool.currentIdx++];
  const template = allChallenges.find(c => c.id === id);
  if (!template) return null;

  return {
    challengeNumber: template.id,
    type:            template.type,
    coinValue:       template.type === 'star'    ? template.coinValue : null,
    stealPercent:    template.type === 'dollar'  ? 30                 : null,
    failedBy:        [],
    failCount:       0,
  };
}

export function sanitiseForFirebase(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    return value === undefined ? null : value;
  }));
}
// ── ROUTE BONUS ───────────────────────────────────────────────────
// Returns a map of teamIndex → Set of unique route values
export function getTeamRoutes(gs) {
  const routes = { 1: new Set(), 2: new Set(), 3: new Set() };
  Object.values(gs.stops || {}).forEach(stop => {
    if (stop.stateIndex && stop.route && stop.route.trim() !== '') {
      const t = stop.stateIndex;
      if (routes[t]) routes[t].add(stop.route.trim().toUpperCase());
    }
  });
  // Merge in routeLog (historical routes, not just currently held stops)
  const log = gs.routeLog || {};
  [1, 2, 3].forEach(t => {
    (log[t] || []).forEach(r => routes[t].add(r));
  });
  return routes;
}

// ── DISTANCE BONUS ────────────────────────────────────────────────
// Returns a map of teamIndex → furthest distance in metres between any two owned stops
export function getTeamMaxDistances(gs, locations) {
  const teamStops = { 1: [], 2: [], 3: [] };

  Object.entries(gs.stops || {}).forEach(([key, stop]) => {
    if (!stop.stateIndex) return;
    const loc = locations.find(l => toKey(l.name) === key);
    if (loc) teamStops[stop.stateIndex].push(loc);
  });

  const result = { 1: 0, 2: 0, 3: 0 };
  [1, 2, 3].forEach(t => {
    const locs = teamStops[t];
    let max = 0;
    for (let i = 0; i < locs.length; i++) {
      for (let j = i + 1; j < locs.length; j++) {
        const d = haversine(locs[i].lat, locs[i].lng, locs[j].lat, locs[j].lng);
        if (d > max) max = d;
      }
    }
    result[t] = Math.round(max);
  });
  return result;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function formatDistance(metres) {
  if (metres >= 1000) return (metres / 1000).toFixed(2) + ' km';
  return metres + ' m';
}

let modalCallback = null;

export function showVariableModal(teamIndex, failCount, callback) {
  const overlay = document.getElementById('modal-overlay');
  const input   = document.getElementById('modal-input');
  document.getElementById('modal-title').textContent = states[teamIndex].label + ' — Variable Challenge Complete';
  input.value = '';
  input.style.border = '';
  const note = document.getElementById('modal-note');
  if (failCount > 0) {
    note.innerHTML = '⚠️ Previously failed <strong>' + failCount + '</strong> time(s). Add <strong>' + (failCount * 10) + ' extra coins</strong>.';
  } else {
    note.textContent = 'Enter the agreed coin reward for this variable challenge.';
  }
  modalCallback = callback;
  overlay.classList.add('active');
  document.getElementById('modal-confirm').onclick = function () {
    const val = parseInt(input.value);
    if (isNaN(val) || val < 0) {
      input.style.border = '1px solid red';
      return;
    }
    overlay.classList.remove('active');
    if (modalCallback) modalCallback(val);
  };
  document.getElementById('modal-cancel').onclick = function () {
    modalCallback = null;
    overlay.classList.remove('active');
  };
}

console.log('✅ shared.js loaded, gameState:', gameState);
