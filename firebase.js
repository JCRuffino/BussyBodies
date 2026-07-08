import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { sanitiseForFirebase, fixArrays } from './shared.js';

// ── FIREBASE CONFIG ───────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBe7IAmaDto4_bJzw2O34SPyyaXYyP9sR8",
  authDomain: "jet-lag-brighton.firebaseapp.com",
  databaseURL: "https://jet-lag-brighton-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "jet-lag-brighton",
  storageBucket: "jet-lag-brighton.firebasestorage.app",
  messagingSenderId: "405662637735",
  appId: "1:405662637735:web:dd81a06ecf63fd7f570582",
  measurementId: "G-7BMEMN7QND"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

// ── ANONYMOUS AUTH ────────────────────────────────────────────────
const authReady = signInAnonymously(auth)
  .then(() => {
    console.log('✅ Firebase: signed in anonymously');
  })
  .catch(e => {
    console.error('❌ Firebase: anonymous auth failed:', e);
    throw e;
  });

// ── DEVICE ID ─────────────────────────────────────────────────────
function getDeviceId() {
  let id = sessionStorage.getItem('deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('deviceId', id);
  }
  return id;
}

// ── GAME STATE WRITE ──────────────────────────────────────────────
// Full overwrite — only for creating/resetting the game
export async function pushState(gs) {
  await authReady;
  const clean = sanitiseForFirebase(gs);
  return set(ref(db, 'gameState'), clean);
}

// Atomic mutation — runs `mutator` against the server's current state
// inside a transaction, so concurrent actions from different players
// merge instead of overwriting each other. The mutator receives the
// current state and must return it to commit, or return nothing to
// abort (e.g. a validation check failed against the latest state).
export async function mutateState(mutator) {
  await authReady;
  const result = await runTransaction(ref(db, 'gameState'), (current) => {
    if (current === null) return undefined;
    fixArrays(current);
    const updated = mutator(current);
    return updated ? sanitiseForFirebase(updated) : undefined;
  });
  if (!result.committed) console.warn('⚠️ Game state change was not committed');
  return result.committed;
}

// ── GAME STATE READ ───────────────────────────────────────────────
export function listenToGameState(callback, onError) {
  authReady
    .then(() => {
      onValue(
        ref(db, 'gameState'),
        (snapshot) => {
          if (snapshot.exists()) callback(snapshot.val());
          else callback(null);
        },
        (error) => {
          console.error('❌ Failed to read data from Firebase:', error);
          if (onError) onError(error);
        }
      );
    })
    .catch(e => {
      console.error('❌ Firebase auth not ready, cannot listen:', e);
      if (onError) onError(e);
    });
}

// ── PLAYER LOCATIONS WRITE ────────────────────────────────────────
export async function pushPlayerLocation(team, lat, lng, name) {
  await authReady;
  const id = getDeviceId();
  return set(ref(db, 'playerLocations/' + id), {
    team, lat, lng, name,
    ts: Date.now()
  });
}

export async function removePlayerLocation() {
  await authReady;
  const id = getDeviceId();
  return remove(ref(db, 'playerLocations/' + id));
}

// ── PLAYER LOCATIONS READ ─────────────────────────────────────────
export function listenToPlayerLocations(callback) {
  authReady.then(() => {
    onValue(ref(db, 'playerLocations'), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : {});
    });
  });
}

// ── GAME LOG WRITE ────────────────────────────────────────────────
export async function pushLog(entry) {
  await authReady;
  return push(ref(db, 'gameLog'), entry);
}

export async function clearLog() {
  await authReady;
  return set(ref(db, 'gameLog'), null);
}

// ── GAME LOG READ ─────────────────────────────────────────────────
// Returns an unsubscribe function so callers can detach the listener
export function listenToLog(callback) {
  let unsubscribe = null;
  let cancelled   = false;
  authReady.then(() => {
    if (cancelled) return;
    unsubscribe = onValue(ref(db, 'gameLog'), snap => {
      const data    = snap.val();
      const entries = data
        ? Object.values(data).sort((a, b) => b.timestamp - a.timestamp)
        : [];
      callback(entries);
    });
  });
  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}
