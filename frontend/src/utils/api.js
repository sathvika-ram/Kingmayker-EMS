const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://kingmayker-ems.onrender.com';

export const API = `${API_BASE_URL}/api`;
export default API_BASE_URL;
