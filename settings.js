import { pushState } from './firebase.js';
import { gameState, getMyTeam, setMyTeam, baseStates,
         drawChallenge, spawnChallenge, allLocations, shuffleArray, toKey } from './shared.js';

export function initSettings(resetCallback) {

  // ── Team assignment ───────────────────────────────────────────────
  const assignBtns   = document.querySelectorAll('.team-assign-btn');
  const currentLabel = document.getElementById('current-team-label');
  const activeClasses = { 1: 'active-a', 2: 'active-b', 3: 'active-c' };

  function refreshAssignUI() {
    const myTeam = getMyTeam();
    const gs     = gameState.data;
    const names  = (gs && gs.teamNames) || {};
    assignBtns.forEach(btn => {
      const t    = parseInt(btn.dataset.team);
      const name = names[t] || baseStates[t].label;
      btn.classList.remove('active-a', 'active-b', 'active-c');
      if (myTeam === t) {
        btn.textContent = 'Leave ' + name;
        btn.classList.add(activeClasses[t]);
      } else {
        btn.textContent = 'Join ' + name;
      }
    });
    if (myTeam) {
      const name = (gameState.data && gameState.data.teamNames && gameState.data.teamNames[myTeam])
        || baseStates[myTeam].label;
      currentLabel.textContent = '✅ You are on ' + name;
      currentLabel.style.color = baseStates[myTeam].color;
    } else {
      currentLabel.textContent = 'No team assigned — spectator mode';
      currentLabel.style.color = '#555';
    }
    refreshResetBtn();
  }

    assignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = parseInt(btn.dataset.team);
      if (getMyTeam() === t) setMyTeam(null);
      else setMyTeam(t);
      refreshAssignUI();
      // Re-render UI so challenge restrictions update immediately
      if (gameState.data) {
        import('./ui.js').then(({ renderAll }) => renderAll(gameState.data));
      }
    });
  });


  // ── Team names ────────────────────────────────────────────────────
  [1, 2, 3].forEach(t => {
    const input   = document.getElementById('name-input-' + t);
    const saveBtn = document.querySelector('.btn-save-name[data-team="' + t + '"]');

    saveBtn.addEventListener('click', () => {
      const val = input.value.trim().slice(0, 12);
      if (!val) return;
      const gs2 = JSON.parse(JSON.stringify(gameState.data));
      if (!gs2.teamNames) gs2.teamNames = {};
      gs2.teamNames[t] = val;
      pushState(gs2);
    });
  });

    // ── Reset ─────────────────────────────────────────────────────────
  const RESET_PASSWORD = 'bankofcum'; // 🔑 Change this

  const resetBtn       = document.getElementById('reset-btn');
  const blockedMsg     = document.getElementById('reset-blocked-msg');
  const resetOverlay   = document.getElementById('reset-overlay');
  const confirmBtn     = document.getElementById('reset-confirm-btn');
  const cancelBtn      = document.getElementById('reset-cancel-btn');
  const passwordInput  = document.getElementById('reset-password-input');
  const passwordError  = document.getElementById('reset-password-error');

  function refreshResetBtn() {
    if (getMyTeam()) {
      resetBtn.disabled        = true;
      resetBtn.style.opacity   = '0.4';
      blockedMsg.style.display = 'block';
    } else {
      resetBtn.disabled        = false;
      resetBtn.style.opacity   = '1';
      blockedMsg.style.display = 'none';
    }
  }

  function closeResetModal() {
    resetOverlay.classList.remove('active');
    passwordInput.value        = '';
    passwordError.style.display = 'none';
    passwordInput.style.borderColor = '#e5e7eb';
  }

  resetBtn.addEventListener('click', () => {
    if (getMyTeam()) return;
    closeResetModal(); // clear any previous state
    resetOverlay.classList.add('active');
    setTimeout(() => passwordInput.focus(), 50);
  });

  cancelBtn.addEventListener('click', closeResetModal);

  // Close on backdrop click
  resetOverlay.addEventListener('click', (e) => {
    if (e.target === resetOverlay) closeResetModal();
  });

  confirmBtn.addEventListener('click', () => {
    if (passwordInput.value === RESET_PASSWORD) {
      closeResetModal();
      resetCallback();
    } else {
      passwordError.style.display     = 'block';
      passwordInput.style.borderColor = '#e63946';
      passwordInput.value             = '';
      passwordInput.focus();
    }
  });

  // Allow pressing Enter in the password field
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.click();
  });

  // ── Public API ────────────────────────────────────────────────────
  function refresh() {
    const gs    = gameState.data;
    const names = (gs && gs.teamNames) || {};
    [1, 2, 3].forEach(t => {
      const input = document.getElementById('name-input-' + t);
      if (input && !input.matches(':focus')) {
        input.value = names[t] || baseStates[t].label;
      }
    });
    refreshAssignUI();
  }

  refreshAssignUI();
  return { refresh };
}
