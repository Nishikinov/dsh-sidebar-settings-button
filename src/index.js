/**
 * dsh-sidebar-settings-button — Host half.
 *
 * The whole feature lives in the browser: the client half registers one row
 * into the sidebar's `sidebar.panellist` seat, ordered before the Plugins
 * panel, and routes its click to the shell-owned Settings panel. Nothing here
 * reaches a model request, the settings document, or the filesystem, so the
 * Host half exists only to give the bundle a Loader entry — which is exactly
 * what `@deepseek-ai/dsh-client-modules` scans to discover the client bundle.
 */

/** Loader entry name; must equal the package name the client bundle registers under. */
export const name = 'dsh-sidebar-settings-button'

/** No Host services are consumed. */
export const inject = []

/** No Host-side behavior; the client half owns the entire feature. */
export function apply() {}
