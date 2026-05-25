const getBackendUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  const isDev = process.env.NEXT_PUBLIC_ENVIRONMENT === 'development' || process.env.NODE_ENV === 'development';
  const domain = isDev 
    ? (process.env.NEXT_PUBLIC_LOCAL_DOMAIN || 'localhost') 
    : (process.env.NEXT_PUBLIC_GLOBAL_DOMAIN || 'example.com');
  const port = isDev ? ':8000' : '';
  const protocol = isDev ? 'http:' : 'https:';
  const sub = isDev ? '' : 'api.';
  return `${protocol}//${sub}${domain}${port}/api`;
};

const BASE_URL = typeof window !== 'undefined'
  ? '/api'
  : (process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api` : getBackendUrl());

export const api = {
  async get(endpoint: string) {
    const clusterId = typeof window !== 'undefined' ? localStorage.getItem('active_cluster_id') : null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clusterId) {
      headers['x-cluster-id'] = clusterId;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  },

  async post(endpoint: string, data?: any) {
    const clusterId = typeof window !== 'undefined' ? localStorage.getItem('active_cluster_id') : null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clusterId) {
      headers['x-cluster-id'] = clusterId;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  }
};

// Typed endpoints for future use
export const kubiApi = {
  getIncidents: () => api.get('/incidents'),
  getPlans: () => api.get('/plans'),
  getStats: () => api.get('/stats'),
  triggerScan: (namespaces?: string[]) => {
    let query = '';
    if (namespaces && namespaces.length > 0) {
      query = '?' + namespaces.map(ns => `namespaces=${ns}`).join('&');
    }
    return api.post(`/scan${query}`);
  },
  approvePlan: (planId: string) => api.post(`/plans/${planId}/approve`),
  rejectPlan: (planId: string) => api.post(`/plans/${planId}/reject`),
  getResources: () => api.get('/resources'),
  getSettings: () => api.get('/settings'),
  updateSettings: (settings: any) => api.post('/settings', settings),
  getReports: () => api.get('/reports'),
  getIncidentReport: (incidentId: string) => api.get(`/incidents/${incidentId}/report`),
  validateGemini: (data?: any) => api.post('/gemini/validate', data),
  validateGitLab: (data?: any) => api.post('/gitlab/validate', data),
  validateCluster: (data: any) => api.post('/clusters/validate', data),
  executeManualAction: (data: any) => api.post('/actions/manual', data),
  validateChatOps: (data: any) => api.post('/chatops/validate', data),
};


export const getWsUrl = (path: string): string => {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/api${path}`;
};


