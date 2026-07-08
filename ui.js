import { mutateState, pushLog } from './firebase.js';
import { allMarkers, states, challengeTypes, gameState, toKey, displayValue,
         MAX_HELD, pickUpChallenge, spawnChallenge, pickRandomStopForFailed,
         resolveSteal, showVariableModal, getMyTeam,
         getTeamRoutes, getTeamMaxDistances, formatDistance,
         allLocations, allChallenges, esc } from './shared.js';

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

  // Sort teams by total (stops + bonus) descending
  const sorted = [1, 2, 3].sort((a, b) =>
    (counts[b] + bonus[b]) - (counts[a] + bonus[a])
  );

  const lbEl = document.getElementById('leaderboard-rows');
  if (lbEl) {
    lbEl.innerHTML = '';
    sorted.forEach((i, rank) => {
      const name  = names[i] || states[i].label;
      const color = states[i].color;
      const medal = ['🥇', '🥈', '🥉'][rank];
      const bonusHTML = bonus[i] > 0
        ? '<span style="font-size:13px;font-weight:600;color:#f59e0b;margin-left:4px;">(+' + bonus[i] + ')</span>'
        : '';

      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML =
        '<div class="lb-left">' +
          '<div class="lb-dot" style="background:' + color + '"></div>' +
          '<span>' + medal + ' ' + esc(name) + '</span>' +
        '</div>' +
        '<div class="lb-value" id="count-' + i + '">' + counts[i] + bonusHTML + '</div>';
      lbEl.appendChild(row);
    });
  } else {
    // Fallback: update existing elements if no leaderboard-rows container
    [1, 2, 3].forEach(i => {
      const el     = document.getElementById('count-' + i);
      const nameEl = document.getElementById('lb-name-' + i);
      if (nameEl) nameEl.textContent = names[i] || states[i].label;
      if (!el) return;
      if (bonus[i] > 0) {
        el.innerHTML = counts[i] +
          '<span style="font-size:13px;font-weight:600;color:#f59e0b;margin-left:4px;">(+' + bonus[i] + ')</span>';
      } else {
        el.textContent = counts[i];
      }
    });
  }
}


