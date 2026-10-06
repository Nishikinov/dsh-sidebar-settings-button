# dsh-sidebar-settings-button

DSH plugin: puts a **Settings** row in the sidebar header, immediately **before Plugins**, opening the native Settings panel in one click.

```
┌─ sidebar ─────────────────┐
│  ⚙  Settings   ← new row
│  ⊛  Plugins
│  ⏱  Schedules
└───────────────────────────┘
```

## What it does

Registers one entry in the sidebar's own `sidebar.panellist` seat with `order: -10` (Plugins ships at `0`, Schedules at `10`), so the row lands first and the shipped sidebar draws it: native geometry, hover, focus ring, collapsed-rail icon and tooltip, localized label. A click opens the same panel as `Ctrl+,` / `⌘+,`.

## How it works

**The click is intercepted.** `sidebar.panellist` is the seat for *main panels* — ui-sidebar turns each entry into a button whose `onClick` calls `ctx.layout.selectPanel(id)`, and that id must address a component in the layout's keyed `main` slot. Settings is not a panel but a modal owned by ui-settings-general, and `selectPanel` throws for an unknown key. So one capture-phase listener on `document` takes the click above the React root (React 18 delegates to the container) and opens Settings instead. It re-resolves the row's enclosing `button` on every click, so the icon, the label and the button's padding all count as the row.

**Settings is opened through the shortcut registry.** `settings.open` is the only programmatic door: the panel's open state is private to ui-settings-general, and the `settings.launcher` seat that receives `openSettings` is a `single` slot already occupied by the account menu. `ctx.shortcuts.registry.invoke(id, context)` is the path the native Electron menu uses to run a command without its key binding. It is called with `modal: null` on purpose — the registry's modal guard would otherwise swallow the call whenever any `[role="menu"]` is mounted, and the action is idempotent (`open: true`) so the panel cannot be toggled shut by accident.

**No silent failures.** Every degraded path returns a short reason, shown in a Toast and logged to the console. DevTools is available on **F12**.

## Install

```powershell
# Windows, using the app's own CLI:
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add <path-to-folder-or-tgz>

dsh plugin --profile desktop remove dsh-sidebar-settings-button   # uninstall
```

`dsh plugin add` is `pnpm add` inside the profile plus a `dsh.profile.bundles` reconcile, so a package declaring `dsh.bundle` joins the layer list automatically. A folder install is a `link:`, which is why this checkout stays the single source of truth.

## Verify

```powershell
node test/bundle.test.mjs                      # 6 tests: registration, order, whole-row click, Toast, degradations
node --check src/index.js; node --check client/bundle.js
```

Live check — the client slot inspector must list our entry before `plugins`:

```
cordis_inspect_query(platform: "client", provider: "Slots",
                     method: "listSubTree", input: { root: "sidebar.panellist" })
```

## Limits

- The **avatar menu's "Settings" item stays** — it belongs to another plugin's React tree. The header row is an additional, always-visible entry point.
- The row's `id` addresses **no main panel**; the click interception is the only thing keeping `selectPanel` from throwing. If ui-sidebar ever switches to `onClickCapture`, that interception needs rework (the test only covers our side).
- The sidebar passes `{ size, active }`; only `size` is used, and the row is never highlighted — Settings is not a panel.

## Layout

No build step: the browser half is a plain classic script calling `window.__ModuleLoader__.load({ id, factory })`. Its only `require`s are platform modules (`react`, `@deepseek-ai/dsh-client-ui-primitives`), so `dsh.client.inject` / `dsh.client.external` are unnecessary.

```
src/index.js        host half — no-op stub; exists so dsh-client-modules finds the browser bundle
client/bundle.js    the entire feature
cordis.patch.yml    inserts the Loader entry into the profile composition
test/bundle.test.mjs
```
