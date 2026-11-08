import uuidv4 from '../utils/uuid.js';

/**
 * Client for the BeansPlugin websocket API and the optional external
 * bean-scanner service (photo -> structured bean data via AI vision).
 *
 * The scanner endpoint/token live on the device inside the beans store so
 * every browser talking to the machine shares the same configuration.
 */

export async function listBeans(apiService) {
  const response = await apiService.request({ tp: 'req:beans:list' });
  return {
    beans: response.beans || [],
    activeBeanId: response.activeBeanId || '',
    scanner: response.scanner || { endpoint: '', token: '' },
  };
}

export async function saveBean(apiService, bean) {
  const record = { ...bean };
  if (!record.id) {
    record.id = uuidv4();
    record.createdAt = Math.floor(Date.now() / 1000);
  }
  const response = await apiService.request({ tp: 'req:beans:save', bean: record });
  if (response.error) {
    throw new Error(response.error);
  }
  return record;
}

export async function deleteBean(apiService, id) {
  const response = await apiService.request({ tp: 'req:beans:delete', id });
  if (response.error) {
    throw new Error(response.error);
  }
}

export async function setActiveBean(apiService, id) {
  const response = await apiService.request({ tp: 'req:beans:set-active', id });
  if (response.error) {
    throw new Error(response.error);
  }
}

export async function saveScannerConfig(apiService, scanner) {
  const response = await apiService.request({ tp: 'req:beans:scanner:save', scanner });
  if (response.error) {
    throw new Error(response.error);
  }
}

export async function getBeanShots(apiService, id) {
  const response = await apiService.request({ tp: 'req:beans:shots', id });
  return response.shots || [];
}

/**
 * Downscale a bag photo client-side before upload. Vision models don't gain
 * accuracy beyond ~1600px on the long edge and home upload bandwidth is the
 * slowest link in the flow.
 */
export function resizePhoto(file, maxDimension = 1568, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export async function scanPhoto(scanner, file) {
  if (!scanner?.endpoint) {
    throw new Error('Scanner is not configured');
  }
  const blob = await resizePhoto(file);
  const body = new FormData();
  body.append('image', blob, 'bean-bag.jpg');
  const headers = {};
  if (scanner.token) {
    headers['Authorization'] = `Bearer ${scanner.token}`;
  }
  const response = await fetch(scanner.endpoint, { method: 'POST', headers, body });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Scanner rejected the token - check scanner settings');
    }
    throw new Error(`Scanner request failed (HTTP ${response.status})`);
  }
  return await response.json();
}
