import { pushState } from './firebase.js';
import { allMarkers, states, baseStates, challengeTypes, gameState, toKey, displayValue,
         countActive, MAX_ACTIVE, spawnChallenge, pickRandomStopForFailed,
         resolveSteal, showVariableModal, drawChallenge, getMyTeam,
         getTeamRoutes, getTeamMaxDistances, formatDistance,
         allLocations } from './shared.js';

export function renderAll(gs) {
  updateLeaderboard(gs);
  updateCoins(gs);
  updateAllMarkers(gs);
  renderActivePanel(gs);
  renderHeldPanel(gs);
  renderRouteBonus(gs);
  renderDistanceBonus(gs);
}

function updateLeaderboard(gs) {
  const names  = (gs && gs.teamNames) || {};
  const counts = [0, 0, 0, 0];
  Object.values(gs.stops || {}).forEach(s => {
    counts[s.stateIndex] = (counts[s.stateIndex] || 0) + 1;
  });
  counts.forEach((c, i) => {
    const el = document.getElementById('count-' + i);
    if (el) el.textContent = c;
  });
  [1, 2, 3].forEach(i => {
    const nameEl = document.getElementById('lb-name-' + i);
    if (nameEl) nameEl.textContent = names[i] || baseStates[i].label;
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

function renderActivePanel(gs) {
  const activeList = document.getElementById('active-challenges-list');
  const activeKeys = Object.keys(gs.activeChallenges || {});

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
      const ct = challengeTypes[ch.type];

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
          '<button class="btn btn-amber">✅ Complete</button>' +
          '<button class="btn btn-neutral">❌ Failed</button>' +
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

  const sorted = [1, 2, 3].sort((a, b) => routes[b].size - routes[a].size);

  el.innerHTML = '';
  sorted.forEach(t => {
    const name      = teamNames[t] || baseStates[t].label;
    const color     = baseStates[t].color;
    const routeList = [...routes[t]].sort().join(', ') || '—';
    const count     = routes[t].size;

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left" style="flex-direction:column;align-items:flex-start;gap:2px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="lb-dot" style="background:' + color + '"></div>' +
          '<span>' + name + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;padding-left:24px;line-height:1.4;">' +
          routeList +
        '</div>' +
      '</div>' +
      '<div class="lb-value">' + count + '</div>';
    el.appendChild(row);
  });
}

function renderDistanceBonus(gs) {
  const el = document.getElementById('lb-distance-bonus');
  if (!el) return;

  const teamNames = (gs.teamNames) || {};
  const distances = getTeamMaxDistances(gs, allLocations);

  const sorted = [1, 2, 3].sort((a, b) => distances[b] - distances[a]);

  el.innerHTML = '';
  sorted.forEach(t => {
    const name  = teamNames[t] || baseStates[t].label;
    const color = baseStates[t].color;
    const dist  = distances[t];

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left">' +
        '<div class="lb-dot" style="background:' + color + '"></div>' +
        '<span>' + name + '</span>' +
      '</div>' +
      '<div class="lb-value">' + (dist > 0 ? formatDistance(dist) : '—') + '</div>';
    el.appendChild(row);
  });
}
