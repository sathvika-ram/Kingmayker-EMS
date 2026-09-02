export function getApiBaseUrl(hostname) {
  const host = String(hostname || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')).toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');

  return isLocalHost
    ? 'http://localhost:5000'
    : 'https://kingmayker-ems.onrender.com';
}

const API_BASE_URL = getApiBaseUrl();
export const API = `${API_BASE_URL}/api`;
export default API_BASE_URL;
