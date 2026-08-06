const API_BASE_URL = 'http://127.0.0.1:8000';

export function getAuthToken() {
  return localStorage.getItem('token') || '';
}

export function getUserId() {
  return localStorage.getItem('userId') || '';
}

export function setAuthSession(data) {
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  if (data.user) {
    localStorage.setItem('userId', data.user.id);
    localStorage.setItem('username', data.user.username);
  }
}

export function clearAuthSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
}

export async function apiFetch(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers,
    credentials: 'include',
  };

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, config);
  
  if (response.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/register')) {
    clearAuthSession();
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMessage = typeof data === 'object' ? (data.error || data.detail || 'API Request failed') : data;
    throw new Error(errorMessage);
  }

  return data;
}

export const api = {
  get: (endpoint) => apiFetch(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (endpoint, body) => apiFetch(endpoint, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};

export default api;
