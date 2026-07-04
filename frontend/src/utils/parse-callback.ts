// AmmiAI deep-link / OAuth callback URL parsing.
//
// React Native's URL polyfill can misbehave on custom-scheme URLs like
// `ammiai://auth-callback#session_id=abc`. Some Android intent deliveries
// also come as `ammiai:///auth-callback?...` (three slashes) or with the
// session id split across query AND hash. This helper is deliberately
// string-based (never uses `new URL()`) so it survives all of that.
//
// It also accepts several common credential key names — `session_id`,
// `session_token`, `code`, `token` — because we don't fully control the
// upstream Emergent redirect format on native builds.

const CANDIDATE_KEYS = [
  "session_id",
  "sessionId",
  "session_token",
  "sessionToken",
  "code",
  "token",
] as const;

export type CallbackParseResult = {
  sessionId: string | null;
  found_key: string | null;
  raw_query: string;
  raw_fragment: string;
};

function pickKey(sp: URLSearchParams): { key: string; value: string } | null {
  for (const k of CANDIDATE_KEYS) {
    const v = sp.get(k);
    if (v) return { key: k, value: v };
  }
  return null;
}

/**
 * Parse a deep-link URL and extract the OAuth session id.
 * Returns `sessionId=null` when no supported key is present, along with
 * the raw fragment + query for diagnostic logging.
 */
export function parseAuthCallbackUrl(url: string | null | undefined): CallbackParseResult {
  const empty: CallbackParseResult = {
    sessionId: null,
    found_key: null,
    raw_query: "",
    raw_fragment: "",
  };
  if (!url || typeof url !== "string") return empty;

  // Locate `?` and `#` in the raw string. Order matters: if `#` comes
  // BEFORE `?` (some redirect servers do this), we still want to grab
  // everything after `?` up to end, and everything after `#` up to `?`.
  const hashIdx = url.indexOf("#");
  const queryIdx = url.indexOf("?");

  let queryStr = "";
  let fragmentStr = "";

  if (queryIdx >= 0) {
    // query runs to end OR to `#` if `#` comes after `?`.
    const end = hashIdx > queryIdx ? hashIdx : url.length;
    queryStr = url.slice(queryIdx + 1, end);
  }
  if (hashIdx >= 0) {
    // fragment runs to end OR to `?` if `?` comes after `#`.
    const end = queryIdx > hashIdx ? queryIdx : url.length;
    fragmentStr = url.slice(hashIdx + 1, end);
  }

  // Try fragment first — Emergent Google Auth typically hashes credentials
  // to keep them out of server logs. Then try query.
  for (const source of [fragmentStr, queryStr]) {
    if (!source) continue;
    try {
      const sp = new URLSearchParams(source);
      const hit = pickKey(sp);
      if (hit) {
        return {
          sessionId: hit.value,
          found_key: hit.key,
          raw_query: queryStr,
          raw_fragment: fragmentStr,
        };
      }
    } catch {
      // URLSearchParams shouldn't throw on any string but be defensive.
    }
  }

  // Last-ditch: manual `k=v` split across BOTH fragment and query joined by
  // `&`, in case the source is unusually shaped (e.g. `key=v#other=v`).
  const combined = [queryStr, fragmentStr].filter(Boolean).join("&");
  if (combined) {
    for (const pair of combined.split("&")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1));
      if ((CANDIDATE_KEYS as readonly string[]).includes(k) && v) {
        return {
          sessionId: v,
          found_key: k,
          raw_query: queryStr,
          raw_fragment: fragmentStr,
        };
      }
    }
  }

  return { sessionId: null, found_key: null, raw_query: queryStr, raw_fragment: fragmentStr };
}

/**
 * Redact everything after "=" for logging, so tokens never leak into
 * adb logcat / Metro logs. Keeps the key names + prefix intact.
 */
export function redactCallbackUrl(url: string | null | undefined): string {
  if (!url) return "<null>";
  return url.replace(/(=)([^&#\s]+)/g, (_m, eq, val) => {
    const keep = val.length > 6 ? val.slice(0, 3) + "…" + val.slice(-2) : "…";
    return `${eq}${keep}`;
  });
}
