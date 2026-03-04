# CLAUDE.md — KCC Scheduler

AI assistant context for the **Kids Connection Childcare Staff Scheduler** project.

---

## Project Overview

A single-page React application for managing weekly staff schedules across multiple childcare locations. Staff shifts are displayed in a grid (staff × weekdays), saved in browser storage, and can be exported as `.ics` calendar files or emailed via a Vercel serverless function.

Hosted on **Vercel**. No backend database — all state is persisted in the browser (`localStorage` key `"kcc-v1"`).

---

## Repository Structure

```
kcc-scheduler/
├── api/
│   └── send-calendar-invite.js   # Vercel serverless function (POST /api/send-calendar-invite)
├── src/
│   ├── App.jsx                   # Entire application — one large component (~1026 lines)
│   └── main.jsx                  # React entry point (renders <App /> in StrictMode)
├── index.html                    # HTML shell, mounts #root
├── package.json                  # Dependencies and npm scripts
├── vite.config.js                # Vite config with @vitejs/plugin-react
└── vercel.json                   # Vercel deployment: SPA fallback + /api/* rewrites
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| UI framework | React 18 (JSX, hooks) |
| Build tool | Vite 5 |
| Email | Resend (npm package, v3) |
| Hosting | Vercel (serverless functions in `/api`) |
| Styling | Inline JSX styles only — no CSS files, no CSS framework |
| Routing | None — single page, no react-router |
| State | React hooks (`useState`, `useEffect`, `useRef`) + `localStorage` |
| Testing | None currently |

---

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Production build → dist/
npm run preview      # Preview the production build
```

There is no test runner or linting configured. Do not add placeholder test scripts.

---

## Architecture: `src/App.jsx`

The entire application lives in one default export: `KidsConnectionScheduler`.

### Key Constants (top of file)

| Constant | Purpose |
|---|---|
| `DAYS` / `DAY_SHORT` | Full and short weekday names |
| `TIMES` | Time slots array, 6 AM–6 PM in 15-min increments |
| `COLOR_PALETTE` | 10 named colors with `text`/`border`/`bg` CSS strings for rooms |
| `LOC_COLORS` | 8 colors for location tabs |
| `DEFAULT_ROOMS` | Initial rooms: Infant, Toddler, Preschool, Pre-K, Floater, Office, Lunch/Break |
| `INITIAL_LOCATIONS` | Seed data: one location with 4 sample staff |
| `HOSTED_URL` | **Hardcoded** — must be updated to actual Vercel URL after deployment |

### Data Shapes

```js
// Location
{ id, name, colorIdx, staff: Staff[], rooms: Room[], schedule: ScheduleData, templates: Template[] }

// Staff
{ id, name, email }

// Room
{ id, name, colorIdx }

// Schedule (object keyed by composite string)
// Key format: "${isoWeekStart}|${staffId}|${dayIndex}"
// Value: { blocks: ShiftBlock[] }

// ShiftBlock
{ id, startTime: "8:00 AM", endTime: "4:00 PM", room: string }

// Template
{ id, name, saved: dateString, data: ScheduleData }
```

### Persisted State

Two localStorage values under key `"kcc-v1"`:
- `locations` — full location/staff/schedule data
- `activeLocId` — currently selected location

Auto-saved with a 700 ms debounce after any state change.

### Pure Utility Functions

| Function | What it does |
|---|---|
| `getWeekStart(date)` | Returns the Monday of the given date's week |
| `formatDate()` / `formatDateLong()` | Date display formatting |
| `getWeekDates(weekStart)` | Array of 7 Date objects for the week |
| `timeToMins(timeStr)` | `"8:00 AM"` → integer minutes from midnight |
| `blockMins(block)` | Duration of one shift block in minutes |
| `dayMins(blocks)` | Total minutes across all blocks in a day |
| `fmtHours(mins)` | `"8h 30m"` style formatting |
| `hasOverlap(blocks)` | Returns true if any two blocks overlap |
| `newBlock()` | Default shift block factory |
| `generateICS(staff, weekDates, dayBlocks)` | Build `.ics` file string |
| `downloadICS(staff, ...)` | Triggers browser download of the `.ics` |
| `initials(name)` | First letter of each word, up to 2 chars |
| `getAvatarColor(name)` | Deterministic color from name hash |

