# Shorten Error Messages and Improve UI Responsiveness

This plan addresses the D1 quota error messages by shortening them and improves the styling of error boxes for mobile responsiveness and background color consistency.

## Proposed Changes

### [Component Name] Backend (Worker)

#### [MODIFY] [index.ts](file:///D:/Data/Project/PilotMetrics/worker/src/index.ts)
- Modify `recordError` to intercept and shorten Cloudflare D1 quota errors to "Upgrade to a paid plan or wait until tomorrow".
- Update the message mapping logic to only display the error message itself, removing the stage prefix (e.g., `D1_EVENT_COUNT:`) for a cleaner look.

### [Component Name] Frontend

#### [MODIFY] [style.css](file:///D:/Data/Project/PilotMetrics/worker/public/style.css)
- Change `.ctx-msg` background color from yellow (`--amber-100`) to the app background color (`var(--bg)`).
- Adjust the border and text color of `.ctx-msg` to maintain visibility and theme consistency.
- Ensure the box width is fully responsive for mobile devices.

## Verification Plan

### Automated Tests
- None applicable for these UI/Message changes.

### Manual Verification
- Deploy to Cloudflare.
- Trigger a D1 quota error (if possible) or mock it in the code temporarily to verify the shortened message.
- Inspect the UI on mobile and desktop browsers to verify the background color and responsiveness of the error boxes.
