# Walkthrough - Stats Display Fixes

I have implemented several fixes to address the issue where statistical figures were not being displayed in the "Intelligence Database" sections of both the web and mobile applications.

## Changes Made

### 1. Mobile App Fix ([home_screen.dart](file:///D:/Data/Project/PilotMetrics/mobile/lib/screens/home_screen.dart))
- **Issue**: The `_fmt` function was attempting to cast a `List` (the `sources` field) to a `num`, causing a runtime exception.
- **Fix**: Updated `_fmt` to explicitly check if the input is a `List` and return its length as a string.

### 2. Worker API Improvements ([index.ts](file:///D:/Data/Project/PilotMetrics/worker/src/index.ts))
- **Issue**: Empty `event_date` strings in the database could cause the year range calculation to return invalid results.
- **Fix**:
    - Added `event_date != ''` to the SQL query for `yearRange`.
    - Added safety checks for `null` or empty results in the API response.
    - Ensured `sources` and `severity_breakdown` always return arrays.

### 3. Web Frontend Resilience ([app.js](file:///D:/Data/Project/PilotMetrics/worker/public/app.js))
- **Issue**: SQLite's default date format (`YYYY-MM-DD HH:MM:SS`) is not consistently parsed by `new Date()` across all browsers (especially Safari).
- **Fix**:
    - Added a replacement step to insert a `T` separator between date and time (`replace(" ", "T")`) before parsing.
    - Added fallback logic to display the raw substring if date parsing still fails.
    - Improved robustness of numeric formatting.

## Verification

- **Web**: The sidebar stats should now load correctly even if some date fields are empty or formatted without the ISO 'T'.
- **Mobile**: The stats bar should now correctly show the count of unique data sources without crashing the app.
