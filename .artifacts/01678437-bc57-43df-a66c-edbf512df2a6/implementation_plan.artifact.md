# Implementation Plan - Fix Statistical Figures Display Issue

The user reported that statistical figures are not being displayed in the "Intelligence Database" (sidebar in web app, stats bar in mobile app).

## Suspected Causes

1.  **Mobile App Crash**: The `_fmt` function in `HomeScreen` tries to cast a `List` (from `stats['sources']`) to a `num?`, which causes a runtime exception in Dart.
2.  **Web App Date Parsing**: `new Date(d.last_updated)` in `app.js` may fail on some browsers (like Safari) because SQLite's `datetime('now')` format (`YYYY-MM-DD HH:MM:SS`) lacks the 'T' separator, potentially causing the `loadStats` function to abort silently.
3.  **Empty Date Handling**: If `event_date` is an empty string, the `yearRange` query returns empty strings for `min_yr` and `max_yr`, which are treated as falsy in `app.js`, causing the "Data Coverage Period" to show as "—".

## Proposed Changes

### Mobile App

#### [MODIFY] [home_screen.dart](file:///D:/Data/Project/PilotMetrics/mobile/lib/screens/home_screen.dart)
- Update `_fmt` function to handle `List` types by returning their length.

### Web Worker (API)

#### [MODIFY] [index.ts](file:///D:/Data/Project/PilotMetrics/worker/src/index.ts)
- Update the `yearRange` query to exclude empty `event_date` strings.
- Ensure `last_updated` returns an ISO 8601 string for better frontend compatibility.

### Web Frontend

#### [MODIFY] [app.js](file:///D:/Data/Project/PilotMetrics/worker/public/app.js)
- Improve date parsing for `last_updated` to handle various formats.
- Add more robust checks for `total_events` and other numeric values.

## Verification Plan

### Manual Verification
- **Web**: Open the dashboard and verify the sidebar "Intelligence Database" stats are populated (Total events, Coverage period, etc.).
- **Mobile**: Run the app and verify the stats bar appears below the search field without crashing.
