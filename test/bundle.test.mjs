/**
 * Behavior tests for the dsh-sidebar-settings-button browser half.
 *
 * The bundle is a classic script that only calls `window.__ModuleLoader__.load`,
 * so it can be imported under Node with a stubbed loader, React, primitives and
 * document. These tests pin what can silently break:
 *
 * 1. the `sidebar.panellist` registration (id / order / label / locale),
 * 2. the capture-phase click interception — for the WHOLE row button, not just
 *    the icon, which is the bug that shipped in 0.1.0,
 * 3. the `settings.open` invocation and every degraded path around it.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const NAME = 'dsh-sidebar-settings-button'
const NS = 'sidebarSettingsButton'
const ENTRY_ID = 'sidebar-settings'
const SETTINGS_COMMAND = 'settings.open'

/** Captured `window.__ModuleLoader__.load(...)` spec. */
let spec = null
/** Listeners installed on the fake document, by type. */
let documentListeners = new Map()
/** Hook slots for the fake React, reused across "renders". */
let hookSlots = []
let hookCursor = 0
/** Effect callbacks collected by the fake React. */
let pendingEffects = []

const fakeReact = {
  createElement(type, props, ...children) {
    return {
      type,
      props: props ?? {},
      children: children.filter((child) => child !== null && child !== undefined),
    }
  },
  useRef(initial) {
    const index = hookCursor++
    if (!(index in hookSlots)) hookSlots[index] = { current: initial === undefined ? null : initial }
    return hookSlots[index]
  },
  useState(initial) {
    const index = hookCursor++
    if (!(index in hookSlots)) hookSlots[index] = typeof initial === 'function' ? initial() : initial
    const set = (value) => {
      hookSlots[index] = typeof value === 'function' ? value(hookSlots[index]) : value
    }
    return [hookSlots[index], set]
  },
  useEffect(fn) {
    pendingEffects.push(fn)
  },
}

const fakePrimitives = {
  modalSelector: '[role="dialog"][aria-modal="true"], [role="menu"]',
  IconSettingsOutlineRegular: function IconSettingsOutlineRegular() {},
  Toast: function Toast() {},
}

const fakeDocument = {
  querySelectorAll() {
    return []
  },
  addEventListener(type, listener) {
    const list = documentListeners.get(type) ?? []
    list.push(listener)
    documentListeners.set(type, list)
  },
  removeEventListener(type, listener) {
    const list = documentListeners.get(type) ?? []
    documentListeners.set(type, list.filter((entry) => entry !== listener))
  },
}

function requireStub(id) {
  if (id === 'react') return fakeReact
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return fakePrimitives
  throw new Error(`unexpected require("${id}") — the bundle may only require platform modules`)
}

before(async () => {
  globalThis.window = { __ModuleLoader__: { load(candidate) { spec = candidate } } }
  globalThis.document = fakeDocument
  await import('../client/bundle.js')
  assert.ok(spec, 'the bundle must register itself through window.__ModuleLoader__.load')
  assert.equal(spec.id, NAME, 'the bundle id must be the package name the host looks it up by')
})

after(() => {
  delete globalThis.window
  delete globalThis.document
})

/**
 * A minimal client context recording registrations, injections and effects.
 * @param options - `shortcuts` service stand-in and locale behaviors.
 */
function makeContext(options = {}) {
  const state = {
    registrations: [],
    injections: [],
    effects: [],
    dicts: new Map(),
    activeLocale: 'en',
  }
  const ctx = {
    get(name) {
      if (name === 'shortcuts') return options.shortcuts
      return undefined
    },
    locale: {
      register(ns, first) {
        if (typeof first === 'string') {
          if (options.rejectLocale === first) throw new Error(`locale "${first}" is already registered`)
          return () => {}
        }
        state.dicts.set(ns, first)
        return () => {}
      },
      bind(ns) {
        return (key) => {
          const dicts = state.dicts.get(ns) ?? {}
          const dict = dicts[state.activeLocale] ?? dicts.en ?? {}
          return dict[key] === undefined ? key : dict[key]
        }
      },
    },
    slots: {
      inject(key, callback) {
        state.injections.push({ key, callback })
        return () => {}
      },
      register(opts, component) {
        state.registrations.push({ opts, component })
        return () => {}
      },
    },
    effect(fn, label) {
      state.effects.push({ fn, label })
    },
  }
  return { ctx, state }
}

