import { pushState, pushPlayerLocation, removePlayerLocation, listenToPlayerLocations } from './firebase.js';
import { states, challengeTypes, allMarkers, gameState, toKey,
         displayValue, countActive, MAX_ACTIVE, spawnChallenge,
         drawChallenge, getMyTeam, baseStates } from './shared.js';

let map;
let markerCluster;
let userMarker = null;
let userCircle = null;

const challengeLayerMarkers = {};
const playerMarkers = {};

const teamColors = {
  0: '#808080',
  1: '#e63946',
  2: '#1d6fd1',
  3: '#2a9d3f'
};

function makePieRingSvg(counts, total, size) {
  if (total === 0) return '';
  const cx = size / 2;
  const cy = size / 2;
  const r  = (size / 2) - 2;
  const strokeW = 6;
  let segments = '';
  let cumAngle = -Math.PI / 2;

  Object.entries(counts).forEach(function(entry) {
    const team  = entry[0];
    const count = entry[1];
    if (count === 0) return;
    const angle = (count / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const color = teamColors[team];
    segments += '<path d="M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 +
      ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 +
      ' Z" fill="' + color + '" opacity="0.9"/>';
    cumAngle += angle;
  });

  segments += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - strokeW) + '" fill="white"/>';

  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' + segments + '</svg>';
}

