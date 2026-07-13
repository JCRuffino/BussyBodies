import { mutateState, pushPlayerLocation, removePlayerLocation, listenToPlayerLocations, pushLog } from './firebase.js';
import { states, challengeTypes, allMarkers, gameState, toKey,
         displayValue, MAX_HELD, pickUpChallenge, getMyTeam, esc,
         gameOverGuard, challengeDescription, TOAST_MIN_STOP_VALUE,
         normalizeRoute } from './shared.js';

let map;
let markerCluster;
let userMarker   = null;
let userCircle   = null;
let lastPosition = null;

const challengeLayerMarkers = {};
const playerMarkers = {};

const teamColors = {
  0: '#808080',
  1: '#e63946',
  2: '#1d6fd1',
  3: '#2a9d3f'
};

function makePlayerIcon(color, label) {
  return L.divIcon({
    className: '',
    html:
      '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<div class="player-dot" style="' +
          '--pc:' + color + ';' +
          'width:18px;height:18px;border-radius:50%;' +
          'background:' + color + ';' +
          'border:2px solid white;' +
          'box-shadow:0 2px 6px rgba(0,0,0,0.4);">' +
        '</div>' +
        '<div style="' +
          'background:' + color + ';color:white;' +
          'font-size:10px;font-weight:700;' +
          'padding:1px 5px;border-radius:6px;' +
          'white-space:nowrap;' +
          'box-shadow:0 1px 4px rgba(0,0,0,0.3);' +
          'font-family:Arial,sans-serif;">' +
          esc(label) +
        '</div>' +
      '</div>',
    iconSize: [60, 36],
    iconAnchor: [30, 9],
  });
}

