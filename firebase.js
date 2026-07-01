import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { sanitiseForFirebase } from './shared.js';

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
// Stable per browser session — survives page refresh but not tab close
function getDeviceId() {
  let id = sessionStorage.getItem('deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('deviceId', id);
  }
  return id;
}

// ── GAME STATE WRITE ──────────────────────────────────────────────
export async function pushState(gs) {
  await authReady;
  const clean = sanitiseForFirebase(gs);
  return set(ref(db, 'gameState'), clean);
}

// ── GAME STATE READ ───────────────────────────────────────────────
export function listenToGameState(callback) {
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
        }
      );
    })
    .catch(e => {
      console.error('❌ Firebase auth not ready, cannot listen:', e);
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
