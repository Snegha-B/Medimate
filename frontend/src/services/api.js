export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

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

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    console.error('Network Error during apiFetch:', netErr);
    throw new Error(`Unable to connect to backend server at ${API_BASE_URL}. Please ensure the server is running.`);
  }

  if (response.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/register')) {
    clearAuthSession();
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let errorMessage = 'API Request failed';
    if (typeof data === 'object' && data !== null) {
      if (data.error) {
        errorMessage = data.error;
      } else if (data.detail) {
        errorMessage = data.detail;
      } else {
        const messages = [];
        for (const [key, val] of Object.entries(data)) {
          const valStr = Array.isArray(val) ? val.join(', ') : String(val);
          messages.push(`${key}: ${valStr}`);
        }
        if (messages.length > 0) {
          errorMessage = messages.join(' | ');
        }
      }
    } else if (typeof data === 'string' && data.trim()) {
      errorMessage = data;
    }
    throw new Error(errorMessage);
  }

  return data;
}

export const api = {
  baseURL: API_BASE_URL,
  defaults: { baseURL: API_BASE_URL },
  get: (endpoint) => apiFetch(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (endpoint, body) => apiFetch(endpoint, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: (endpoint, body) => apiFetch(endpoint, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};

export default api;