function makePlayerIcon(color, label) {
  return L.divIcon({
    className: '',
    html:
      '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<div style="' +
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
          label +
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
    iconCreateFunction: function(cluster) {
      const children = cluster.getAllChildMarkers();
      const total = children.length;
      const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
      children.forEach(function(m) {
        const team = m.options._teamIndex !== undefined ? m.options._teamIndex : 0;
        counts[team] = (counts[team] || 0) + 1;
      });

      const dominant = parseInt(
        Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; })[0][0]
      );
      const centerColor = teamColors[dominant];
      const size = 44;
      const pieSvg = makePieRingSvg(counts, total, size);

      const html =
        '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;">' +
          pieSvg +
          '<div style="' +
            'position:absolute;inset:0;' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-weight:bold;font-size:13px;' +
            'font-family:Arial,sans-serif;' +
            'color:' + centerColor + ';' +
          '">' + total + '</div>' +
        '</div>';

      return L.divIcon({
        html: html,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    }
  });
  map.addLayer(markerCluster);

  map.locate({ watch: true, enableHighAccuracy: true });

  map.on('locationfound', function(e) {
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

  // ── Start player location sharing once map is ready ───────────
  initPlayerLocationSharing();
}

export function getMap() {
  return map;
}

export function addMarkers(locations) {
  locations.forEach(function(location) {
    location.stateIndex = 0;
    location.value      = 0;
    location.challenge  = null;

    const marker = L.marker([location.lat, location.lng], {
      icon: makeIcon(states[0].color, 0),
      _teamIndex: 0
    });

    markerCluster.addLayer(marker);

    function refreshIcon() {
      marker.options._teamIndex = location.stateIndex;
      marker.setIcon(makeIcon(
        states[location.stateIndex].color,
        location.value
      ));
      markerCluster.refreshClusters(marker);
      refreshChallengeIcon(location);
    }

    allMarkers[location.name] = { location, marker, refreshIcon };

    marker.on('click', function() { handleMarkerClick(location, marker); });
    marker.bindTooltip(location.name, { permanent: false, direction: 'top' });
  });
}

function makeIcon(color, value) {
  const html =
    '<div style="' +
      'width:28px;height:28px;' +
      'background:white;' +
      'border:3px solid ' + color + ';' +
      'border-radius:50%;' +
      'box-shadow:0 2px 5px rgba(0,0,0,0.35);' +
      'display:flex;align-items:center;justify-content:center;' +
      'color:' + color + ';' +
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
      '<div style="' +
        'width:22px;height:22px;' +
        'background:' + ct.color + ';' +
        'border:2px solid white;' +
        'border-radius:50%;' +
        'box-shadow:0 2px 5px rgba(0,0,0,0.4);' +
        'display:flex;align-items:center;justify-content:center;' +
        'color:white;font-weight:bold;font-size:12px;' +
        'font-family:Arial,sans-serif;' +
      '">' + ct.symbol + '</div>',
    iconSize: [22, 22],
    iconAnchor: [-6, 22],
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

  let challengeHTML = '';
  if (ch) {
    const failedNote = ch.failedBy && ch.failedBy.length > 0
      ? '<div style="color:#e63946;font-size:11px;margin-bottom:4px;">Failed by: ' +
        ch.failedBy.map(function(i) { return tName(i); }).join(', ') + '</div>'
      : '';
    const teamBtns = [1, 2, 3].map(function(ti) {
      const isFailed     = ch.failedBy && ch.failedBy.includes(ti);
      const isRestricted = myTeam !== null && myTeam !== ti;
      const bg  = ['', '#e63946', '#1d6fd1', '#2a9d3f'][ti];
      const dis = (isFailed || isRestricted) ? ' disabled' : '';
      const col = (isFailed || isRestricted) ? '#ccc' : bg;
      return '<button data-claim-team="' + ti + '"' + dis +
        ' style="flex:1;padding:6px 2px;font-size:12px;border:none;border-radius:6px;' +
        'cursor:pointer;color:white;font-weight:bold;background:' + col + ';">' +
        tName(ti) + '</button>';
    }).join('');
    challengeHTML =
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee;">' +
      '<div style="font-weight:bold;font-size:13px;margin-bottom:4px;">' +
      '<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;' +
      'color:white;background:' + ct.color + ';margin-right:4px;">' +
      ct.symbol + ' ' + ct.label + '</span>' +
      '🪙 ' + displayValue(ch) + '</div>' +
      failedNote +
      '<div style="font-size:12px;color:#555;margin-bottom:6px;">Claim for team:</div>' +
      '<div style="display:flex;gap:5px;">' + teamBtns + '</div>' +
      '</div>';
  }

  const teamOptions = states.map(function(s, i) {
    const isRestricted = myTeam !== null && i !== 0 && i !== myTeam;
    const dis = isRestricted ? ' disabled' : '';
    return '<option value="' + i + '"' +
      (i === stop.stateIndex ? ' selected' : '') + dis + '>' +
      tName(i) + '</option>';
  }).join('');

  const minValue = Math.max(1, stop.value);
  let valueOptions = '';
  for (let v = minValue; v <= minValue + 4; v++) {
    valueOptions += '<option value="' + v + '"' +
      (v === stop.value ? ' selected' : '') + '>' + v + '</option>';
  }

  const popupContent = document.createElement('div');
  popupContent.className = 'popup-box';
  popupContent.innerHTML =
    '<strong>' + location.name + '</strong>' +
    '<div class="popup-sub">Current: ' + tName(stop.stateIndex) +
      ' — Value: ' + stop.value + '</div>' +
    '<label>Controlling Team</label>' +
    '<select id="team-select">' + teamOptions + '</select>' +
    '<label>New Value</label>' +
    '<select id="value-select">' + valueOptions + '</select>' +
    '<label>Route</label>' +
    '<input id="route-input" type="text" maxlength="5" placeholder="e.g. 5A" ' +
      'value="' + (stop.route || '') + '" ' +
      'style="width:100%;padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;' +
      'font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;' +
      'margin-bottom:2px;" />' +
    '<div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">' +
      'Enter the route number for this stop (optional)</div>' +
    '<div class="error-msg" id="error-msg"></div>' +
    '<button id="apply-btn" style="' +
      'margin-top:4px;width:100%;padding:10px;background:#1d6fd1;color:white;' +
      'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;' +
      'text-align:center;font-family:inherit;transition:filter 0.15s;">' +
      '🚌 Claim! 🚌</button>' +
    challengeHTML;

  popupContent.querySelector('#apply-btn').addEventListener('click', function() {
    const gs2data       = gameState.data;
    const selectedIndex = parseInt(popupContent.querySelector('#team-select').value);
    const selectedValue = parseInt(popupContent.querySelector('#value-select').value);
    const routeVal      = popupContent.querySelector('#route-input').value.trim().toUpperCase();
    const errorEl       = popupContent.querySelector('#error-msg');

    if (myTeam !== null && selectedIndex !== 0 && selectedIndex !== myTeam) {
      errorEl.textContent   = 'You can only assign stops to your own team!';
      errorEl.style.display = 'block';
      return;
    }

    const cost = selectedValue - stop.value;
    if (selectedIndex !== 0 && cost > 0 && gs2data.coins[selectedIndex] < cost) {
      errorEl.textContent   = 'Not enough coins!';
      errorEl.style.display = 'block';
      return;
    }

    const gs2 = JSON.parse(JSON.stringify(gs2data));

    if (selectedIndex !== 0 && cost > 0) gs2.coins[selectedIndex] -= cost;

    gs2.stops[key].stateIndex = selectedIndex;
    gs2.stops[key].value      = selectedValue;
    gs2.stops[key].route      = routeVal;

    if (selectedIndex !== 0 && routeVal !== '') {
      if (!gs2.routeLog) gs2.routeLog = { 1: [], 2: [], 3: [] };
      if (!Array.isArray(gs2.routeLog[selectedIndex])) {
        gs2.routeLog[selectedIndex] = [];
      }
      if (!gs2.routeLog[selectedIndex].includes(routeVal)) {
        gs2.routeLog[selectedIndex].push(routeVal);
      }
    }

    pushState(gs2);
    marker.unbindPopup();
    map.closePopup();
  });

  if (ch) {
    popupContent.querySelectorAll('[data-claim-team]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const teamIndex = parseInt(btn.dataset.claimTeam);
        const gs2 = JSON.parse(JSON.stringify(gameState.data));
        const reg = gs2.activeChallenges[key];
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

        if (gs2.stops[key]) gs2.stops[key].challenge = null;
        delete gs2.activeChallenges[key];

        if (countActive(gs2) < MAX_ACTIVE) {
          spawnChallenge(gs2, null, drawChallenge(gs2.pool));
        }

        pushState(gs2);
        marker.unbindPopup();
        map.closePopup();
      });
    });
  }

  marker.bindPopup(popupContent).openPopup();
}

