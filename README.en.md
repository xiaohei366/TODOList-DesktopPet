# TODOList Mac Pet

[中文文档](README.md)

Desktop pet TODO manager for macOS, built with Electron, React, and TypeScript, with Windows builds retained. It keeps TODO data in a readable Markdown file and reuses Codex-compatible pet packages from the local Codex pet ecosystem.

Repository: [xiaohei366/TODOList-MacPet](https://github.com/xiaohei366/TODOList-MacPet). The application is still named TOList Desktop Pet and continues to use existing TODOs, pets, and settings.

## Features

- Transparent always-on-top desktop pet for Windows and macOS. On macOS it stays out of the Dock; use the menu bar tray icon to show/hide the window or quit.
- macOS uses the floating window level so input-method candidate windows remain visible while editing TODOs, sub-tasks, tags, and notes.
- Focus mode has a wide 10px vivid multicolor border flowing around a static white-to-pale-blue interior, with a feathered transition, blue-gray text, muted blue buttons, about 30 updates per second, and a 1.5-second cycle. Motion pauses when hidden and respects the system's reduced-motion preference. The TODO heading animates only when its text changes; interactive regions are reported on layout changes, and mouse polling and the heading timer pause while hidden.
- Codex pet package compatibility: `pet.json` plus `spritesheet.webp`.
- Automatic discovery of Codex pets, app pets, and npm-installed pet packages (see [Platform data paths](#platform-data-paths)).
- Markdown-backed TODO storage that can be opened from the pet context menu (see [Platform data paths](#platform-data-paths)).
- Human-readable TODO hierarchy: year, month, day.
- Floating TODO panel above the pet, with up to three visible items and scroll support.
- Motivational TODO header that rotates between "X tasks completed today" and "N tasks still due today" every few seconds. The completed count covers today's finished parent TODOs and sub-tasks. The remaining count works as follows: when a parent TODO is not yet completed and has a deadline on or before today, it counts as 1 plus all of its incomplete sub-tasks; otherwise the parent is not counted, and its sub-tasks are judged independently by their own deadline (only incomplete sub-tasks with a deadline on or before today are counted). Items without a deadline are not counted.
- Automatic local-day refresh so yesterday's completed items disappear from the visible TODO panel after midnight.
- Scheduled TODO rules for weekly recurring tasks and one-time future tasks.
- Scheduled reminders reuse the scheduled TODO form, create a TODO when due, automatically enter its focus mode, and send a native system notification. If another task is already focused, the reminder queues up and enters focus once the current one exits or completes.
- Scheduled rules are stored in `scheduled-todos.json` under the platform app-data directory (see [Platform data paths](#platform-data-paths)).
- Switchable Chinese / English native menus and TODO panels from the pet right-click menu.
- Hover the pet's bottom-right corner to reveal a resize handle; drag it to scale the pet and TODO panel between 65% and 200%.
- Visible system tray icon with show/hide, open raw data file, and quick quit actions in the selected language.
- Right-click pet actions include a `Scheduled` parent menu with separate `Scheduled TODOs` and `Scheduled Reminders` panels, plus showing or hiding panels, switching language, importing/exporting data, importing pet zip packages, refreshing pets, switching pet styles, and quitting.
- Right-click active TODOs to edit, mark done, delete, manage tags/notes/deadlines/sub-tasks, or adjust priority. The `Adjust Status` submenu contains `Suspend` and `Mark Red / Unmark Red`.
- Tagged TODOs are grouped in Chrome/Edge-like colored tag groups that can be collapsed, expanded, and reordered against untagged TODOs. The tag editor offers a dropdown of existing tags from unfinished TODOs while still allowing custom tags.
- Sub-tasks are stored under parent TODOs, can be collapsed with their parent, and must all be completed before the parent TODO can be marked done.
- Long-press TODO sorting is supported for direct drag ordering; tagged TODOs reorder within their tag group, while tag groups and untagged TODOs reorder at the same top level.
- Completed and suspended TODOs have gray strikethrough text and move to the end of their tag group or list. Suspended TODOs display a cross: click it or use `Restore` to reactivate the task. Suspended TODOs offer `Restore` and `Delete`; completed TODOs and sub-tasks offer `Undo Completion` and `Delete`, with a separator above `Delete`. Suspended tasks stay visible across days, are excluded from done/due counts, ordering and focus queues, and retain tags, notes, deadlines and sub-tasks when restored.
- Pet state changes based on TODO state: `review` for active TODOs, `idle` when clear, `waving` on hover or after adding, and directional running while dragging.
- Pet animations use Codex-compatible rows and frames with a calmer desktop playback cadence.

## AI usage panel

Right-click the pet and select **AI → AI Usage**, above the first separator. Use the panel gear to open local account settings. Connect Codex, Antigravity, or personal gateways with custom names. The panel separates remaining quota, reset times, expiry, and stale data. Pet keeps refreshing after the settings tab closes. Finish focus mode before switching panels.

Codex and Antigravity use built-in browser sign-in. Select a platform and click **Browser sign-in**: the current tab navigates to the official authorization page, then returns to a Pet success screen. Choose **View account and usage** to continue; the account is saved automatically. No client ID, client secret, callback, or scope setup is required. Custom registrations remain optional under advanced login settings. Multiple accounts can coexist across platforms and within one platform. Use **Add account** or **Add another account**; switching platforms also starts a new draft. Signing in to the same identity and workspace updates authorization; a different identity adds an account. Settings and Pet cards show the platform, email, and workspace alongside the editable alias. Credentials use OS-level encryption (Windows DPAPI / macOS Keychain) and refresh independently. Live account authorization, quota access, and refresh still require verification through a real sign-in.

- **Compact panel**: the same 304px width and list height as TODO, with smaller controls and roughly two TODO rows per account. Expand an account to see every quota as a compact child row; scroll for more. Hover a quota for exact amounts and reset/expiry times.
- **Default quota**: Codex, Antigravity, and personal gateways all show the lowest remaining percentage (for example, a weekly 18% instead of a 5-hour 63%). Raw amounts with different units are not compared, and unknown quotas are never treated as zero.
- **Account order and status**: account names and identities are bold. Drag a card summary or its left handle to reorder accounts; hovering near the list edge scrolls it. Release to save the order across restarts, or press Esc to cancel. A focused handle also supports the up/down arrow keys. Use **Resume and refresh** on a paused card or in settings to enable it again.
- **Antigravity windows**: only the Claude and Gemini 5-hour and weekly server windows are shown; other model-catalog entries are not time windows and never enter the panel. A missing window renders as an em dash instead of a fabricated value, and no model needs to be selected manually.
- **Multiple periods**: for Gateway Usage v1, use **Add reporting period** to include Today, This week, and This month together, each with an optional Credit budget. Other protocols retain the periods supplied by their APIs.
- **Test query**: results and errors appear below the test button and remain separate from background updates. Tests wait for background work and reuse identical results for 10 seconds. Provider Retry-After limits still apply.

The default gateway template is **Volcengine API Gateway + VeFaaS + VMP**, requiring a deployed compatible usage service. An inference endpoint alone cannot report balances. Settings support deployment-provider selection, Gateway Usage v1 / New API / Sub2API / Custom JSON, URLs, authentication, field mapping, and a separate model catalog with its own credential. For an identical protocol, replace addresses and credentials. Otherwise choose another template or mapping; providers without a usage API require a server adapter. Changing the usage URL never sends the old key to the new destination automatically.

Gateway Usage v1 reporting periods and personal budgets use the UTC+8 calendar. Budgets are estimates, not official balances. Other protocols use provider timestamps; custom mappings support timezone-qualified ISO dates and Unix seconds/milliseconds. Paths append literally to the Base URL: remove duplicate `/v1` prefixes when needed.


## Platform data paths

| Content | Windows | macOS |
| --- | --- | --- |
| TODO Markdown | `%USERPROFILE%\Documents\TOList\todos.md` | `~/Documents/TOList/todos.md` |
| Scheduled rules / settings / AI API discovery | `%APPDATA%\TOList\` | `~/Library/Application Support/TOList/` |
| App pets | `%APPDATA%\TOList\pets\` | `~/Library/Application Support/TOList/pets/` |
| npm pet packages | `%APPDATA%\TOList\pet-packages\` | `~/Library/Application Support/TOList/pet-packages/` |
| Codex pets | `%USERPROFILE%\.codex\pets\` | `~/.codex/pets/` |

`%APPDATA%` is normally `C:\Users\<user>\AppData\Roaming`.

## Requirements

- Windows 10 or newer, or macOS 13+ (Apple Silicon).
- Node.js 24+ recommended.
- npm 11+ recommended.

## Tech Stack

- Desktop runtime: Electron 39 with transparent frameless `BrowserWindow`, native tray menus, IPC, and OS topmost/mouse-passthrough integration (on macOS the main process polls the cursor to restore interaction, and the pet follows you across Spaces/fullscreen).
- UI: React 19, TypeScript, CSS, and `lucide-react` icons.
- Build tooling: Electron Vite, Vite, TypeScript compiler, and electron-builder packaging (portable Windows exe, macOS arm64 DMG).
- Persistence: local Markdown for TODO data, JSON for scheduled TODO rules and app settings.
- Pet compatibility: Codex-style `pet.json` plus `spritesheet.webp` atlas loading, zip import via JSZip, and custom `todolist-pet://` asset protocol.
- Testing: Vitest unit tests for Markdown storage, scheduling, pet registry, ordering, localization, window behavior, and animation helpers.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Run TypeScript checking:

```bash
npm run typecheck
```

Build the installer for the current platform (portable Windows exe / macOS arm64 DMG):

```bash
npm run build
```

Artifacts are generated at:

```text
release/TOList-Desktop-Pet-0.5.5.exe   (Windows)
release/TOList-Desktop-Pet-0.5.5.dmg   (macOS)
```

The macOS build is a locally ad-hoc-signed, non-notarized arm64 DMG. If Gatekeeper blocks the first launch, right-click the app and choose **Open**. Distributing it to others requires Developer ID signing and notarization.

## Markdown TODO Format

The default source file is:

```text
Windows:  %USERPROFILE%\Documents\TOList\todos.md
macOS:    ~/Documents/TOList/todos.md
```

The app stores TODOs in this format:

```markdown
# 2026

## 2026-05

### 2026-05-11 Monday

- [ ] [!] Important item
- [ ] [order:1] [tag:Work] [ddl:2026-05-12] Display-priority item
  - [ ] Sub-task item
  - Inline note text
- [ ] Normal item
- [x] [done:2026-05-11] ~~Finished item~~
```

Rules:

- `#` headings are years.
- `##` headings are months in `YYYY-MM`.
- `###` headings are days in `YYYY-MM-DD Weekday`.
- `[!]` marks a TODO as red/high priority.
- `[order:n]` stores display priority for active visible TODOs, including cross-date ordering between overdue and today.
- `[tag:name]` assigns a parent TODO to a single tag group. Tag groups are displayed as colored collapsible groups and can be reordered against untagged TODOs.
- `[ddl:YYYY-MM-DD]` stores a deadline for a parent TODO or sub-task.
- `[done:YYYY-MM-DD]` records the local date when a TODO was completed, so legacy TODOs finished today count toward today's completed total.
- Indented checkbox lines such as `  - [ ] Sub-task item` are sub-tasks of the parent TODO.
- Indented plain lines such as `  - Inline note text` are notes for the parent TODO.
- Completed items use `[x]` and strikethrough; suspended items use `[-]` and strikethrough, reverting to `[ ]` when restored.
- Deleting a TODO removes its Markdown line.

## Scheduling

Right-click the pet and open `Scheduled`, then choose `Scheduled TODOs` or `Scheduled Reminders`. Both use the same weekly/one-time rule form.

- Weekly rules can run on selected weekdays at a required hour and minute.
- One-time rules can run on a specific future date at a required hour and minute, then remove themselves after generating the TODO.
- A scheduled TODO creates the TODO in the background. A scheduled reminder also opens that TODO in focus mode and sends a native system notification; clicking the notification returns to the focused TODO. If a reminder fires while another task is focused, it queues and automatically enters focus after the current one exits or completes; the focus panel shows how many tasks are queued.
- New schedule forms default to the local date and time when the panel is opened.
- Hours are limited to `0-23`, minutes to `0-59`, and dates must be real calendar dates such as February 28 or February 29 in leap years.
- Weekdays are shown as numbers `1-7` in the compact picker.
- Missed runs are only backfilled for today. Older missed days are not created.
- Each rule creates at most one TODO per local day.
- Optional "Set deadline": when checked, enter N (1-9999); the generated TODO is due on the Nth day, counting the firing day as day 1 (N=1 means due today).
- Use the pet menu to export or import both `todos.md` and `scheduled-todos.json` when moving to another computer.

## Pet Package Format

A compatible pet folder contains:

```text
pet.json
spritesheet.webp
```

Example `pet.json`:

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A short human-readable description.",
  "spritesheetPath": "spritesheet.webp",
  "kind": "person"
}
```

Spritesheet requirements:

- Atlas size: `1536x1872`.
- Layout: `8` columns by `9` rows.
- Cell size: `192x208`.
- State row order:
  - `idle`
  - `running-right`
  - `running-left`
  - `waving`
  - `jumping`
  - `failed`
  - `waiting`
  - `running`
  - `review`

More installation details are in [docs/pet-pack-installation.md](docs/pet-pack-installation.md).

## Installing Pet Packs

Install from npm:

```powershell
# Windows PowerShell
npm install <pet-package> --prefix "$env:APPDATA\TOList\pet-packages"
```

```bash
# macOS
npm install <pet-package> --prefix "$HOME/Library/Application Support/TOList/pet-packages"
```

Then right-click the pet and choose `Refresh Pets`.

Install from a local zip:

1. Create a zip containing `pet.json` and `spritesheet.webp`.
2. Right-click the pet.
3. Choose `Import Pet Zip`.

Reuse existing Codex pets by placing them under:

```text
Windows:  %USERPROFILE%\.codex\pets
macOS:    ~/.codex/pets
```

## Project Structure

```text
src/main/             Electron main process, Markdown storage, scheduled TODOs, pet registry
src/preload/          Safe IPC bridge exposed to the renderer
src/renderer/         React desktop pet UI
src/shared/           Shared types
tests/                Vitest coverage for TODO storage, scheduled TODOs, pet registry, animation helpers
docs/                 Pet package installation documentation
```

## Current Scope

This is a local-first desktop app. It does not include account sync, cloud storage, push notifications, or an emotional/personality system.
