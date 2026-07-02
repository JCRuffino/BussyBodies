import { pushState } from './firebase.js';
import { allMarkers, states, baseStates, challengeTypes, gameState, toKey, displayValue,
         countActive, MAX_ACTIVE, spawnChallenge, pickRandomStopForFailed,
         resolveSteal, showVariableModal, drawChallenge, getMyTeam,
         getTeamRoutes, getTeamMaxDistances, formatDistance,
         allLocations, allChallenges } from './shared.js';

export function renderAll(gs) {
  updateLeaderboard(gs);
  updateCoins(gs);
  updateAllMarkers(gs);
  renderActivePanel(gs);
  renderHeldPanel(gs);
  renderRouteBonus(gs);
  renderDistanceBonus(gs);
  renderAdminPanel(gs);
}

function updateLeaderboard(gs) {
  const names  = (gs && gs.teamNames) || {};
  const counts = [0, 0, 0, 0];
  Object.values(gs.stops || {}).forEach(s => {
    counts[s.stateIndex] = (counts[s.stateIndex] || 0) + 1;
  });

  const routes    = getTeamRoutes(gs);
  const distances = getTeamMaxDistances(gs, allLocations);

  const routeCounts  = { 1: routes[1].size, 2: routes[2].size, 3: routes[3].size };
  const maxRoutes    = Math.max(...Object.values(routeCounts));
  const routeWinners = maxRoutes > 0
    ? [1, 2, 3].filter(t => routeCounts[t] === maxRoutes)
    : [];
  const routeWinner  = routeWinners.length === 1 ? routeWinners[0] : null;

  const maxDist      = Math.max(distances[1], distances[2], distances[3]);
  const distWinners  = maxDist > 0
    ? [1, 2, 3].filter(t => distances[t] === maxDist)
    : [];
  const distWinner   = distWinners.length === 1 ? distWinners[0] : null;

  const bonus = { 1: 0, 2: 0, 3: 0 };
  if (routeWinner) bonus[routeWinner] += 5;
  if (distWinner)  bonus[distWinner]  += 5;

  const el0 = document.getElementById('count-0');
  if (el0) el0.textContent = counts[0];

  [1, 2, 3].forEach(i => {
    const el     = document.getElementById('count-' + i);
    const nameEl = document.getElementById('lb-name-' + i);
    if (nameEl) nameEl.textContent = names[i] || baseStates[i].label;
    if (!el) return;
    if (bonus[i] > 0) {
      el.innerHTML =
        counts[i] +
        '<span style="font-size:13px;font-weight:600;color:#f59e0b;margin-left:4px;">' +
          '(+' + bonus[i] + ')' +
        '</span>';
    } else {
      el.textContent = counts[i];
    }
  });
}

function updateCoins(gs) {
  const names = (gs && gs.teamNames) || {};
  [1, 2, 3].forEach(i => {
    const el = document.getElementById('coins-' + i);
    if (el) el.textContent = gs.coins[i];
    const nameEl = document.getElementById('coins-name-' + i);
    if (nameEl) nameEl.textContent = names[i] || baseStates[i].label;
  });
}

function updateAllMarkers(gs) {
  Object.keys(allMarkers).forEach(name => {
    const entry = allMarkers[name];
    const key   = toKey(name);
    const stop  = gs.stops[key];
    if (!stop) return;
    entry.location.stateIndex = stop.stateIndex;
    entry.location.value      = stop.value;
    entry.location.challenge  = stop.challenge || null;
    entry.refreshIcon();
  });
}

