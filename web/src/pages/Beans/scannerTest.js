// Helpers for the "Test connection" button in the scanner settings. Pure (fetch is injectable) so they can be unit tested.

/** Clean up what people paste into the token field: spaces, quotes, and a leading "SCANNER_TOKEN=". */
export function sanitizeToken(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^SCANNER_TOKEN\s*=\s*/i, '');
  t = t.replace(/^(['"])(.*)\1$/, '$2'); // surrounding quotes from a .env line
  return t.trim();
}

/** The scanner's status page lives at the root next to /scan. */
export function statusUrl(endpoint) {
  return endpoint.replace(/\/scan\/?$/, '/');
}

/**
 * Check, step by step, that the scanner is reachable, configured, and accepts this token.
 * @returns {Promise<Array<{ok: boolean|null, text: string}>>} lines to show (ok null = informational)
 */
export async function testScanner({ endpoint, token }, fetchImpl = fetch) {
  const lines = [];
  if (!endpoint) return [{ ok: false, text: 'Enter the scanner URL first.' }];
  let status;
  try {
    const res = await fetchImpl(statusUrl(endpoint));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    status = await res.json();
  } catch (err) {
    return [
      {
        ok: false,
        text: `Can't reach the scanner at ${statusUrl(endpoint)} (${err.message || 'network error'}). Is "npm run dev" still running, and is the URL right?`,
      },
    ];
  }
  lines.push({ ok: true, text: 'Scanner is running.' });
  if (status && typeof status === 'object' && 'openaiKeySet' in status) {
    lines.push(
      status.openaiKeySet
        ? { ok: true, text: 'The scanner has its OpenAI key.' }
        : {
            ok: false,
            text: 'The scanner has no OPENAI_API_KEY. Add it to .dev.vars and restart "npm run dev".',
          },
    );
  }
  if (!token) {
    lines.push({ ok: false, text: 'No token entered yet.' });
    return lines;
  }
  try {
    // an empty request: a good token gets "400 missing image", a bad one gets 401
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: new FormData(),
    });
    if (res.status === 401 || res.status === 403) {
      lines.push({
        ok: false,
        text: `Token rejected. It doesn't match the SCANNER_TOKEN the scanner was started with (you entered ${token.length} characters). Copy it again from .dev.vars — only the part after the "=".`,
      });
    } else if (res.status === 400 || res.status === 413 || res.ok) {
      lines.push({ ok: true, text: 'Token accepted.' });
    } else if (res.status === 501) {
      lines.push({ ok: true, text: 'Token accepted.' });
    } else {
      lines.push({ ok: false, text: `Unexpected reply from the scanner (HTTP ${res.status}).` });
    }
  } catch (err) {
    lines.push({
      ok: false,
      text: `Couldn't send the token check (${err.message || 'network error'}).`,
    });
  }
  return lines;
}
