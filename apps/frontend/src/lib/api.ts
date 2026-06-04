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

export const readApiResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return { detail: text || response.statusText };
};

const handleResponse = async (response: Response) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    localStorage.removeItem("active_cluster_id");
    localStorage.removeItem("active_workspace_id");
    localStorage.removeItem("user_scopes");
    localStorage.removeItem("auth_provider");
    window.location.href = "/login";
    throw new Error("Session expired. Please log in again.");
  }
  if (!response.ok) {
    let errorDetail = `API Error: ${response.statusText}`;
    const status = response.status;
    try {
      const errJson = await readApiResponse(response);
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch (_) {}
    const error = new Error(errorDetail);
    (error as any).status = status;
    throw error;
  }
  return readApiResponse(response);
};

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
    return handleResponse(response);
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
    return handleResponse(response);
  },

  async delete(endpoint: string) {
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
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
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
  listPlaybooks: () => api.get('/playbooks'),
  createPlaybook: (data: any) => api.post('/playbooks', data),
  deletePlaybook: (playbookId: string) => api.delete(`/playbooks/${playbookId}`),
  executePlaybook: (playbookId: string) => api.post(`/playbooks/${playbookId}/execute`),
  getPodYaml: (namespace: string, podName: string) => api.get(`/pods/${namespace}/${podName}/yaml`),
  getPerformanceStats: () => api.get('/stats/performance'),

  // 👥 SaaS Workspaces
  getWorkspaces: () => api.get('/workspaces'),
  createWorkspace: (name: string) => api.post('/workspaces', { name }),
  switchWorkspace: (workspaceId: string) => api.post(`/workspaces/${workspaceId}/switch`),
  inviteWorkspaceMember: (workspaceId: string, email: string, role: string) => 
    api.post(`/workspaces/${workspaceId}/invite`, { email, role }),
  revokeWorkspaceMember: (workspaceId: string, userId: string) => 
    api.delete(`/workspaces/${workspaceId}/members/${userId}`),
  getWorkspaceMembers: (workspaceId: string) => 
    api.get(`/workspaces/${workspaceId}/members`),

  // 🔑 Linked SSO Identities
  getLinkedAccounts: () => api.get('/auth/linked-accounts'),
  unlinkAccount: (provider: string) => api.delete(`/auth/linked-accounts/${provider}`),

  // 🔎 Elasticsearch Diagnostics & Logs Search
  getEsHealth: () => api.get('/es/health'),
  validateEs: (data?: any) => api.post('/es/validate', data),
  searchLogs: (query: string, index?: string, size?: number) => {
    let params = `?q=${encodeURIComponent(query)}`;
    if (index) params += `&index=${index}`;
    if (size) params += `&size=${size}`;
    return api.get(`/es/search-logs${params}`);
  },

  // 🛠️ Diagnostics & Utilities
  getPlanDetails: (planId: string) => api.get(`/plans/${planId}`),
  getPlanLineage: (planId: string) => api.get(`/plans/${planId}/lineage`),
  getBackendHealth: () => api.get('/health'),
  getDevToken: () => api.get('/auth/dev-token'),
  sendOtp: (email: string) => api.post('/auth/otp/send', { email }),
  verifyOtp: (email: string, code: string) => api.post('/auth/otp/verify', { email, code }),

  // ⚡ Incident Ingestion Simulation
  ingestIncidentSim: (data: {
    pod_name: string;
    cluster_id?: string;
    namespace?: string;
    type?: string;
    message?: string;
    raw_logs?: string;
    status?: string;
  }, useV1: boolean = true) => {
    const endpoint = useV1 ? '/v1/incidents/ingest' : '/incidents/ingest';
    return api.post(endpoint, data);
  },
  getAnomalyTemplates: () => api.get('/incidents/anomaly-templates')
};


export const getWsUrl = (path: string): string => {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/api${path}`;
};