// ── ADMIN: CHALLENGE INJECTOR + COIN EDITOR ───────────────────────
function renderAdminPanel(gs) {
  const existing = document.getElementById('admin-panel');
  if (existing) existing.remove();

  if (getMyTeam() !== null) return;

  const teamNames = (gs.teamNames) || {};

  function tName(i) {
    return i === 0 ? 'No Control' : (teamNames[i] || baseStates[i].label);
  }

  const panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.style.cssText =
    'background:white;border:2px solid #f59e0b;border-radius:14px;' +
    'padding:16px;margin-bottom:16px;box-shadow:0 1px 6px rgba(0,0,0,0.08);';

  panel.innerHTML =
    '<div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:12px;">⚙️ Admin Controls</div>' +

    // ── Challenge injector ──────────────────────────────────────
    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">Inject Challenge by Number</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
      '<input id="admin-ch-num" type="number" min="1" placeholder="Challenge #" ' +
        'style="flex:1;padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;' +
        'font-size:13px;font-family:inherit;outline:none;" />' +
    '</div>' +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Spawn on map or assign to team:</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">' +
      '<button id="admin-spawn-map" class="btn btn-primary btn-sm">🗺️ Spawn on Map</button>' +
      '<button id="admin-hold-1" class="btn btn-sm" style="background:#e63946;color:white;">' + tName(1) + '</button>' +
      '<button id="admin-hold-2" class="btn btn-sm" style="background:#1d6fd1;color:white;">' + tName(2) + '</button>' +
      '<button id="admin-hold-3" class="btn btn-sm" style="background:#2a9d3f;color:white;">' + tName(3) + '</button>' +
    '</div>' +
    '<div id="admin-ch-error" style="font-size:12px;color:#e63946;font-weight:600;display:none;margin-bottom:8px;"></div>' +

    // ── Coin editor ─────────────────────────────────────────────
    '<div style="height:1px;background:#f3f4f6;margin-bottom:12px;"></div>' +
    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">Edit Coin Balance</div>' +
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">' +
      '<select id="admin-coin-team" style="padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;outline:none;">' +
        '<option value="1">' + tName(1) + '</option>' +
        '<option value="2">' + tName(2) + '</option>' +
        '<option value="3">' + tName(3) + '</option>' +
      '</select>' +
      '<input id="admin-coin-amount" type="number" placeholder="Amount (use − to remove)" ' +
        'style="flex:1;min-width:80px;padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;' +
        'font-size:13px;font-family:inherit;outline:none;" />' +
    '</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<button id="admin-coin-add" class="btn btn-success btn-sm">＋ Add</button>' +
      '<button id="admin-coin-remove" class="btn btn-danger btn-sm">－ Remove</button>' +
      '<button id="admin-coin-set" class="btn btn-neutral btn-sm">= Set</button>' +
    '</div>' +
    '<div id="admin-coin-error" style="font-size:12px;color:#e63946;font-weight:600;display:none;margin-top:6px;"></div>';

  // ── Challenge injector logic ────────────────────────────────────
  function getChallenge() {
    const num      = parseInt(document.getElementById('admin-ch-num').value);
    const errorEl  = document.getElementById('admin-ch-error');
    const template = allChallenges.find(c => c.id === num);
    if (!template) {
      errorEl.textContent   = 'Challenge #' + num + ' not found.';
      errorEl.style.display = 'block';
      return null;
    }
    errorEl.style.display = 'none';
    return {
      challengeNumber: template.id,
      type:            template.type,
      coinValue:       template.type === 'star'   ? template.coinValue : null,
      stealPercent:    template.type === 'dollar' ? 30                 : null,
      failedBy:        [],
      failCount:       0,
    };
  }

  panel.querySelector('#admin-spawn-map').addEventListener('click', () => {
    const ch = getChallenge();
    if (!ch) return;
    const gs2  = JSON.parse(JSON.stringify(gameState.data));
    const stop = pickRandomStopForFailed(gs2, []);
    if (!stop) {
      document.getElementById('admin-ch-error').textContent   = 'No available stops.';
      document.getElementById('admin-ch-error').style.display = 'block';
      return;
    }
    spawnChallenge(gs2, stop, ch);
    pushState(gs2);
    document.getElementById('admin-ch-num').value = '';
  });

  [1, 2, 3].forEach(ti => {
    panel.querySelector('#admin-hold-' + ti).addEventListener('click', () => {
      const ch = getChallenge();
      if (!ch) return;
      const gs2 = JSON.parse(JSON.stringify(gameState.data));
      if (!gs2.heldChallenges[ti]) gs2.heldChallenges[ti] = [];
      gs2.heldChallenges[ti].push({
        ...ch,
        locationName: 'Admin Assigned',
        pickedUpBy:   ti,
      });
      pushState(gs2);
      document.getElementById('admin-ch-num').value = '';
    });
  });

  // ── Coin editor logic ───────────────────────────────────────────
  function getCoinInputs() {
    const team    = parseInt(document.getElementById('admin-coin-team').value);
    const amount  = parseInt(document.getElementById('admin-coin-amount').value);
    const errorEl = document.getElementById('admin-coin-error');
    if (isNaN(amount)) {
      errorEl.textContent   = 'Enter a valid number.';
      errorEl.style.display = 'block';
      return null;
    }
    errorEl.style.display = 'none';
    return { team, amount };
  }

  panel.querySelector('#admin-coin-add').addEventListener('click', () => {
    const v = getCoinInputs();
    if (!v) return;
    const gs2 = JSON.parse(JSON.stringify(gameState.data));
    gs2.coins[v.team] = Math.max(0, (gs2.coins[v.team] || 0) + v.amount);
    pushState(gs2);
    document.getElementById('admin-coin-amount').value = '';
  });

  panel.querySelector('#admin-coin-remove').addEventListener('click', () => {
    const v = getCoinInputs();
    if (!v) return;
    const gs2 = JSON.parse(JSON.stringify(gameState.data));
    gs2.coins[v.team] = Math.max(0, (gs2.coins[v.team] || 0) - v.amount);
    pushState(gs2);
    document.getElementById('admin-coin-amount').value = '';
  });

  panel.querySelector('#admin-coin-set').addEventListener('click', () => {
    const v = getCoinInputs();
    if (!v) return;
    const gs2 = JSON.parse(JSON.stringify(gameState.data));
    gs2.coins[v.team] = Math.max(0, v.amount);
    pushState(gs2);
    document.getElementById('admin-coin-amount').value = '';
  });

  // Insert at the top of the challenges screen
  const screen = document.getElementById('screen-challenges');
  screen.appendChild(panel);

}