/** Apply the plugin and run the deferred slot injection once. */
function mount(plugin, options = {}) {
  const { ctx, state } = makeContext(options)
  plugin.apply(ctx)
  for (const effect of state.effects) effect.fn()
  for (const injection of state.injections) injection.callback()
  return { ctx, state }
}

/**
 * Render the registered glyph once, keeping fake-React hook state between calls.
 * React would have attached the ref before effects run, so the fake DOM shape —
 * a row button wrapping the glyph, plus a label sibling and padding — is bound
 * first too.
 */
function renderGlyph(component) {
  hookCursor = 0
  pendingEffects = []
  const node = { closest: () => null }
  const element = component({ size: 16 })
  element.props.ref.current = node
  const row = fakeRow(node)
  for (const fn of pendingEffects) fn()
  return { element, node, row, listener: documentListeners.get('click').at(-1) }
}

/** Re-render the same component without re-running effects (React commit shape). */
function rerenderGlyph(component) {
  hookCursor = 0
  pendingEffects = []
  return component({ size: 16 })
}

/** A fake row: one button wrapping the glyph, plus a label sibling and padding. */
function fakeRow(glyphNode) {
  const button = { contains: (target) => target === button || target === glyphNode || target === labelNode || target === paddingNode }
  const labelNode = { closest: () => button }
  const paddingNode = { closest: () => button }
  glyphNode.closest = () => button
  return { button, labelNode, paddingNode }
}

/** Dispatch one click through the installed listener. */
function click(listener, target) {
  const flags = { prevented: false, stopped: false }
  listener({
    target,
    preventDefault() { flags.prevented = true },
    stopPropagation() { flags.stopped = true },
  })
  return flags
}

test('registers one sidebar.panellist row ordered before Plugins', async () => {
  const plugin = spec.factory(requireStub)
  assert.equal(plugin.name, NAME)
  assert.deepEqual(plugin.inject, ['slots', 'locale'])

  const { state } = mount(plugin)
  assert.equal(state.effects.length, 1, 'the registration must live inside ctx.effect so unload collapses it')
  assert.equal(state.injections.length, 1)
  assert.equal(state.injections[0].key, 'sidebar.panellist', 'the row belongs to the sidebar header seat')
  assert.equal(state.registrations.length, 1)

  const { opts, component } = state.registrations[0]
  assert.equal(opts.name, 'sidebar.panellist')
  assert.equal(opts.id, ENTRY_ID)
  assert.equal(opts.order, -10, 'Plugins ships at order 0, so the row must precede it')
  assert.equal(opts.locale, NS)
  assert.equal(typeof opts.label, 'function')
  assert.equal(opts.label(), 'Settings')
  assert.equal(typeof component, 'function')
})

test('the row label follows the active locale and falls back to English', async () => {
  const plugin = spec.factory(requireStub)
  const { state } = mount(plugin)
  const label = state.registrations[0].opts.label

  assert.equal(label(), 'Settings')
  state.activeLocale = 'zh'
  assert.equal(label(), '设置')
  state.activeLocale = 'de'
  assert.equal(label(), 'Settings')
})

