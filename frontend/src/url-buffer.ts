// Global deep-link URL buffer.
//
// WHY THIS EXISTS: on Android standalone builds, the OAuth redirect
// (`ammiai://auth-callback#session_id=…`) is consumed by expo-router to
// NAVIGATE to the /auth-callback screen. By the time that screen mounts and
// attaches its own Linking listener, the "url" event has already fired —
// so the screen saw <null>. This module subscribes at import time (imported
// for side effects at the very top of app/_layout.tsx), which happens before
// any screen mounts, so no URL can slip past it.
import * as Linking from "expo-linking";

let lastUrl: string | null = null;
const listeners = new Set<(url: string) => void>();

function record(url: string | null | undefined, source: string) {
  if (!url) return;
  lastUrl = url;
  console.log(`[url-buffer] captured (${source}): ${url.split(/[?#]/)[0]}…`);
  listeners.forEach((fn) => {
    try {
      fn(url);
    } catch {}
  });
}

// Subscribe the moment this module is imported — before React renders.
Linking.addEventListener("url", (evt) => record(evt.url, "event"));
Linking.getInitialURL()
  .then((url) => record(url, "initial"))
  .catch(() => {});

/** The most recent deep-link URL seen since app boot (or null). */
export function getBufferedUrl(): string | null {
  return lastUrl;
}

/** Subscribe to future deep-link URLs. Returns an unsubscribe fn. */
export function onBufferedUrl(fn: (url: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clear after successful consumption so a stale URL isn't re-processed. */
export function clearBufferedUrl() {
  lastUrl = null;
}
