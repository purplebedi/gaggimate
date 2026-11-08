// Ask the scanner Worker for AI "studio illustrations" of a bag (see bean-scanner/src/render.js).

/** The scanner URL points at /scan; the render endpoint is its sibling. */
export function renderEndpoint(scanner) {
  if (!scanner?.endpoint) return '';
  return scanner.endpoint.replace(/\/scan\/?$/, '/render');
}

/**
 * Send the bag's photo(s) to be illustrated.
 * @param {{endpoint:string, token?:string}} scanner
 * @param {{front: Blob, back?: Blob|null, signal?: AbortSignal}} input  original photos (not flattened)
 * @returns {Promise<{front: string, back: string|null, backError?: string}>} URLs of the illustrations
 */
export async function requestRender(scanner, { front, back, signal }) {
  const url = renderEndpoint(scanner);
  if (!url) throw new Error('Scanner is not configured');
  const form = new FormData();
  const images = [{ role: 'front' }];
  form.append('image', front, 'front.jpg');
  if (back) {
    images.push({ role: 'back' });
    form.append('image', back, 'back.jpg');
  }
  form.append('spec', JSON.stringify({ images }));
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: scanner.token ? { Authorization: `Bearer ${scanner.token}` } : {},
      body: form,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Could not reach the scanner - check your internet connection');
  }
  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json()).error || '';
    } catch {
      // not JSON
    }
    if (response.status === 401 || response.status === 403)
      throw new Error(
        'Scanner rejected the token - open Scanner settings and use "Test connection"',
      );
    if (response.status === 501)
      throw new Error(detail || 'Illustrations are not set up on your scanner yet');
    throw new Error(detail || `Render failed (HTTP ${response.status})`);
  }
  const data = await response.json();
  if (!data?.front) throw new Error('The render service returned no image');
  return { front: data.front, back: data.back || null, backError: data.backError };
}