function renderActivePanel(gs) {
  const activeList = document.getElementById('active-challenges-list');
  const activeKeys = Object.keys(gs.activeChallenges || {});

  renderAdminPanel(gs);

  if (activeKeys.length === 0) {
    activeList.innerHTML = '<span class="no-challenges">No active challenges</span>';
    return;
  }

  const myTeam    = getMyTeam();
  const teamNames = (gs.teamNames) || {};

  activeList.innerHTML = '';
  activeKeys.forEach(key => {
    const ch = gs.activeChallenges[key];
    const ct = challengeTypes[ch.type];

    const failedNote = ch.failedBy && ch.failedBy.length > 0
      ? ' <span style="color:#e63946;font-size:11px;font-weight:600;">(failed: ' +
        ch.failedBy.map(i => teamNames[i] || states[i].label).join(', ') + ')</span>'
      : '';

    const teamButtons = [1, 2, 3].map(ti => {
      const isFailed     = ch.failedBy && ch.failedBy.includes(ti);
      const isRestricted = myTeam !== null && myTeam !== ti;
      const cls = ['', 'btn btn-team-a', 'btn btn-team-b', 'btn btn-team-c'][ti];
      const dis = (isFailed || isRestricted) ? ' disabled' : '';
      const name = teamNames[ti] || states[ti].label;
      return '<button class="' + cls + '" data-key="' + key +
        '" data-team="' + ti + '"' + dis + '>' + name + '</button>';
    }).join('');

    const numBadge = ch.challengeNumber
      ? '<span class="card-badge" style="background:#374151">#' + ch.challengeNumber + '</span>'
      : '';

    const card = document.createElement('div');
    card.className = 'challenge-card';
    card.innerHTML =
      '<div class="card-title">' +
        '<span class="card-badge" style="background:' + ct.color + '">' +
          ct.symbol + ' ' + ct.label +
        '</span>' +
        numBadge +
        ch.locationName +
      '</div>' +
      '<div class="card-reward">🪙 ' + displayValue(ch) + failedNote + '</div>' +
      '<div class="card-buttons">' + teamButtons + '</div>';

    card.querySelectorAll('.card-buttons button:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const teamIndex = parseInt(btn.dataset.team);
        const k         = btn.dataset.key;
        const gs2 = JSON.parse(JSON.stringify(gameState.data));
        const reg = gs2.activeChallenges[k];
        if (!reg) return;

        if (!gs2.heldChallenges[teamIndex]) gs2.heldChallenges[teamIndex] = [];
        gs2.heldChallenges[teamIndex].push({
          challengeNumber: reg.challengeNumber,
          locationName:    reg.locationName,
          type:            reg.type,
          coinValue:       reg.coinValue,
          stealPercent:    reg.stealPercent,
          failedBy:        [...(reg.failedBy || [])],
          failCount:       reg.failCount || 0,
          pickedUpBy:      teamIndex,
        });

        if (gs2.stops[k]) gs2.stops[k].challenge = null;
        delete gs2.activeChallenges[k];

        if (countActive(gs2) < MAX_ACTIVE) {
          spawnChallenge(gs2, null, drawChallenge(gs2.pool));
        }

        pushState(gs2);
      });
    });

    activeList.appendChild(card);
  });
}
function renderHeldPanel(gs) {
  const heldList  = document.getElementById('held-challenges-list');
  const held      = gs.heldChallenges || { 1: [], 2: [], 3: [] };
  const teamNames = (gs.teamNames) || {};
  const hasAny    = (held[1] || []).length + (held[2] || []).length + (held[3] || []).length > 0;

  if (!hasAny) {
    heldList.innerHTML = '<span class="no-challenges">No held challenges</span>';
    return;
  }

  heldList.innerHTML = '';

  [1, 2, 3].forEach(teamIndex => {
    const teamHeld = held[teamIndex] || [];
    if (teamHeld.length === 0) return;

    const teamName = teamNames[teamIndex] || states[teamIndex].label;
    const dot = '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' +
      states[teamIndex].color + ';flex-shrink:0;"></span>';
    const label = document.createElement('div');
    label.className = 'held-team-label';
    label.innerHTML = dot + ' ' + teamName;
    heldList.appendChild(label);

    teamHeld.forEach((ch) => {
      const ct       = challengeTypes[ch.type];
      const myTeam   = getMyTeam();
      const canAct   = myTeam === null || myTeam === teamIndex;
      const dis      = canAct ? '' : ' disabled';
      const cursor   = canAct ? '' : 'cursor:not-allowed;';

      const numBadge = ch.challengeNumber
        ? '<span class="card-badge" style="background:#374151">#' + ch.challengeNumber + '</span>'
        : '';

      const hCard = document.createElement('div');
      hCard.className = 'held-card';
      hCard.innerHTML =
        '<div class="held-title">' +
          '<span class="card-badge" style="background:' + ct.color + '">' + ct.symbol + '</span>' +
          numBadge +
          ch.locationName +
        '</div>' +
        '<div class="held-reward">🪙 ' + displayValue(ch) + '</div>' +
        '<div class="held-buttons">' +
          '<button class="btn btn-amber"' + dis + ' style="' + cursor + '">✅ Complete</button>' +
          '<button class="btn btn-neutral"' + dis + ' style="' + cursor + '">❌ Failed</button>' +
        '</div>';

      function findIdx(arr) {
        return arr.findIndex(c =>
          c.challengeNumber === ch.challengeNumber &&
          c.locationName    === ch.locationName
        );
      }

      hCard.querySelector('.btn-amber').addEventListener('click', () => {
        const doComplete = (amount) => {
          const gs2 = JSON.parse(JSON.stringify(gameState.data));
          const arr = gs2.heldChallenges[teamIndex];
          const realIdx = findIdx(arr);
          if (realIdx === -1) return;
          const realCh = arr[realIdx];

          if (realCh.type === 'dollar') resolveSteal(gs2, teamIndex, realCh.stealPercent);
          else gs2.coins[teamIndex] += amount;

          arr.splice(realIdx, 1);
          pushState(gs2);
        };

        if (ch.type === 'percent') {
          showVariableModal(teamIndex, ch.failCount || 0, doComplete);
        } else {
          doComplete(ch.type === 'star' ? ch.coinValue : 0);
        }
      });

      hCard.querySelector('.btn-neutral').addEventListener('click', () => {
        const gs2 = JSON.parse(JSON.stringify(gameState.data));
        const arr = gs2.heldChallenges[teamIndex];
        const realIdx = findIdx(arr);
        if (realIdx === -1) return;
        const failed = arr.splice(realIdx, 1)[0];

        const newFailedBy  = [...(failed.failedBy || []), teamIndex];
        const newFailCount = (failed.failCount || 0) + 1;

        let respawn;
        if (failed.type === 'percent') {
          respawn = {
            challengeNumber: failed.challengeNumber,
            type:            'percent',
            coinValue:       null,
            stealPercent:    null,
            failedBy:        newFailedBy,
            failCount:       newFailCount,
          };
        } else if (failed.type === 'dollar') {
          respawn = {
            challengeNumber: failed.challengeNumber,
            type:            'dollar',
            coinValue:       null,
            stealPercent:    (failed.stealPercent || 30) + 5,
            failedBy:        newFailedBy,
            failCount:       newFailCount,
          };
        } else {
          respawn = {
            challengeNumber: failed.challengeNumber,
            type:            'star',
            coinValue:       failed.coinValue + 10,
            stealPercent:    null,
            failedBy:        newFailedBy,
            failCount:       newFailCount,
          };
        }

        const stop = pickRandomStopForFailed(gs2, []);
        if (stop) spawnChallenge(gs2, stop, respawn);
        pushState(gs2);
      });

      heldList.appendChild(hCard);
    });
  });
}


