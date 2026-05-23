const BASE_URL = typeof window !== 'undefined'
  ? '/api'
  : (process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api` : 'http://localhost:8000/api');

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
};

