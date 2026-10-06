/* dsh-sidebar-settings-button — browser half.
 *
 * ONE contribution: a Settings row in the sidebar header, immediately BEFORE
 * the Plugins row. It is a real `sidebar.panellist` entry, so the shipped
 * sidebar draws it — same row geometry, same hover, same focus ring, same
 * collapsed-rail icon and tooltip, same label localization — and a click opens
 * the native Settings panel.
 *
 * ## Why the click is intercepted
 *
 * `sidebar.panellist` is the seat for MAIN PANELS: ui-sidebar renders each
 * entry as a button whose `onClick` runs `ctx.layout.selectPanel(id)`, and the
 * same id must address a component in the layout's keyed `main` slot. Settings
 * is not a main panel — it is a modal owned by ui-settings-general, opened by
 * ITS command, and `selectPanel` throws for a key the layout does not know.
 *
 * So the row draws through the sidebar (native look) while the click is taken
 * over before the button's own handler can run: one capture-phase listener on
 * `document` stops the event above the React root container, where React
 * delegates `onClick`, and opens Settings through the shell's own
 * `settings.open` shortcut command instead. The listener resolves the enclosing
 * row BUTTON at click time, so the glyph, the label AND the button's own
 * padding all count as the row — a click anywhere on it opens Settings.
 *
 * ## Why the shortcut registry
 *
 * `settings.open` is the only programmatic door into the Settings panel: the
 * panel's open/close state is private to ui-settings-general, and the
 * `settings.launcher` seat that receives `openSettings` is a `single` slot
 * already occupied by the account menu. `ctx.shortcuts.registry.invoke(id,
 * context)` is the same path the native Electron menu uses to run a command
 * without its key binding.
 *
 * The invocation passes `modal: null` on purpose. This row is only reachable
 * while no modal covers the frame, while the registry's guard
 * (`context.modal !== null && !command.modals.includes(context.modal)`) would
 * otherwise swallow the call whenever ANY `[role="menu"]` element happened to
 * be mounted. `settings.open`'s action is idempotent (`open: true`), so clearing
 * the modal field cannot toggle the panel shut.
 *
 * Every degraded path returns a short reason, which the row shows in a Toast and
 * logs to the console — a silent no-op is the one outcome this plugin refuses.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-settings-button',
  factory: (require) => {
    'use strict'

    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    /** Package name the host looks this bundle up by; must equal package.json `name`. */
    var NAME = 'dsh-sidebar-settings-button'
    /** Locale namespace owned by this plugin. */
    var NS = 'sidebarSettingsButton'
    /** `sidebar.panellist` id of the new row; also its React key and `only` dispatch key. */
    var ENTRY_ID = 'sidebar-settings'
    /**
     * Ascending `order`. Plugins ships at 0 and Schedules at 10, so a negative
     * order is what puts this row before Plugins rather than after it.
     */
    var ENTRY_ORDER = -10
    /** The shell's own Settings command, registered by ui-settings-general. */
    var SETTINGS_COMMAND = 'settings.open'

    var ZH = { entry: '设置' }
    var EN = { entry: 'Settings' }
    var RU = { entry: 'Настройки' }

    /** Report one degraded path without letting plugin logging break the host page. */
    function warn(message) {
      try {
        console.warn('[' + NAME + '] ' + message)
      } catch (_error) { /* console unavailable: stay silent */ }
    }

    /** Render any thrown value as one short line. */
    function describe(error) {
      if (error === null || error === undefined) return String(error)
      if (typeof error === 'string') return error
      return error.message === undefined ? String(error) : String(error.message)
    }

    /**
     * Run the shell's `settings.open` command.
     * @param ctx - client root context.
     * @returns null when the command ran, otherwise a short human-readable reason.
     */
    function openSettings(ctx) {
      var shortcuts
      try {
        shortcuts = ctx.get('shortcuts')
      } catch (error) {
        return 'the shortcuts service lookup threw: ' + describe(error)
      }
      if (!shortcuts) return 'the shortcuts service is not available'
      var registry = shortcuts.registry
      if (!registry || typeof registry.invoke !== 'function') {
        return 'the shortcuts registry is not reachable'
      }
      var catalog = shortcuts.catalog
      if (catalog && typeof catalog.getSnapshot === 'function') {
        var rows = catalog.getSnapshot() || []
        var found = false
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].id === SETTINGS_COMMAND) { found = true; break }
        }
        if (!found) return 'the command "' + SETTINGS_COMMAND + '" is not registered'
      }
      try {
        registry.invoke(SETTINGS_COMMAND, { modal: null, region: 'page' })
        return null
      } catch (error) {
        return 'invoking "' + SETTINGS_COMMAND + '" threw: ' + describe(error)
      }
    }

    /**
     * Build the row's glyph — the component the sidebar renders INSIDE its own
     * panel button, next to the localized label it takes from our registration.
     * @param open - callback opening the Settings panel; returns a failure reason or null.
     * @returns a React component receiving the sidebar's icon share.
     */
    function createEntryGlyph(open) {
      return function SidebarSettingsGlyph(props) {
        var size = props && typeof props.size === 'number' ? props.size : 16
        var host = React.useRef(null)
        var state = React.useState(null)
        var failure = state[0]
        var setFailure = state[1]

        React.useEffect(function () {
          /**
           * One capture-phase listener above the React root. The row's live
           * button is resolved per click, so every part of the row — icon,
           * label, and the button's own padding — is covered.
           */
          var onClick = function (event) {
            var node = host.current
            if (!node) return
            var scope = node.closest ? node.closest('button') || node : node
            var target = event.target
            if (target !== scope && !(scope.contains && scope.contains(target))) return
            event.preventDefault()
            event.stopPropagation()
            var reason = open()
            if (reason) setFailure(reason)
          }
          document.addEventListener('click', onClick, true)
          /* The row button IS the row; without it only the glyph would answer,
             and a click on the label would fall through to the sidebar. */
          var mounted = host.current
          if (mounted && mounted.closest && mounted.closest('button') === null) {
            warn('the sidebar row button was not found above the glyph; only the icon can open Settings')
            setFailure('the sidebar row button was not found')
          }
          return function () {
            document.removeEventListener('click', onClick, true)
          }
        }, [])

        return React.createElement(
          'span',
          { ref: host, 'data-dsh-sidebar-settings-entry': '', style: { display: 'inline-flex' } },
          React.createElement(primitives.IconSettingsOutlineRegular, { size: size }),
          failure === null || failure === undefined
            ? null
            : React.createElement(primitives.Toast, {
              text: 'Settings: ' + failure,
              onDone: function () { setFailure(null) },
            }),
        )
      }
    }

    module.exports = {
      name: NAME,
      inject: ['slots', 'locale'],
      __internals: {
        NAME: NAME,
        NS: NS,
        ENTRY_ID: ENTRY_ID,
        ENTRY_ORDER: ENTRY_ORDER,
        SETTINGS_COMMAND: SETTINGS_COMMAND,
        dictionaries: { ZH: ZH, EN: EN, RU: RU },
        describe: describe,
        openSettings: openSettings,
        createEntryGlyph: createEntryGlyph,
      },
      apply: function apply(ctx) {
        var t = function (key) {
          return EN[key] === undefined ? key : EN[key]
        }
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            ctx.locale.register(NS, { zh: ZH, en: EN })
            /* Optional: only succeeds once a Russian language pack is installed. */
            try { ctx.locale.register(NS, 'ru', RU) } catch (_error) { /* no `ru` language here */ }
            if (typeof ctx.locale.bind === 'function') {
              var bound = ctx.locale.bind(NS)
              t = function (key) {
                var value = bound(key)
                if (value === undefined || value === null || value === '' || value === key) {
                  return EN[key] === undefined ? key : EN[key]
                }
                return value
              }
            }
          }
        } catch (error) {
          warn('dictionary registration failed; falling back to English: ' + describe(error))
        }

        ctx.effect(function () {
          return ctx.slots.inject('sidebar.panellist', function () {
            return ctx.slots.register({
              name: 'sidebar.panellist',
              id: ENTRY_ID,
              order: ENTRY_ORDER,
              locale: NS,
              label: function () { return t('entry') },
            }, createEntryGlyph(function () {
              var reason = openSettings(ctx)
              if (reason) warn('cannot open Settings: ' + reason)
              return reason
            }))
          })
        }, NAME + ': sidebar header entry')
      },
    }

    return module.exports
  },
})