export function initMap() {
  map = L.map('map').setView([50.843443, -0.211705], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  markerCluster = L.markerClusterGroup({
    disableClusteringAtZoom: 16,
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: makeClusterIcon
  });
  map.addLayer(markerCluster);

  map.locate({ watch: true, enableHighAccuracy: true });

  map.on('locationfound', function(e) {
    lastPosition = e.latlng;
    const radius = e.accuracy / 2;
    if (userMarker) {
      userMarker.setLatLng(e.latlng);
      userCircle.setLatLng(e.latlng).setRadius(radius);
    } else {
      userMarker = L.circleMarker(e.latlng, {
        radius: 8, color: 'white', fillColor: '#4285F4', fillOpacity: 1, weight: 3
      }).addTo(map).bindTooltip('You are here', { permanent: false, direction: 'top' });
      userCircle = L.circle(e.latlng, {
        radius, color: '#4285F4', fillOpacity: 0.1, weight: 1
      }).addTo(map);
    }
  });

  initPlayerLocationSharing();
}

export function getMap() {
  return map;
}

// Cluster icon with an outer ring split proportionally by the team
// ownership of the stops inside (grey = unclaimed)
function makeClusterIcon(cluster) {
  const children = cluster.getAllChildMarkers();
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  children.forEach(function(m) {
    const t = m.options._teamIndex || 0;
    counts[t] = (counts[t] || 0) + 1;
  });

  const total = children.length;
  let acc = 0;
  const segments = [];
  [1, 2, 3, 0].forEach(function(t) {
    if (!counts[t]) return;
    const from = (acc / total) * 360;
    acc += counts[t];
    const to = (acc / total) * 360;
    segments.push(teamColors[t] + ' ' + from + 'deg ' + to + 'deg');
  });

  const html =
    '<div style="width:44px;height:44px;border-radius:50%;' +
      'background:conic-gradient(' + segments.join(',') + ');' +
      'display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.35);">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:white;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-weight:bold;font-size:13px;font-family:Arial,sans-serif;color:#374151;">' +
        total +
      '</div>' +
    '</div>';

  return L.divIcon({ className: '', html: html, iconSize: [44, 44], iconAnchor: [22, 22] });
}

export function addMarkers(locations) {
  locations.forEach(function(location) {
    location.stateIndex = 0;
    location.value      = 0;
    location.challenge  = null;

    const marker = L.marker([location.lat, location.lng], {
      icon: makeIcon(0, 0),
      _teamIndex: 0
    });

    markerCluster.addLayer(marker);

    function refreshIcon() {
      marker.options._teamIndex = location.stateIndex;
      marker.setIcon(makeIcon(location.stateIndex, location.value));
      markerCluster.refreshClusters(marker);
      refreshChallengeIcon(location);
    }

    allMarkers[location.name] = { location, marker, refreshIcon };

    marker.on('click', function() { handleMarkerClick(location, marker); });
    marker.bindTooltip(location.name, { permanent: false, direction: 'top' });
  });
}

// Claimed stops are solid team colour with white text; unclaimed stay
// white with a grey outline. One growth ring per full 10 coins of
// value, alternating team colour/white — a permanent fortification look
function makeIcon(stateIndex, value) {
  const color   = states[stateIndex].color;
  const claimed = stateIndex > 0;

  const ringCount = Math.floor((value || 0) / 10);
  const shadows = [];
  for (let i = 1; i <= ringCount; i++) {
    shadows.push('0 0 0 ' + (i * 3) + 'px ' + (i % 2 === 1 ? color : 'white'));
  }
  shadows.push('0 2px 5px rgba(0,0,0,0.35)');

  const html =
    '<div style="' +
      'width:28px;height:28px;' +
      'background:' + (claimed ? color : 'white') + ';' +
      'border:3px solid ' + (claimed ? 'white' : color) + ';' +
      'border-radius:50%;' +
      'box-shadow:' + shadows.join(',') + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'color:' + (claimed ? 'white' : color) + ';' +
      'font-weight:bold;font-size:11px;' +
      'font-family:Arial,sans-serif;' +
    '">' + value + '</div>';

  return L.divIcon({
    className: '',
    html: html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

function refreshChallengeIcon(location) {
  const key = toKey(location.name);
  const ch  = location.challenge;

  if (challengeLayerMarkers[key]) {
    map.removeLayer(challengeLayerMarkers[key]);
    delete challengeLayerMarkers[key];
  }

  if (!ch) return;

  const ct = challengeTypes[ch.type];
  const challengeIcon = L.divIcon({
    className: '',
    html:
      '<div class="challenge-badge" style="' +
        '--pc:' + ct.color + ';' +
        'width:26px;height:26px;' +
        'background:' + ct.color + ';' +
        'border:2px solid white;' +
        'border-radius:50%;' +
        'display:flex;align-items:center;justify-content:center;' +
        'color:white;font-weight:bold;font-size:13px;' +
        'font-family:Arial,sans-serif;' +
      '">' + ct.symbol + '</div>',
    iconSize: [26, 26],
    iconAnchor: [-6, 24],
  });

  const challengeMarker = L.marker(
    L.latLng(location.lat, location.lng),
    { icon: challengeIcon, zIndexOffset: 500, interactive: false }
  ).addTo(map);

  challengeLayerMarkers[key] = challengeMarker;
}

function handleMarkerClick(location, marker) {
  const gs = gameState.data;
  if (!gs || !gs.stops) return;
  const key  = toKey(location.name);
  const stop = gs.stops[key];
  if (!stop) return;

  const myTeam    = getMyTeam();
  const teamNames = gs.teamNames || {};
  const ch        = gs.activeChallenges && gs.activeChallenges[key];
  const ct        = ch ? challengeTypes[ch.type] : null;

  function tName(i) {
    return i === 0 ? 'No Control' : (teamNames[i] || states[i].label);
  }

  const isUnclaimed     = stop.stateIndex === 0;
  const controllingTeam = stop.stateIndex;
  const isOwnStop       = !isUnclaimed && myTeam !== null && controllingTeam === myTeam;

  let teamOptions = '';
  if (isOwnStop) {
    teamOptions = '<option value="' + controllingTeam + '" selected>' +
      esc(tName(controllingTeam)) + '</option>';
  } else {
    [1, 2, 3].forEach(function(i) {
      if (!isUnclaimed && i === controllingTeam) return;
      const isRestricted = myTeam !== null && i !== myTeam;
      const dis = isRestricted ? ' disabled' : '';
      const sel = myTeam === i ? ' selected' : '';
      teamOptions += '<option value="' + i + '"' + dis + sel + '>' + esc(tName(i)) + '</option>';
    });
  }

  // Takeovers must raise the stop's value above its current level
  const minValue = isUnclaimed ? 1 : stop.value + 1;
  let valueOptions = '';
  for (let v = minValue; v <= minValue + 4; v++) {
    valueOptions += '<option value="' + v + '">' + v + '</option>';
  }

  let bankruptHTML = '';
  if (!isUnclaimed && myTeam !== null && myTeam !== controllingTeam) {
    const myCoins   = (gs.coins && gs.coins[myTeam]) || 0;
    const canAfford = myCoins >= stop.value;
    const dis       = canAfford ? ' disabled' : '';
    const bg        = canAfford ? '#9ca3af' : '#f59e0b';
    const cursor    = canAfford ? 'not-allowed' : 'pointer';
    bankruptHTML =
      '<button id="bankrupt-btn"' + dis + ' style="' +
        'margin-top:8px;width:100%;padding:10px;background:' + bg + ';color:white;' +
        'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:' + cursor + ';' +
        'text-align:center;font-family:inherit;transition:filter 0.15s;">' +
        '💸 Bankrupt' +
      '</button>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:4px;text-align:center;">' +
        (canAfford
          ? 'You have enough coins to claim this stop'
          : 'Press if you cannot afford to claim this stop') +
      '</div>';
  }

  let challengeHTML = '';
  if (ch) {
    const failedNote = ch.failedBy && ch.failedBy.length > 0
      ? '<div style="color:#e63946;font-size:11px;margin-bottom:4px;">Failed by: ' +
        ch.failedBy.map(function(i) { return esc(tName(i)); }).join(', ') + '</div>'
      : '';
    const teamBtns = [1, 2, 3].map(function(ti) {
      const isFailed     = ch.failedBy && ch.failedBy.includes(ti);
      const isRestricted = myTeam !== null && myTeam !== ti;
      const heldCount    = (gs.heldChallenges && gs.heldChallenges[ti] || []).length;
      const isFull       = heldCount >= MAX_HELD;
      const bg  = ['', '#e63946', '#1d6fd1', '#2a9d3f'][ti];
      const dis = (isFailed || isRestricted || isFull) ? ' disabled' : '';
      const col = (isFailed || isRestricted || isFull) ? '#ccc' : bg;
      return '<button data-claim-team="' + ti + '"' + dis +
        ' style="flex:1;padding:6px 2px;font-size:12px;border:none;border-radius:6px;' +
        'cursor:pointer;color:white;font-weight:bold;background:' + col + ';">' +
        esc(tName(ti)) + '</button>';
    }).join('');

    const chDesc = challengeDescription(ch.challengeNumber);

    challengeHTML =
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee;">' +
      '<div style="font-weight:bold;font-size:13px;margin-bottom:4px;">' +
      '<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;' +
      'color:white;background:' + ct.color + ';margin-right:4px;">' +
      ct.symbol + ' ' + ct.label + '</span>' +
      '🪙 ' + displayValue(ch) + '</div>' +
      (chDesc
        ? '<div style="font-size:11px;color:#6b7280;font-style:italic;margin-bottom:4px;">' +
          esc(chDesc) + '</div>'
        : '') +
      failedNote +
      '<div style="font-size:12px;color:#555;margin-bottom:6px;">Claim for team:</div>' +
      '<div style="display:flex;gap:5px;">' + teamBtns + '</div>' +
      '</div>';
  }

  // ── Own stop message + claim button style ──────────────────────
  const ownStopMsg = isOwnStop
    ? '<div style="font-size:11px;color:#9ca3af;margin-bottom:6px;text-align:center;">' +
      'This stop is already owned by your team!</div>'
    : '';

  const claimBtnStyle = isOwnStop
    ? 'margin-top:4px;width:100%;padding:10px;background:#9ca3af;color:white;' +
      'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:not-allowed;' +
      'text-align:center;font-family:inherit;opacity:0.6;'
    : 'margin-top:4px;width:100%;padding:10px;background:#1d6fd1;color:white;' +
      'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;' +
      'text-align:center;font-family:inherit;transition:filter 0.15s;';

  const popupContent = document.createElement('div');
  popupContent.className = 'popup-box';
  popupContent.innerHTML =
    '<strong>' + esc(location.name) + '</strong>' +
    '<div class="popup-sub">Current: ' + esc(tName(stop.stateIndex)) +
      ' — Value: ' + stop.value + '</div>' +
    (isOwnStop ? '<label>Controlling Team</label>' : '<label>Claiming Team</label>') +
    '<select id="team-select">' + teamOptions + '</select>' +
    '<label>New Value</label>' +
    '<select id="value-select">' + valueOptions + '</select>' +
    '<label>Route</label>' +
    '<input id="route-input" type="text" maxlength="5" placeholder="e.g. 5A" ' +
      'value="' + esc(stop.route || '') + '" ' +
      'style="width:100%;padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;' +
      'font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;' +
      'margin-bottom:2px;" />' +
    '<div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">' +
      'Enter the route number for this stop (optional)</div>' +
    '<div class="error-msg" id="error-msg"></div>' +
    ownStopMsg +
    '<button id="apply-btn"' + (isOwnStop ? ' disabled' : '') + ' style="' + claimBtnStyle + '">' +
      '🚌 Claim! 🚌' +
    '</button>' +
    bankruptHTML +
    challengeHTML;

  // ── Claim button ───────────────────────────────────────────────
  popupContent.querySelector('#apply-btn').addEventListener('click', async function() {
    if (isOwnStop) return;
    if (gameOverGuard(gameState.data)) return;

    const selectedIndex = parseInt(popupContent.querySelector('#team-select').value);
    const selectedValue = parseInt(popupContent.querySelector('#value-select').value);
    const routeVal      = normalizeRoute(popupContent.querySelector('#route-input').value);
    const errorEl       = popupContent.querySelector('#error-msg');

    if (myTeam !== null && selectedIndex !== myTeam) {
      errorEl.textContent   = 'You can only assign stops to your own team!';
      errorEl.style.display = 'block';
      return;
    }

    // The value you set is the full cost, for first claims and takeovers alike
    const cost = selectedValue;
    let failReason = '';
    let newBalance = 0;

    const committed = await mutateState(gs => {
      const s = gs.stops && gs.stops[key];
      if (!s) return;
      // The popup was built from a snapshot — abort if the stop changed since
      if (s.stateIndex !== stop.stateIndex || s.value !== stop.value) {
        failReason = 'This stop just changed — reopen it to see the latest state.';
        return;
      }
      if ((gs.coins[selectedIndex] || 0) < cost) {
        failReason = 'Not enough coins!';
        return;
      }
      gs.coins[selectedIndex] -= cost;
      newBalance = gs.coins[selectedIndex];
      s.stateIndex = selectedIndex;
      s.value      = selectedValue;
      s.route      = routeVal;

      if (selectedIndex !== 0 && routeVal !== '') {
        if (!gs.routeLog) gs.routeLog = { 1: [], 2: [], 3: [] };
        if (!Array.isArray(gs.routeLog[selectedIndex])) {
          gs.routeLog[selectedIndex] = [];
        }
        if (!gs.routeLog[selectedIndex].includes(routeVal)) {
          gs.routeLog[selectedIndex].push(routeVal);
        }
      }
      return gs;
    });

    if (!committed) {
      errorEl.textContent   = failReason || 'Could not claim — please try again.';
      errorEl.style.display = 'block';
      return;
    }

    // ── Log stop claim / upgrade ───────────────────────────────
    if (isUnclaimed) {
      pushLog({
        timestamp: Date.now(),
        team:      selectedIndex,
        type:      'stop',
        big:       selectedValue >= TOAST_MIN_STOP_VALUE,
        message:   tName(selectedIndex) + ' claimed ' + location.name +
                   ' for ' + selectedValue + ' coin' + (selectedValue !== 1 ? 's' : '') +
                   ' (' + newBalance + ' coins left)',
      });
    } else {
      pushLog({
        timestamp: Date.now(),
        team:      selectedIndex,
        type:      'stop',
        big:       true,
        message:   tName(selectedIndex) + ' took control of ' + location.name +
                   ' at value ' + selectedValue +
                   ' (spent ' + cost + ' coin' + (cost !== 1 ? 's' : '') +
                   ', ' + newBalance + ' left)',
      });
    }

    marker.unbindPopup();
    map.closePopup();
  });

  // ── Bankrupt button ────────────────────────────────────────────
  const bankruptBtn = popupContent.querySelector('#bankrupt-btn');
  if (bankruptBtn) {
    bankruptBtn.addEventListener('click', async function() {
      if (gameOverGuard(gameState.data)) return;
      const myCoins = (gameState.data.coins && gameState.data.coins[myTeam]) || 0;

      const confirmed = window.confirm(
        '💸 Declare Bankruptcy?\n\n' +
        'You will lose ALL your coins (' + myCoins + ').\n' +
        tName(controllingTeam) + ' will receive ' + stop.value + ' coin(s) — ' +
        'equal to the value of this stop.\n\n' +
        'The stop value and ownership will NOT change.\n\n' +
        'Are you sure?'
      );

      if (!confirmed) return;

      const committed = await mutateState(gs => {
        const s = gs.stops && gs.stops[key];
        if (!s || s.stateIndex !== controllingTeam) return;
        gs.coins[controllingTeam] = (gs.coins[controllingTeam] || 0) + s.value;
        gs.coins[myTeam]          = 0;
        return gs;
      });

      if (!committed) return;

      // ── Log bankruptcy ───────────────────────────────────────
      pushLog({
        timestamp: Date.now(),
        team:      myTeam,
        type:      'coin',
        message:   tName(myTeam) + ' declared bankruptcy on ' + location.name +
                   ' — lost all ' + myCoins + ' coin' + (myCoins !== 1 ? 's' : '') + '; ' +
                   tName(controllingTeam) + ' received ' + stop.value,
      });

      marker.unbindPopup();
      map.closePopup();
    });
  }

  // ── Challenge claim buttons ────────────────────────────────────
  if (ch) {
    popupContent.querySelectorAll('[data-claim-team]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (gameOverGuard(gameState.data)) return;
        const teamIndex = parseInt(btn.dataset.claimTeam);

        let picked = null;
        const committed = await mutateState(gs => {
          picked = pickUpChallenge(gs, key, teamIndex);
          return picked ? gs : undefined;
        });
        if (!committed || !picked) return;

        // ── Log challenge pickup ─────────────────────────────
        pushLog({
          timestamp: Date.now(),
          team:      teamIndex,
          type:      'challenge',
          message:   tName(teamIndex) + ' picked up challenge #' +
                     (picked.challengeNumber || '?') + ' from ' + picked.locationName,
        });

        marker.unbindPopup();
        map.closePopup();
      });
    });
  }

  // ── Admin: reset stop ──────────────────────────────────────────
  if (getMyTeam() === null) {
    const adminResetHTML =
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee;">' +
        '<div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px;">⚙️ Admin: Reset Stop</div>' +
        '<button id="admin-reset-btn" style="' +
          'width:100%;padding:8px;background:#f59e0b;color:white;' +
          'border:none;border-radius:8px;font-size:13px;font-weight:700;' +
          'cursor:pointer;font-family:inherit;">' +
          '🔄 Reset This Stop' +
        '</button>' +
      '</div>';

    popupContent.innerHTML += adminResetHTML;

    popupContent.querySelector('#admin-reset-btn').addEventListener('click', function() {
      const teamNames = (gameState.data && gameState.data.teamNames) || {};

      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;' +
        'display:flex;align-items:center;justify-content:center;';

      const box = document.createElement('div');
      box.style.cssText =
        'background:white;border-radius:16px;padding:24px;width:90%;max-width:320px;' +
        'box-shadow:0 8px 40px rgba(0,0,0,0.18);font-family:inherit;';

      const teamOpts = [0, 1, 2, 3].map(i => {
        const name = i === 0 ? 'No Control' : (teamNames[i] || states[i].label);
        return '<option value="' + i + '">' + esc(name) + '</option>';
      }).join('');

      box.innerHTML =
        '<div style="font-size:16px;font-weight:700;margin-bottom:8px;">🔄 Reset Stop</div>' +
        '<div style="font-size:13px;color:#6b7280;margin-bottom:14px;">' +
          'Set the new state for <strong>' + location.name + '</strong>.' +
        '</div>' +
        '<label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px;">Assign to Team</label>' +
        '<select id="reset-team-select" style="width:100%;padding:8px;border:1px solid #e5e7eb;' +
          'border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:10px;outline:none;">' +
          teamOpts +
        '</select>' +
        '<label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px;">Coin Value</label>' +
        '<input id="reset-value-input" type="number" min="0" value="0" ' +
          'style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;' +
          'font-size:13px;font-family:inherit;margin-bottom:14px;outline:none;" />' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="reset-confirm" style="flex:1;padding:10px;background:#f59e0b;color:white;' +
            'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Confirm</button>' +
          '<button id="reset-cancel" style="flex:1;padding:10px;background:#f3f4f6;color:#374151;' +
            'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Cancel</button>' +
        '</div>';

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      box.querySelector('#reset-cancel').addEventListener('click', () => {
        document.body.removeChild(overlay);
      });

      box.querySelector('#reset-confirm').addEventListener('click', async () => {
        const newTeam  = parseInt(box.querySelector('#reset-team-select').value);
        const newValue = Math.max(0, parseInt(box.querySelector('#reset-value-input').value) || 0);

        await mutateState(gs => {
          const s = gs.stops && gs.stops[key];
          if (!s) return;
          s.stateIndex = newTeam;
          s.value      = newValue;
          s.route      = '';
          s.challenge  = null;
          if (gs.activeChallenges && gs.activeChallenges[key]) {
            delete gs.activeChallenges[key];
          }
          return gs;
        });

        document.body.removeChild(overlay);
        marker.unbindPopup();
        map.closePopup();
      });
    });
  }

  // Unbind first: rebinding on an already-bound marker leaves Leaflet's
  // internal click-toggle armed, which instantly re-closes the popup on
  // every tap after the popup has once been dismissed without an action
  marker.unbindPopup();
  marker.bindPopup(popupContent).openPopup();
}

// ── PLAYER LOCATION SHARING ───────────────────────────────────────
function initPlayerLocationSharing() {

  function pushIfOnTeam() {
    const team = getMyTeam();
    if (!team || !lastPosition) return;
    const gs    = gameState.data;
    const names = (gs && gs.teamNames) || {};
    const name  = names[team] || states[team].label;
    pushPlayerLocation(team, lastPosition.lat, lastPosition.lng, name);
  }

  function clearIfNoTeam() {
    if (!getMyTeam()) removePlayerLocation();
  }

  pushIfOnTeam();
  setInterval(pushIfOnTeam, 5000);
  setInterval(clearIfNoTeam, 5000);

  window.addEventListener('beforeunload', () => {
    removePlayerLocation();
  });

  listenToPlayerLocations(function(players) {
    const now = Date.now();
    const STALE_MS = 30000;

    Object.keys(playerMarkers).forEach(id => {
      if (!players[id] || (now - players[id].ts) > STALE_MS) {
        map.removeLayer(playerMarkers[id]);
        delete playerMarkers[id];
      }
    });

    Object.entries(players).forEach(function(entry) {
      const id     = entry[0];
      const player = entry[1];
      if ((now - player.ts) > STALE_MS) return;

      const color  = teamColors[player.team] || '#808080';
      const icon   = makePlayerIcon(color, player.name);
      const latlng = L.latLng(player.lat, player.lng);

      if (playerMarkers[id]) {
        playerMarkers[id].setLatLng(latlng);
        playerMarkers[id].setIcon(icon);
      } else {
        playerMarkers[id] = L.marker(latlng, {
          icon: icon,
          zIndexOffset: 1000,
          interactive: false
        }).addTo(map);
      }
    });
  });
}