function renderRouteBonus(gs) {
  const el = document.getElementById('lb-route-bonus');
  if (!el) return;

  const teamNames = (gs.teamNames) || {};
  const routes    = getTeamRoutes(gs);

  const maxRoutes    = Math.max(...[1, 2, 3].map(t => routes[t].size));
  const routeWinners = maxRoutes > 0
    ? [1, 2, 3].filter(t => routes[t].size === maxRoutes)
    : [];
  const routeWinner  = routeWinners.length === 1 ? routeWinners[0] : null;

  const sorted = [1, 2, 3].sort((a, b) => routes[b].size - routes[a].size);

  el.innerHTML = '';
  sorted.forEach(t => {
    const name      = teamNames[t] || baseStates[t].label;
    const color     = baseStates[t].color;
    const routeList = [...routes[t]].sort().join(', ') || '—';
    const count     = routes[t].size;
    const isWinner  = t === routeWinner;

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left" style="flex-direction:column;align-items:flex-start;gap:2px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="lb-dot" style="background:' + color + '"></div>' +
          '<span>' + name + (isWinner ? ' 🏆' : '') + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;padding-left:24px;line-height:1.4;">' +
          routeList +
        '</div>' +
      '</div>' +
      '<div class="lb-value">' + count + '</div>';
    el.appendChild(row);
  });

  if (routeWinner === null && maxRoutes > 0) {
    const tie = document.createElement('div');
    tie.style.cssText = 'font-size:11px;color:#f59e0b;font-weight:600;margin-top:6px;text-align:center;';
    tie.textContent   = '⚠️ Tie — no bonus awarded';
    el.appendChild(tie);
  }
}

