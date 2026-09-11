import axios from 'axios';

let accessToken = null;
let onUnauthorized = () => {};

export function setAccessToken(token) {
  accessToken = token;
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// In local dev, Vite's proxy forwards /api to the backend (see vite.config.js),
// so the relative path works with no env var needed. In production the client
// and API are on different domains (Vercel + Render), so VITE_API_BASE_URL
// must point at the deployed API, e.g. https://expensehub-api.onrender.com/api.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && !config._retried && config.url !== '/auth/refresh' && config.url !== '/auth/login') {
      config._retried = true;
      try {
        if (!refreshPromise) {
          refreshPromise = api.post('/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        const { data } = await refreshPromise;
        setAccessToken(data.accessToken);
        config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(config);
      } catch (refreshErr) {
        onUnauthorized();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong';
}

export function apiErrorCode(error) {
  return error?.response?.data?.error?.code;
}

export function apiErrorDetails(error) {
  return error?.response?.data?.error?.details;
}

export default api;
