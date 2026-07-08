# Jet Lag Brighton

A real-time multiplayer map game played across Brighton. Teams claim bus stops on a live map, spend and earn coins, and complete real-world challenges. All players' devices stay in sync through Firebase Realtime Database.

Built with vanilla JavaScript (ES modules), [Leaflet](https://leafletjs.com/) + MarkerCluster for the map, and Firebase (anonymous auth + Realtime Database) for shared state.

## Project structure

- `index.html` — markup and styles for all screens (Map, Challenges, Leaderboard, Settings, Rules, History)
- `main.js` — boot sequence: CSV loading, Firebase listener, navigation, history screen
- `map.js` — Leaflet map, stop markers, claim/bankruptcy/challenge popups, live player locations
- `ui.js` — challenge panels, leaderboard, route/distance bonuses, admin controls
- `settings.js` — team assignment, team renaming, game reset
- `firebase.js` — Firebase setup, transactional state updates, game log
- `shared.js` — game state helpers and constants shared across modules
- `locations.csv` — bus stops (tab-separated: Name, Latitude, Longitude)
- `challenges.csv` — challenge pool (comma-separated: ID, Type, CoinValue)

## Running locally

The app fetches the CSV files at startup, so it must be served over HTTP (opening `index.html` directly from disk won't work):

```
npx serve
# or
python -m http.server
```

Then open the printed local URL in a browser.

## How to play

Open the Rules tab in the app for the full rules. In short: claim bus stops for your team by spending coins, take over rival stops by out-bidding their value, complete challenges to earn more coins, and hold the most stops (plus route and distance bonuses) when the game ends.

Players with no team assigned act as spectators/admins: they see admin controls on the Challenges screen and an admin reset option in each stop popup.