test('a click anywhere on the row opens Settings through the shell command', async () => {
  const plugin = spec.factory(requireStub)
  const invocations = []
  const shortcuts = {
    catalog: { getSnapshot: () => [{ id: SETTINGS_COMMAND, binding: null }] },
    registry: { invoke(id, context) { invocations.push({ id, context }) } },
  }
  const { state } = mount(plugin, { shortcuts })
  const component = state.registrations[0].component

  hookSlots = []
  const { node, row, listener } = renderGlyph(component)
  assert.equal(typeof listener, 'function')

  // The icon: a click on the glyph itself.
  const onIcon = click(listener, node)
  assert.equal(onIcon.prevented, true)
  assert.equal(onIcon.stopped, true)
  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].id, SETTINGS_COMMAND)
  assert.equal(invocations[0].context.region, 'page')
  assert.equal(invocations[0].context.modal, null, 'a mounted [role=menu] must not swallow the invocation')

  // The label: the regression this fix exists for. The label is a SIBLING of the
  // glyph, so intercepting only the glyph left most of the row dead.
  const onLabel = click(listener, row.labelNode)
  assert.equal(onLabel.stopped, true, 'a click on the label is still a click on the row')
  assert.equal(invocations.length, 2)

  // The button's own padding around the content.
  click(listener, row.paddingNode)
  assert.equal(invocations.length, 3)

  // Anything outside the row is ignored.
  click(listener, { other: true })
  assert.equal(invocations.length, 3)
})

test('a failing invocation reports its reason in a Toast instead of doing nothing', async () => {
  const plugin = spec.factory(requireStub)
  const { state } = mount(plugin, { shortcuts: undefined })
  const component = state.registrations[0].component

  hookSlots = []
  const first = renderGlyph(component)
  assert.equal(first.element.children.length, 1, 'no Toast before the first failure')

  const originalWarn = console.warn
  console.warn = () => {}
  try {
    click(first.listener, first.node)
  } finally {
    console.warn = originalWarn
  }
  const second = rerenderGlyph(component)

  assert.equal(second.children.length, 2, 'a failed click must render a Toast')
  const toast = second.children[1]
  assert.equal(toast.type, fakePrimitives.Toast)
  assert.match(toast.props.text, /^Settings: /)
  assert.match(toast.props.text, /shortcuts service/)
})

test('every degraded path returns a reason, and the click logs it', async () => {
  const plugin = spec.factory(requireStub)
  const originalWarn = console.warn
  const warnings = []
  try {
    console.warn = () => {}
    const reason = (ctx) => plugin.__internals.openSettings(ctx)

    assert.match(reason({ get: () => undefined }), /not available/)
    assert.match(reason({ get: () => ({ catalog: undefined }) }), /registry is not reachable/)
    assert.match(reason({
      get: () => ({ catalog: { getSnapshot: () => [{ id: 'other' }] }, registry: { invoke() {} } }),
    }), /is not registered/)
    assert.match(reason({
      get: () => ({
        catalog: { getSnapshot: () => [{ id: SETTINGS_COMMAND }] },
        registry: { invoke() { throw new Error('boom') } },
      }),
    }), /threw: boom/)
    assert.match(reason({ get() { throw new Error('boom') } }), /lookup threw: boom/)
    assert.equal(reason({
      get: () => ({
        catalog: { getSnapshot: () => [{ id: SETTINGS_COMMAND }] },
        registry: { invoke() {} },
      }),
    }), null, 'success is the absence of a reason')

    // The reason a user actually hits is also logged for DevTools (F12).
    console.warn = (...args) => { warnings.push(args.join(' ')) }
    const { state } = mount(plugin, { shortcuts: undefined })
    hookSlots = []
    const rendered = renderGlyph(state.registrations[0].component)
    click(rendered.listener, rendered.node)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /cannot open Settings/)
  } finally {
    console.warn = originalWarn
  }
})

test('apply survives a locale service that refuses the optional ru dictionary', async () => {
  const plugin = spec.factory(requireStub)
  const mounted = mount(plugin, { rejectLocale: 'ru' })
  assert.equal(mounted.state.registrations.length, 1)
  assert.equal(mounted.state.registrations[0].opts.id, ENTRY_ID)
  assert.equal(mounted.state.registrations[0].opts.label(), 'Settings')
})