### State Variables

**Persisted:**
- `locations`, `activeLocId`, `weekStart`

**UI modals (boolean):**
- `showAddStaff`, `showStaffInfo`, `showManageRooms`, `showTemplates`, `showManageLocs`

**Editing:**
- `editCell` — `{ staffId, dayIdx }` or null
- `editBlocks` — blocks being edited in the shift modal
- `clipboard` — copy/paste buffer for shift days
- `editingStaffId/Name`, `editingRoomId/Name`, `editingLocId/Name` — inline edit state

**Feedback:**
- `toast` — `{ msg, type }` or null (auto-dismisses)
- `saveStatus` — `"saved"` / `"saving"` / `"error"`
- `confirmDelete` — `{ type, id, name, extra }` or null
- `emailSending`, `emailSent` — tracks email send flow

---

## API: `api/send-calendar-invite.js`

Vercel serverless function.

**Route:** `POST /api/send-calendar-invite`

**Request body:**
```json
{
  "toEmail": "staff@example.com",
  "toName": "Jane Doe",
  "locName": "Main Street",
  "webcalUrl": "webcal://your-app.vercel.app/api/calendar/42"
}
```

**Responses:**
- `200 { success: true, id: "<resend-email-id>" }`
- `400 { error: "Missing required fields" }`
- `405 { error: "Method not allowed" }`
- `500 { error: "<resend error message>" }`

**Required environment variable (set in Vercel dashboard):**
```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

**Note:** The `/api/calendar/:staffId` endpoint referenced in `webcalUrl` is **not yet implemented**. Calendar export currently works via `.ics` file download only.

---

## Deployment

The app is deployed on Vercel. `vercel.json` routes:
- `/api/*` → serverless functions in `/api/`
- All other paths → `/index.html` (SPA fallback)

After deploying, update `HOSTED_URL` in `src/App.jsx` (near the top) to the actual Vercel URL.

---

## Key Conventions

### Styling
- **All styling is inline JSX.** There are no `.css` files. Do not add CSS files or import a CSS framework.
- Style objects are defined inline in JSX props, e.g. `style={{ display: 'flex', gap: 8 }}`.
- Colors for rooms come from `COLOR_PALETTE`; colors for locations come from `LOC_COLORS`.

### IDs
- Entity IDs (`staff.id`, `room.id`, etc.) are generated with `Date.now()`.
- Schedule keys use the composite format `"${isoWeekStart}|${staffId}|${dayIdx}"`.

### State mutations
- Never mutate state arrays directly — always use the setter with a mapped/filtered copy.
- Location updates follow the pattern:
  ```js
  setLocations(prev => prev.map(loc =>
    loc.id === activeLocId ? { ...loc, ...changes } : loc
  ));
  ```

### Modals
- All modals are rendered inline at the bottom of the JSX return, conditionally with `{showX && <div>...</div>}`.
- Use the existing `toast()` helper to show user feedback instead of `alert()`.
- Use `confirmDelete` state for destructive actions instead of `window.confirm()`.

### Adding features
- The app is intentionally a single-file component. Keep new features in `App.jsx` unless they are clearly a standalone serverless endpoint (→ `/api/`).
- Avoid adding routing, a component library, or a global state manager unless there is a strong need.

---

## Known Gaps / TODOs

- `HOSTED_URL` constant in `App.jsx` is hardcoded and must be updated after deployment.
- `/api/calendar/:staffId` endpoint (for live webcal subscriptions) is not implemented.
- No automated tests exist. Manual testing via `npm run dev` is the current workflow.
- No `.env.example` file — document `RESEND_API_KEY` if adding one.
- No linting config (`.eslintrc`). Code style is informal.