// ── PLAYER LOCATION SHARING ───────────────────────────────────────
function initPlayerLocationSharing() {

  // Push own location every 5 seconds if on a team
  function pushIfOnTeam() {
    const team = getMyTeam();
    if (!team || !map) return;
    const gs    = gameState.data;
    const names = (gs && gs.teamNames) || {};
    const name  = names[team] || baseStates[team].label;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          pushPlayerLocation(team, pos.coords.latitude, pos.coords.longitude, name);
        },
        null,
        { enableHighAccuracy: true }
      );
    }
  }

  // Remove own location when no team or page unloads
  function clearIfNoTeam() {
    if (!getMyTeam()) removePlayerLocation();
  }

  pushIfOnTeam();
  setInterval(pushIfOnTeam, 5000);
  setInterval(clearIfNoTeam, 5000);

  window.addEventListener('beforeunload', () => {
    removePlayerLocation();
  });

  // Listen to all player locations and render dots
  listenToPlayerLocations(function(players) {
    const now = Date.now();
    const STALE_MS = 30000; // remove dots older than 30 seconds

    // Remove stale or gone markers
    Object.keys(playerMarkers).forEach(id => {
      if (!players[id] || (now - players[id].ts) > STALE_MS) {
        map.removeLayer(playerMarkers[id]);
        delete playerMarkers[id];
      }
    });

    // Add or update markers
    Object.entries(players).forEach(function(entry) {
      const id     = entry[0];
      const player = entry[1];
      if ((now - player.ts) > STALE_MS) return;

      const color = teamColors[player.team] || '#808080';
      const icon  = makePlayerIcon(color, player.name);
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