function updateCoins(gs) {
  const names = (gs && gs.teamNames) || {};
  const el = document.getElementById('coin-rows');
  if (!el) return;

  const sorted = [1, 2, 3].sort((a, b) => (gs.coins[b] || 0) - (gs.coins[a] || 0));

  el.innerHTML = '';
  sorted.forEach((i, rank) => {
    const name  = names[i] || states[i].label;
    const color = states[i].color;
    const medal = ['🥇', '🥈', '🥉'][rank];

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left">' +
        '<div class="lb-dot" style="background:' + color + '"></div>' +
        '<span>' + medal + ' ' + esc(name) + '</span>' +
      '</div>' +
      '<div class="lb-value" id="coins-' + i + '">🪙 ' + (gs.coins[i] || 0) + '</div>';
    el.appendChild(row);
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
  // Live updates re-render this panel — carry over whatever the admin
  // was typing (and where their cursor was) so input isn't wiped
  const existing = document.getElementById('admin-panel');
  let prevChNum = '', prevCoinTeam = '', prevCoinAmount = '', prevFocusId = null;
  if (existing) {
    prevChNum      = existing.querySelector('#admin-ch-num').value;
    prevCoinTeam   = existing.querySelector('#admin-coin-team').value;
    prevCoinAmount = existing.querySelector('#admin-coin-amount').value;
    if (existing.contains(document.activeElement)) prevFocusId = document.activeElement.id;
    existing.remove();
  }

  if (getMyTeam() !== null) return;

  const teamNames = (gs.teamNames) || {};

  function tName(i) {
    return i === 0 ? 'No Control' : (teamNames[i] || states[i].label);
  }

  const panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.style.cssText =
    'background:white;border:2px solid #f59e0b;border-radius:14px;' +
    'padding:16px;margin-bottom:16px;box-shadow:0 1px 6px rgba(0,0,0,0.08);';

  panel.innerHTML =
    '<div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:12px;">⚙️ Admin Controls</div>' +

    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">Inject Challenge by Number</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
      '<input id="admin-ch-num" type="number" min="1" placeholder="Challenge #" ' +
        'style="flex:1;padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;' +
        'font-size:13px;font-family:inherit;outline:none;" />' +
    '</div>' +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Spawn on map or assign to team:</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">' +
      '<button id="admin-spawn-map" class="btn btn-primary btn-sm">🗺️ Spawn on Map</button>' +
      '<button id="admin-hold-1" class="btn btn-sm" style="background:#e63946;color:white;">' + esc(tName(1)) + '</button>' +
      '<button id="admin-hold-2" class="btn btn-sm" style="background:#1d6fd1;color:white;">' + esc(tName(2)) + '</button>' +
      '<button id="admin-hold-3" class="btn btn-sm" style="background:#2a9d3f;color:white;">' + esc(tName(3)) + '</button>' +
    '</div>' +
    '<div id="admin-ch-error" style="font-size:12px;color:#e63946;font-weight:600;display:none;margin-bottom:8px;"></div>' +

    '<div style="height:1px;background:#f3f4f6;margin-bottom:12px;"></div>' +
    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">Edit Coin Balance</div>' +
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">' +
      '<select id="admin-coin-team" style="padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;outline:none;">' +
        '<option value="1">' + esc(tName(1)) + '</option>' +
        '<option value="2">' + esc(tName(2)) + '</option>' +
        '<option value="3">' + esc(tName(3)) + '</option>' +
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

  // ── Challenge injector logic ───────────────────────────────────
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

  panel.querySelector('#admin-spawn-map').addEventListener('click', async () => {
    const ch = getChallenge();
    if (!ch) return;
    let spawned = false;
    const committed = await mutateState(gs => {
      const stop = pickRandomStopForFailed(gs, []);
      if (!stop) return;
      spawnChallenge(gs, stop, ch);
      spawned = true;
      return gs;
    });
    if (!committed || !spawned) {
      document.getElementById('admin-ch-error').textContent   = 'No available stops.';
      document.getElementById('admin-ch-error').style.display = 'block';
      return;
    }
    pushLog({
      timestamp: Date.now(),
      team:      0,
      type:      'challenge',
      message:   'Admin spawned challenge #' + ch.challengeNumber + ' onto the map',
    });
    document.getElementById('admin-ch-num').value = '';
  });

  [1, 2, 3].forEach(ti => {
    panel.querySelector('#admin-hold-' + ti).addEventListener('click', async () => {
      const ch = getChallenge();
      if (!ch) return;
      const committed = await mutateState(gs => {
        if (!gs.heldChallenges) gs.heldChallenges = { 1: [], 2: [], 3: [] };
        if (!gs.heldChallenges[ti]) gs.heldChallenges[ti] = [];
        gs.heldChallenges[ti].push({
          ...ch,
          locationName: 'Admin Assigned',
          pickedUpBy:   ti,
        });
        return gs;
      });
      if (!committed) return;
      pushLog({
        timestamp: Date.now(),
        team:      ti,
        type:      'challenge',
        message:   'Admin assigned challenge #' + ch.challengeNumber + ' to ' + tName(ti),
      });
      document.getElementById('admin-ch-num').value = '';
    });
  });

  // ── Coin editor logic ──────────────────────────────────────────
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

  panel.querySelector('#admin-coin-add').addEventListener('click', async () => {
    const v = getCoinInputs();
    if (!v) return;
    await mutateState(gs => {
      gs.coins[v.team] = Math.max(0, (gs.coins[v.team] || 0) + v.amount);
      return gs;
    });
    pushLog({
      timestamp: Date.now(),
      team:      v.team,
      type:      'coin',
      message:   'Admin added ' + v.amount + ' coin' + (v.amount !== 1 ? 's' : '') +
                 ' to ' + tName(v.team),
    });
    document.getElementById('admin-coin-amount').value = '';
  });

  panel.querySelector('#admin-coin-remove').addEventListener('click', async () => {
    const v = getCoinInputs();
    if (!v) return;
    await mutateState(gs => {
      gs.coins[v.team] = Math.max(0, (gs.coins[v.team] || 0) - v.amount);
      return gs;
    });
    pushLog({
      timestamp: Date.now(),
      team:      v.team,
      type:      'coin',
      message:   'Admin removed ' + v.amount + ' coin' + (v.amount !== 1 ? 's' : '') +
                 ' from ' + tName(v.team),
    });
    document.getElementById('admin-coin-amount').value = '';
  });

  panel.querySelector('#admin-coin-set').addEventListener('click', async () => {
    const v = getCoinInputs();
    if (!v) return;
    await mutateState(gs => {
      gs.coins[v.team] = Math.max(0, v.amount);
      return gs;
    });
    pushLog({
      timestamp: Date.now(),
      team:      v.team,
      type:      'coin',
      message:   'Admin set ' + tName(v.team) + '\'s coins to ' + v.amount,
    });
    document.getElementById('admin-coin-amount').value = '';
  });

  const screen = document.getElementById('screen-challenges');
  screen.appendChild(panel);

  panel.querySelector('#admin-ch-num').value      = prevChNum;
  panel.querySelector('#admin-coin-amount').value = prevCoinAmount;
  if (prevCoinTeam) panel.querySelector('#admin-coin-team').value = prevCoinTeam;
  if (prevFocusId) {
    const el = panel.querySelector('#' + prevFocusId);
    if (el) el.focus();
  }
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

  function tName(i) {
    return i === 0 ? 'No Control' : (teamNames[i] || states[i].label);
  }

  activeList.innerHTML = '';
  activeKeys.forEach(key => {
    const ch = gs.activeChallenges[key];
    const ct = challengeTypes[ch.type];

    const failedNote = ch.failedBy && ch.failedBy.length > 0
      ? ' <span style="color:#e63946;font-size:11px;font-weight:600;">(failed: ' +
        ch.failedBy.map(i => esc(teamNames[i] || states[i].label)).join(', ') + ')</span>'
      : '';

    const teamButtons = [1, 2, 3].map(ti => {
      const isFailed     = ch.failedBy && ch.failedBy.includes(ti);
      const isRestricted = myTeam !== null && myTeam !== ti;
      const heldCount    = (gs.heldChallenges[ti] || []).length;
      const isFull       = heldCount >= MAX_HELD;
      const cls   = ['', 'btn btn-team-a', 'btn btn-team-b', 'btn btn-team-c'][ti];
      const dis   = (isFailed || isRestricted || isFull) ? ' disabled' : '';
      const name  = teamNames[ti] || states[ti].label;
      const title = isFull ? ' title="Held challenge limit reached"' : '';
      return '<button class="' + cls + '" data-key="' + esc(key) +
        '" data-team="' + ti + '"' + dis + title + '>' + esc(name) + '</button>';
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
        esc(ch.locationName) +
      '</div>' +
      '<div class="card-reward">🪙 ' + displayValue(ch) + failedNote + '</div>' +
      '<div class="card-buttons">' + teamButtons + '</div>';

    card.querySelectorAll('.card-buttons button:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teamIndex = parseInt(btn.dataset.team);
        const k         = btn.dataset.key;

        let picked = null;
        const committed = await mutateState(gs2 => {
          picked = pickUpChallenge(gs2, k, teamIndex);
          return picked ? gs2 : undefined;
        });
        if (!committed || !picked) return;

        pushLog({
          timestamp: Date.now(),
          team:      teamIndex,
          type:      'challenge',
          message:   tName(teamIndex) + ' picked up challenge #' +
                     (picked.challengeNumber || '?') + ' from ' + picked.locationName,
        });
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

    function tName(i) {
    return i === 0 ? 'No Control' : (teamNames[i] || states[i].label);
  }

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
    label.innerHTML = dot + ' ' + esc(teamName);
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
          esc(ch.locationName) +
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
        const doComplete = async (amount) => {
          let realCh = null;
          const committed = await mutateState(gs2 => {
            const arr = gs2.heldChallenges[teamIndex];
            if (!arr) return;
            const realIdx = findIdx(arr);
            if (realIdx === -1) return;
            realCh = arr[realIdx];

            if (realCh.type === 'dollar') resolveSteal(gs2, teamIndex, realCh.stealPercent);
            else gs2.coins[teamIndex] = (gs2.coins[teamIndex] || 0) + amount;

            arr.splice(realIdx, 1);
            return gs2;
          });
          if (!committed || !realCh) return;

          pushLog({
            timestamp: Date.now(),
            team:      teamIndex,
            type:      'challenge',
            message:   tName(teamIndex) + ' completed challenge #' + (realCh.challengeNumber || '?') +
                       ' from ' + realCh.locationName +
                       (realCh.type === 'dollar' ? ' (steal)' : ' (+' + amount + ' coins)'),
          });
        };

        if (ch.type === 'percent') {
          showVariableModal(teamIndex, ch.failCount || 0, doComplete);
        } else {
          doComplete(ch.type === 'star' ? ch.coinValue : 0);
        }
      });

      hCard.querySelector('.btn-neutral').addEventListener('click', async () => {
        let failedCh = null;
        const committed = await mutateState(gs2 => {
          const arr = gs2.heldChallenges[teamIndex];
          if (!arr) return;
          const realIdx = findIdx(arr);
          if (realIdx === -1) return;
          const failed = arr.splice(realIdx, 1)[0];
          failedCh = failed;

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
          return gs2;
        });
        if (!committed || !failedCh) return;

        pushLog({
          timestamp: Date.now(),
          team:      teamIndex,
          type:      'challenge',
          message:   tName(teamIndex) + ' failed challenge #' + (failedCh.challengeNumber || '?') +
                     ' from ' + failedCh.locationName + ' — respawned on map',
        });
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
    const name      = teamNames[t] || states[t].label;
    const color     = states[t].color;
    const routeList = [...routes[t]].sort().join(', ') || '—';
    const count     = routes[t].size;
    const isWinner  = t === routeWinner;

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left" style="flex-direction:column;align-items:flex-start;gap:2px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="lb-dot" style="background:' + color + '"></div>' +
          '<span>' + esc(name) + (isWinner ? ' 🏆' : '') + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;padding-left:24px;line-height:1.4;">' +
          esc(routeList) +
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
    const name     = teamNames[t] || states[t].label;
    const color    = states[t].color;
    const dist     = distances[t];
    const isWinner = t === distWinner;

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-left">' +
        '<div class="lb-dot" style="background:' + color + '"></div>' +
        '<span>' + esc(name) + (isWinner ? ' 🏆' : '') + '</span>' +
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