function renderDistanceBonus(gs) {
  const el = document.getElementById('lb-distance-bonus');
  if (!el) return;

  const teamNames = (gs.teamNames) || {};
  const distances = getTeamMaxDistances(gs, allLocations);

  const maxDist     = Math.max(distances[1], distances[2], distances[3]);
  const distWinners = maxDist > 0
    ? [1, 2, 3].filter(t => distances[t] === maxDist)
    : [];
  const distWinner  = distWinners.length === 1 ? distWinners[0] : null;

  const sorted = [1, 2, 3].sort((a, b) => distances[b] - distances[a]);

  el.innerHTML = '';
  sorted.forEach(t => {
    const name     = teamNames[t] || baseStates[t].label;
    const color    = baseStates[t].color;
    const dist     = distances[t];
    const isWinner = t === distWinner;

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left">' +
        '<div class="lb-dot" style="background:' + color + '"></div>' +
        '<span>' + name + (isWinner ? ' 🏆' : '') + '</span>' +
      '</div>' +
      '<div class="lb-value">' + (dist > 0 ? formatDistance(dist) : '—') + '</div>';
    el.appendChild(row);
  });

  if (distWinner === null && maxDist > 0) {
    const tie = document.createElement('div');
    tie.style.cssText = 'font-size:11px;color:#f59e0b;font-weight:600;margin-top:6px;text-align:center;';
    tie.textContent   = '⚠️ Tie — no bonus awarded';
    el.appendChild(tie);
  }
}
