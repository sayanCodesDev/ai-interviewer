/** Settings the build bakes into the bundle (see build.ts). Undefined in the dev server, where the defaults apply. */
declare const __VITE_BACKEND_URL__: string | undefined;
declare const __VITE_SITE_URL__: string | undefined;
declare const __VITE_CONTACT_EMAIL__: string | undefined;
/** The installed monaco-editor version, baked in so its static files can be cached forever at a versioned URL
 * instead of revalidated on a timer — a stale cache after a version bump used to leave the editor's typing
 * area unable to load. Undefined in the dev server, where monaco-setup.ts falls back to an unversioned path. */
declare const __MONACO_VERSION__: string | undefined;
