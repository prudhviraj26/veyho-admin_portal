import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/v1',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  // Read token from localStorage
  const token = localStorage.getItem('shq_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // Read CSRF token from cookie if present
  const match = document.cookie.match(new RegExp('(^| )shq_csrf=([^;]+)'));
  if (match) {
    config.headers['X-CSRF-Token'] = match[2];
  }

  // Support access integration
  const supportSchoolId = localStorage.getItem('shq_support_school_id');
  if (supportSchoolId) {
    config.headers['x-support-access-school-id'] = supportSchoolId;
  }

  return config;
});

// Automatic response interceptor to handle token expiry / unauthenticated state
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear local storage and redirect if unauthenticated
      localStorage.removeItem('shq_token');
      localStorage.removeItem('shq_support_school_id');
    }
    return Promise.reject(error);
  }
);
