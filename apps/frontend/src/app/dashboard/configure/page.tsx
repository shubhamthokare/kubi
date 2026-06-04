'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  Shield, 
  Zap, 
  Globe, 
  Lock,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Server,
  RefreshCw,
  AlertTriangle,
  Check,
  X,
  PlusCircle,
  Settings2,
  Timer,
  Clock
} from 'lucide-react';
import { 
  Box, 
  Typography, 
  Container, 
  Grid, 
  Card, 
  CardContent, 
  Button, 
  Stack, 
  TextField, 
  Switch, 
  Divider,
  Paper,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl
} from '@mui/material';
import { kubiApi } from '@/lib/api';

export default function MultiClusterConfigurePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  
  // Settings & Cluster State
  const [fullSettings, setFullSettings] = useState<any>({});
  const [clusters, setClusters] = useState<any[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [geminiModel, setGeminiModel] = useState('models/gemini-2.5-pro');

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentCluster, setCurrentCluster] = useState<any>({
    id: '',
    name: '',
    agent_url: '',
    namespace: '*',
    kubeconfig: ''
  });

  // Secure View Dialog State
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingCluster, setViewingCluster] = useState<any>(null);

  // Validation States
  const [validationStates, setValidationStates] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error', message: string }>>({});
  const [testingApi, setTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<Record<string, number>>({});

  useEffect(() => {
    const activeKeys = Object.keys(cooldownSeconds).filter(k => cooldownSeconds[k] > 0);
    if (activeKeys.length === 0) return;

    const interval = setInterval(() => {
      setCooldownSeconds(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (next[key] > 0) {
            next[key] -= 1;
            changed = true;
            if (next[key] <= 0) {
              delete next[key];
            }
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const data = await kubiApi.getSettings();
        setFullSettings(data);
        setClusters(data.clusters || []);
        setAutoApprove(!!data.auto_remediation);
        
        let modelVal = data.gemini_model || 'models/gemini-2.5-pro';
        if (modelVal && !modelVal.startsWith('models/')) {
          modelVal = `models/${modelVal}`;
        }
        setGeminiModel(modelVal);
        
        // Auto-trigger validation for existing clusters on load
        if (data.clusters) {
          data.clusters.forEach((cluster: any) => {
            testClusterConnection(cluster.id, cluster);
          });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testClusterConnection = async (clusterId: string, clusterObj?: any) => {
    if (cooldownSeconds[clusterId] > 0) return;
    const targetCluster = clusterObj || clusters.find(c => c.id === clusterId);
    if (!targetCluster) return;
    try {
      setValidationStates(prev => ({
        ...prev,
        [clusterId]: { status: 'testing', message: 'Connecting...' }
      }));
      
      const res = await kubiApi.validateCluster({
        auth_type: targetCluster.auth_type || 'agent',
        agent_url: targetCluster.agent_url,
        kubeconfig: targetCluster.kubeconfig,
        api_endpoint: targetCluster.api_endpoint,
        ca_cert: targetCluster.ca_cert,
        client_cert: targetCluster.client_cert,
        client_key: targetCluster.client_key
      });
      if (res.status === 'success') {
        setValidationStates(prev => ({
          ...prev,
          [clusterId]: { status: 'success', message: 'Connected' }
        }));
      } else {
        setValidationStates(prev => ({
          ...prev,
          [clusterId]: { status: 'error', message: res.message || 'Unreachable' }
        }));
      }
    } catch (error: any) {
      if (error.status === 429) {
        // Parse dynamic cooldown seconds or default to 60
        let seconds = 60;
        const match = error.message.match(/(\d+) seconds/);
        if (match && match[1]) {
          seconds = parseInt(match[1], 10);
        }
        setCooldownSeconds(prev => ({
          ...prev,
          [clusterId]: seconds
        }));
        setValidationStates(prev => ({
          ...prev,
          [clusterId]: { status: 'error', message: error.message || 'Rate limit exceeded' }
        }));
      } else {
        setValidationStates(prev => ({
          ...prev,
          [clusterId]: { status: 'error', message: error.message || 'Offline' }
        }));
      }
    }
  };

  const handleSaveAllSettings = async () => {
    try {
      setSaving(true);
      setSaveStatus('Saving changes...');
      
      const updatedSettings = {
        ...fullSettings,
        clusters: clusters,
        auto_remediation: autoApprove,
        gemini_model: geminiModel,
        // Sync first cluster namespace to backend namespace field for legacy support
        namespaces: clusters.length > 0 ? [clusters[0].namespace] : ['default']
      };
      
      await kubiApi.updateSettings(updatedSettings);
      setSaveStatus('All configurations persisted successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
      
      // Update local storage active cluster if current deleted
      const currentActive = localStorage.getItem('active_cluster_id');
      if (currentActive && !clusters.some(c => c.id === currentActive)) {
        if (clusters.length > 0) {
          localStorage.setItem('active_cluster_id', clusters[0].id);
        } else {
          localStorage.removeItem('active_cluster_id');
        }
      }
    } catch (error) {
      setSaveStatus('Failed to save settings');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDialog = (cluster?: any) => {
    if (cluster) {
      setCurrentCluster({
        auth_type: 'agent',
        api_endpoint: '',
        ca_cert: '',
        client_cert: '',
        client_key: '',
        ...cluster
      });
      setIsEdit(true);
    } else {
      setCurrentCluster({
        id: 'cluster-' + Math.random().toString(36).substr(2, 9),
        name: '',
        auth_type: 'agent',
        agent_url: 'http://',
        api_endpoint: 'https://',
        ca_cert: '',
        client_cert: '',
        client_key: '',
        namespace: '*',
        kubeconfig: ''
      });
      setIsEdit(false);
    }
    setDialogOpen(true);
  };

  const handleSaveCluster = async () => {
    if (!currentCluster.name) {
      alert('Please fill out Cluster Name.');
      return;
    }
    if (currentCluster.auth_type === 'agent' && !currentCluster.agent_url) {
      alert('Please fill out Agent URL.');
      return;
    }
    if (currentCluster.auth_type === 'direct' && !currentCluster.api_endpoint) {
      alert('Please fill out API Server Endpoint.');
      return;
    }
    if (currentCluster.auth_type === 'kubeconfig' && !currentCluster.kubeconfig) {
      alert('Please provide Kubeconfig YAML.');
      return;
    }
    
    let nextClusters = [...clusters];
    if (isEdit) {
      nextClusters = nextClusters.map(c => c.id === currentCluster.id ? currentCluster : c);
    } else {
      nextClusters.push(currentCluster);
    }
    
    setClusters(nextClusters);
    setDialogOpen(false);
    
    // Sync active_cluster_id
    let nextActiveClusterId = localStorage.getItem('active_cluster_id');
    if (!nextActiveClusterId && nextClusters.length > 0) {
      nextActiveClusterId = nextClusters[0].id;
      localStorage.setItem('active_cluster_id', nextActiveClusterId);
    }
    
    // Auto-save to backend
    try {
      setSaving(true);
      const updatedSettings = {
        ...fullSettings,
        clusters: nextClusters,
        active_cluster_id: nextActiveClusterId,
        auto_remediation: autoApprove,
        gemini_model: geminiModel,
        namespaces: nextClusters.length > 0 ? [nextClusters[0].namespace] : ['default']
      };
      await kubiApi.updateSettings(updatedSettings);
      setFullSettings((prev: any) => ({ ...prev, clusters: nextClusters, active_cluster_id: nextActiveClusterId }));
    } catch (err) {
      console.error('Failed to save cluster on backend:', err);
    } finally {
      setSaving(false);
    }
    
    // Validate connection right away
    testClusterConnection(currentCluster.id, currentCluster);
  };

  const handleDeleteCluster = async (id: string) => {
    if (confirm('Are you sure you want to delete this cluster connection?')) {
      const nextClusters = clusters.filter(c => c.id !== id);
      setClusters(nextClusters);
      
      const currentActive = localStorage.getItem('active_cluster_id');
      let nextActiveClusterId = currentActive;
      if (currentActive === id) {
        if (nextClusters.length > 0) {
          nextActiveClusterId = nextClusters[0].id;
        } else {
          nextActiveClusterId = null;
        }
      }

      try {
        setSaving(true);
        const updatedSettings = {
          ...fullSettings,
          clusters: nextClusters,
          active_cluster_id: nextActiveClusterId,
          auto_remediation: autoApprove,
          gemini_model: geminiModel,
          namespaces: nextClusters.length > 0 ? [nextClusters[0].namespace] : ['default']
        };
        await kubiApi.updateSettings(updatedSettings);
        
        // Update fullSettings to keep it in sync
        setFullSettings((prev: any) => ({ ...prev, clusters: nextClusters, active_cluster_id: nextActiveClusterId }));
        
        // Update active_cluster_id in localStorage if the deleted cluster was active
        if (nextActiveClusterId) {
          localStorage.setItem('active_cluster_id', nextActiveClusterId);
        } else {
          localStorage.removeItem('active_cluster_id');
        }
        
        setSaveStatus('Cluster removed successfully!');
        setTimeout(() => setSaveStatus(null), 3000);
      } catch (err) {
        console.error('Failed to delete cluster on backend:', err);
        // Rollback optimistic update on failure
        setClusters(clusters);
        setSaveStatus('Failed to remove cluster');
        setTimeout(() => setSaveStatus(null), 3000);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleModelChange = async (newModel: string) => {
    setGeminiModel(newModel);
    try {
      setSaving(true);
      const updatedSettings = {
        ...fullSettings,
        gemini_model: newModel,
        clusters: clusters,
        active_cluster_id: fullSettings.active_cluster_id,
        auto_remediation: autoApprove,
        namespaces: clusters.length > 0 ? [clusters[0].namespace] : ['default']
      };
      await kubiApi.updateSettings(updatedSettings);
      setFullSettings(updatedSettings);
      setSaveStatus('AI Model updated successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to update AI model:', err);
      setSaveStatus('Failed to update AI model');
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleViewKubeconfig = (cluster: any) => {
    setViewingCluster(cluster);
    setViewDialogOpen(true);
  };

  const testApiConnection = async () => {
    try {
      setTestingApi(true);
      setApiStatus(null);
      const res = await kubiApi.validateGemini();
      if (res.status === 'success') {
        setApiStatus({ success: true, message: res.message });
      } else {
        setApiStatus({ success: false, message: res.message });
      }
    } catch (error: any) {
      setApiStatus({ success: false, message: error.message || "Connection failed" });
    } finally {
      setTestingApi(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 6 }}>
        <Typography variant="h4" fontWeight="800" color="white" sx={{ letterSpacing: '-0.5px' }} gutterBottom>
          Kubi Multi-Cluster Hub
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Register external Kubi Agents to orchestrate real-time incident resolution and diagnostics across your Kubernetes deployments.
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {/* Left: Cluster List */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ bgcolor: '#0f172a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', mb: 4 }}>
            <CardContent sx={{ p: 4 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                    <Server size={20} />
                  </Box>
                  <Typography variant="h6" fontWeight="bold" color="white">Registered Clusters</Typography>
                </Stack>
                <Button 
                  variant="outlined" 
                  startIcon={<Plus size={18} />}
                  onClick={() => handleOpenDialog()}
                  sx={{ textTransform: 'none', borderRadius: 2, borderWidth: '1px' }}
                >
                  Register Cluster
                </Button>
              </Stack>

              {Object.keys(cooldownSeconds).length > 0 && (
                <Paper
                  sx={{
                    p: 3,
                    mb: 3.5,
                    background: 'rgba(249, 115, 22, 0.05)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(249, 115, 22, 0.2)',
                    borderRadius: 3,
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '4px',
                      height: '100%',
                      bgcolor: '#f97316'
                    }
                  }}
                >
                  <Stack direction="row" spacing={2.5} alignItems="flex-start">
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
                      <Timer size={24} className="animate-pulse" />
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" fontWeight="bold" color="white" gutterBottom>
                        Rate Limit Shield Triggered (HTTP 429)
                      </Typography>
                      <Typography variant="body2" color="rgba(255, 255, 255, 0.7)" sx={{ mb: 2 }}>
                        Operational security limits reached for connection diagnostics. The platform has automatically initiated a client-side cooldown lock to protect infrastructure performance.
                      </Typography>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <CircularProgress size={16} sx={{ color: '#f97316' }} />
                        <Typography variant="caption" fontWeight="600" color="#f97316">
                          Active Cooldown Remaining: {Math.max(...Object.values(cooldownSeconds), 0)}s
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                </Paper>
              )}

              {clusters.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 3 }}>
                  <AlertTriangle size={32} style={{ color: '#fbbf24', margin: '0 auto 16px' }} />
                  <Typography variant="subtitle1" color="white" fontWeight="bold" gutterBottom>No Clusters Connected</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Connect to your first Kubernetes cluster by registering an in-cluster Kubi Agent.
                  </Typography>
                  <Button 
                    variant="contained" 
                    startIcon={<Plus size={16} />}
                    onClick={() => handleOpenDialog()}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    Register Cluster Agent
                  </Button>
                </Paper>
              ) : (
                <Stack spacing={2.5}>
                  {clusters.map((cluster) => {
                    const validation = validationStates[cluster.id] || { status: 'idle', message: 'Not checked' };
                    const cooldown = cooldownSeconds[cluster.id] || 0;
                    return (
                      <Paper 
                        key={cluster.id}
                        sx={{ 
                          p: 3, 
                          bgcolor: 'rgba(255,255,255,0.02)', 
                          border: '1px solid rgba(255,255,255,0.05)', 
                          borderRadius: 2.5,
                          transition: 'all 0.2s',
                          '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.03)',
                            borderColor: 'rgba(96, 165, 250, 0.2)'
                          }
                        }}
                      >
                        <Grid container alignItems="center" spacing={2}>
                          <Grid item xs={12} md={4}>
                            <Stack direction="row" spacing={2} alignItems="center">
                              <Box 
                                sx={{ 
                                  width: 8, 
                                  height: 8, 
                                  borderRadius: '50%',
                                  bgcolor: 
                                    cooldown > 0 ? '#f97316' :
                                    validation.status === 'success' ? '#10b981' :
                                    validation.status === 'error' ? '#ef4444' :
                                    validation.status === 'testing' ? '#fbbf24' : '#6b7280',
                                  boxShadow: 
                                    cooldown > 0 ? '0 0 10px #f97316' :
                                    validation.status === 'success' ? '0 0 10px #10b981' :
                                    validation.status === 'error' ? '0 0 10px #ef4444' :
                                    validation.status === 'testing' ? '0 0 10px #fbbf24' : 'none'
                                }} 
                              />
                              <Box>
                                <Typography variant="subtitle1" fontWeight="bold" color="white">{cluster.name}</Typography>
                                <Typography variant="caption" color="text.secondary">Scope: </Typography>
                                <Chip label="All Namespaces" size="small" color="primary" sx={{ height: 18, fontSize: '0.7rem', fontWeight: 600, bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }} />
                              </Box>
                            </Stack>
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', bgcolor: 'rgba(0,0,0,0.2)', px: 1.5, py: 0.5, borderRadius: 1.5, width: 'fit-content' }}>
                              {cluster.auth_type === 'kubeconfig' ? 'Kubeconfig File' :
                               cluster.auth_type === 'direct' ? cluster.api_endpoint :
                               cluster.agent_url}
                            </Typography>
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Stack direction="row" spacing={1.5} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} alignItems="center">
                              <Tooltip title={validation.message}>
                                <Chip 
                                  icon={
                                    cooldown > 0 ? <Timer size={12} className="animate-pulse" /> :
                                    validation.status === 'testing' ? <CircularProgress size={12} color="inherit" /> :
                                    validation.status === 'success' ? <Check size={12} /> :
                                    validation.status === 'error' ? <X size={12} /> : undefined
                                  }
                                  label={
                                    cooldown > 0 ? `Cooldown (${cooldown}s)` :
                                    validation.status === 'testing' ? 'Testing' :
                                    validation.status === 'success' ? 'Connected' :
                                    validation.status === 'error' ? 'Offline' : 'Idle'
                                  }
                                  size="small"
                                  color={
                                    cooldown > 0 ? 'warning' :
                                    validation.status === 'success' ? 'success' :
                                    validation.status === 'error' ? 'error' : 'default'
                                  }
                                  variant="outlined"
                                  sx={{ fontWeight: 'bold' }}
                                />
                              </Tooltip>
                              
                              <IconButton 
                                size="small" 
                                onClick={() => testClusterConnection(cluster.id, cluster)} 
                                color={cooldown > 0 ? 'default' : 'primary'}
                                disabled={cooldown > 0 || validation.status === 'testing'}
                              >
                                <RefreshCw size={16} className={validation.status === 'testing' ? "animate-spin" : ""} />
                              </IconButton>
                              
                              <IconButton size="small" onClick={() => handleOpenDialog(cluster)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                <Edit2 size={16} />
                              </IconButton>
                              
                              <IconButton size="small" onClick={() => handleDeleteCluster(cluster.id)} sx={{ color: 'rgba(239, 68, 68, 0.8)' }}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Stack>
                          </Grid>
                        </Grid>

                        {/* Connection Error Details Banner */}
                        {validation.status === 'error' && validation.message && validation.message !== 'Unreachable' && (
                          <div className="sre-error-banner">
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                              <AlertTriangle size={16} className="sre-error-icon" />
                              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <span className="sre-error-text">{validation.message}</span>
                              </Box>
                              <Button
                                size="small"
                                variant="outlined"
                                className="sre-btn-reconnect"
                                startIcon={<RefreshCw size={14} />}
                                onClick={() => testClusterConnection(cluster.id, cluster)}
                                disabled={cooldown > 0}
                              >
                                Reconnect
                              </Button>
                            </Stack>
                          </div>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Kubeconfig Credentials Registry */}
          <Card sx={{ bgcolor: '#0f172a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', mt: 4 }}>
            <CardContent sx={{ p: 4 }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                  <Lock size={20} />
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight="bold" color="white">Kubeconfig Registry</Typography>
                  <Typography variant="caption" color="text.secondary">Securely stored Kubernetes API configurations and server credentials.</Typography>
                </Box>
              </Stack>

              {clusters.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No cluster connections registered yet.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {clusters.map((cluster) => {
                    const hasConfig = !!cluster.kubeconfig;
                    const configSize = hasConfig ? (cluster.kubeconfig.length / 1024).toFixed(2) : '0';
                    return (
                      <Paper 
                        key={cluster.id + '-kubeconfig'}
                        sx={{ 
                          p: 2.5, 
                          bgcolor: 'rgba(255,255,255,0.01)', 
                          border: '1px solid rgba(255,255,255,0.05)', 
                          borderRadius: 2,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Server size={18} style={{ color: '#10b981' }} />
                          <Box>
                            <Typography variant="subtitle2" fontWeight="bold" color="white">{cluster.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {cluster.auth_type === 'kubeconfig' ? 'Connection Type: Kubeconfig YAML' :
                               cluster.auth_type === 'direct' ? `Connection Type: TLS API Server (${cluster.api_endpoint})` :
                               `Connection Type: Kubi Agent (${cluster.agent_url})`}
                            </Typography>
                          </Box>
                        </Stack>

                        <Stack direction="row" spacing={2} alignItems="center">
                          <Chip 
                            label={hasConfig ? `Configured (${configSize} KB)` : 'No Kubeconfig'}
                            size="small"
                            color={hasConfig ? 'success' : 'default'}
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                          />
                          {hasConfig && (
                            <>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                color="primary"
                                onClick={() => handleViewKubeconfig(cluster)}
                                sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.75rem', ml: 1.5 }}
                              >
                                View Config
                              </Button>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                color="secondary"
                                onClick={() => {
                                  navigator.clipboard.writeText(cluster.kubeconfig);
                                  alert('Kubeconfig copied to clipboard!');
                                }}
                                sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.75rem', ml: 1 }}
                              >
                                Copy
                              </Button>
                            </>
                          )}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Global settings */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={4}>
            {/* Quick Actions / Save Card */}
            <Card sx={{ bgcolor: '#0f172a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
              <CardContent sx={{ p: 4 }}>
                <Button 
                  fullWidth 
                  variant="contained" 
                  startIcon={saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  onClick={handleSaveAllSettings}
                  disabled={saving}
                  sx={{ py: 1.5, borderRadius: 2.5, fontWeight: 'bold', textTransform: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}
                >
                  {saving ? 'Saving changes...' : 'Save Configuration'}
                </Button>
                
                {saveStatus && (
                  <Typography variant="caption" color="success.main" sx={{ mt: 2, display: 'block', textAlign: 'center', fontWeight: 'bold' }}>
                    {saveStatus}
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Global Settings */}
            <Card sx={{ bgcolor: '#0f172a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
              <CardContent sx={{ p: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                  <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                    <Settings2 size={20} />
                  </Box>
                  <Typography variant="h6" fontWeight="bold" color="white">Orchestration Settings</Typography>
                </Stack>

                 <Stack spacing={3}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
                      Primary AI Model
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={geminiModel}
                        onChange={(e) => handleModelChange(e.target.value as string)}
                        sx={{
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          bgcolor: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: 2,
                          '& .MuiOutlinedInput-notchedOutline': {
                            border: 'none',
                          },
                          '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                          }
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              bgcolor: '#0f172a',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              boxShadow: '0 12px 24px -4px rgba(0,0,0,0.5)',
                              borderRadius: 2,
                              '& .MuiMenuItem-root': {
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                py: 1,
                                px: 2,
                                '&.Mui-selected': {
                                  bgcolor: 'rgba(96, 165, 250, 0.15)',
                                  color: '#60a5fa',
                                  fontWeight: 600,
                                  '&:hover': {
                                    bgcolor: 'rgba(96, 165, 250, 0.2)',
                                  }
                                },
                                '&:hover': {
                                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                                  color: 'white',
                                }
                              }
                            }
                          }
                        }}
                      >
                        <MenuItem value="models/gemini-2.5-flash">Gemini 2.5 Flash (Fast)</MenuItem>
                        <MenuItem value="models/gemini-2.5-pro">Gemini 2.5 Pro (Standard)</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash">Gemini 2.0 Flash</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash-001">Gemini 2.0 Flash (001)</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash-lite-001">Gemini 2.0 Flash Lite (001)</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="subtitle2" color="white" fontWeight="bold">Auto-Remediation</Typography>
                      <Typography variant="caption" color="text.secondary">Auto-fix safe failures.</Typography>
                    </Box>
                    <Switch 
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      color="primary"
                    />
                  </Paper>
                </Stack>
              </CardContent>
            </Card>

            {/* AI Core Validation */}
            <Card sx={{ bgcolor: '#0f172a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
              <CardContent sx={{ p: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                  <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4' }}>
                    <Zap size={20} />
                  </Box>
                  <Typography variant="h6" fontWeight="bold" color="white">AI Health Status</Typography>
                </Stack>

                <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                  <Stack spacing={2} sx={{ mb: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="rgba(255,255,255,0.6)" fontWeight="bold">Required LLM Model</Typography>
                      <Chip label="Ready" size="small" color="success" variant="outlined" sx={{ fontWeight: 'bold' }} />
                    </Stack>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={geminiModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        sx={{
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          bgcolor: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: 2,
                          '& .MuiOutlinedInput-notchedOutline': {
                            border: 'none',
                          },
                        }}
                      >
                        <MenuItem value="models/gemini-2.5-flash">Gemini 2.5 Flash (Fast)</MenuItem>
                        <MenuItem value="models/gemini-2.5-pro">Gemini 2.5 Pro (Standard)</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash">Gemini 2.0 Flash</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash-001">Gemini 2.0 Flash (001)</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash-lite-001">Gemini 2.0 Flash Lite (001)</MenuItem>
                        <MenuItem value="models/gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                  {apiStatus && (
                    <Typography variant="caption" color={apiStatus.success ? "success.main" : "error.main"} sx={{ mb: 2, display: 'block' }}>
                      {apiStatus.message}
                    </Typography>
                  )}
                  <Button 
                    fullWidth
                    size="small" 
                    variant="outlined" 
                    onClick={testApiConnection}
                    disabled={testingApi}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    {testingApi ? <Loader2 className="animate-spin" size={14} /> : "Test AI Model Connection"}
                  </Button>
                </Paper>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {/* Cluster Register/Edit Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: '#0f172a',
            backgroundImage: 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 3,
            p: 2,
            minWidth: { xs: '90%', sm: 540 }
          }
        }}
      >
        <DialogTitle sx={{ color: 'white', fontWeight: 'bold', px: 2, pb: 1 }}>
          {isEdit ? 'Edit Cluster Registration' : 'Register Cluster Agent'}
        </DialogTitle>
        <DialogContent sx={{ px: 2, py: 1 }}>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                CLUSTER NAME
              </Typography>
              <TextField 
                fullWidth 
                placeholder="e.g. Production Cluster"
                value={currentCluster.name}
                onChange={(e) => setCurrentCluster({ ...currentCluster, name: e.target.value })}
                sx={{ 
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: 'rgba(255,255,255,0.02)',
                    borderRadius: 2,
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  }
                }}
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                CONNECTION METHOD
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
                {[
                  { value: 'agent', label: 'Kubi In-Cluster Agent', desc: 'Secure Agent API' },
                  { value: 'kubeconfig', label: 'Direct Kubeconfig File', desc: 'Paste or Upload YAML' },
                  { value: 'direct', label: 'Kubernetes API TLS', desc: 'Server URL + Certs' }
                ].map((option) => {
                  const isSelected = currentCluster.auth_type === option.value;
                  return (
                    <Box
                      key={option.value}
                      onClick={() => setCurrentCluster({ ...currentCluster, auth_type: option.value })}
                      sx={{
                        flex: 1,
                        p: 1.5,
                        borderRadius: 2,
                        border: isSelected ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                        bgcolor: isSelected ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.01)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center',
                        '&:hover': {
                          bgcolor: isSelected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                          borderColor: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.15)'
                        }
                      }}
                    >
                      <Typography variant="body2" fontWeight="bold" color={isSelected ? 'white' : 'rgba(255,255,255,0.6)'}>
                        {option.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block', mt: 0.5 }}>
                        {option.desc}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            {currentCluster.auth_type === 'agent' && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                  KUBI AGENT ENDPOINT URL
                </Typography>
                <TextField 
                  fullWidth 
                  placeholder="e.g. http://10.96.0.45:8080"
                  value={currentCluster.agent_url}
                  onChange={(e) => setCurrentCluster({ ...currentCluster, agent_url: e.target.value })}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      color: 'white',
                      bgcolor: 'rgba(255,255,255,0.02)',
                      borderRadius: 2,
                      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                    }
                  }}
                />
              </Box>
            )}

            {currentCluster.auth_type === 'kubeconfig' && (
              <Stack spacing={2.5}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      KUBECONFIG YAML
                    </Typography>
                    <Button
                      component="label"
                      size="small"
                      variant="outlined"
                      sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                    >
                      Upload File
                      <input
                        type="file"
                        hidden
                        accept=".yaml,.yml,config"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            setCurrentCluster({
                              ...currentCluster,
                              kubeconfig: evt.target?.result as string
                            });
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </Button>
                  </Stack>
                  <TextField 
                    fullWidth 
                    multiline
                    rows={6}
                    placeholder={`apiVersion: v1\nkind: Config\nclusters:\n- name: minikube\n  cluster:\n    server: https://127.0.0.1:61847`}
                    value={currentCluster.kubeconfig || ''}
                    onChange={(e) => setCurrentCluster({ ...currentCluster, kubeconfig: e.target.value })}
                    sx={{ 
                      '& .MuiOutlinedInput-root': {
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      }
                    }}
                  />
                </Box>

                {/* Additional certificates section for Kubeconfig */}
                <Box sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  border: '1px dashed rgba(255,255,255,0.1)',
                  bgcolor: 'rgba(255,255,255,0.01)'
                }}>
                  <Typography variant="subtitle2" color="white" fontWeight="bold" sx={{ mb: 0.5 }}>
                    External Certificates & Keys (Optional)
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    If your Kubeconfig specifies file paths (e.g. <code>ca.crt</code>, <code>client.crt</code>, or <code>client.key</code>) rather than inline base64 data, upload them here to automatically patch them on the server.
                  </Typography>

                  <Stack spacing={2}>
                    <Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                          CA CERTIFICATE (CA.CRT)
                        </Typography>
                        <Button
                          component="label"
                          size="small"
                          variant="outlined"
                          sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                        >
                          Upload ca.crt
                          <input
                            type="file"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setCurrentCluster({
                                  ...currentCluster,
                                  ca_cert: evt.target?.result as string
                                });
                              };
                              reader.readAsText(file);
                            }}
                          />
                        </Button>
                      </Stack>
                      <TextField 
                        fullWidth 
                        multiline
                        rows={2}
                        placeholder="-----BEGIN CERTIFICATE-----\n..."
                        value={currentCluster.ca_cert || ''}
                        onChange={(e) => setCurrentCluster({ ...currentCluster, ca_cert: e.target.value })}
                        sx={{ 
                          '& .MuiOutlinedInput-root': {
                            color: 'white',
                            bgcolor: 'rgba(255,255,255,0.02)',
                            borderRadius: 2,
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                          }
                        }}
                      />
                    </Box>

                    <Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                          CLIENT CERTIFICATE (CLIENT.CRT)
                        </Typography>
                        <Button
                          component="label"
                          size="small"
                          variant="outlined"
                          sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                        >
                          Upload client.crt
                          <input
                            type="file"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setCurrentCluster({
                                  ...currentCluster,
                                  client_cert: evt.target?.result as string
                                });
                              };
                              reader.readAsText(file);
                            }}
                          />
                        </Button>
                      </Stack>
                      <TextField 
                        fullWidth 
                        multiline
                        rows={2}
                        placeholder="-----BEGIN CERTIFICATE-----\n..."
                        value={currentCluster.client_cert || ''}
                        onChange={(e) => setCurrentCluster({ ...currentCluster, client_cert: e.target.value })}
                        sx={{ 
                          '& .MuiOutlinedInput-root': {
                            color: 'white',
                            bgcolor: 'rgba(255,255,255,0.02)',
                            borderRadius: 2,
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                          }
                        }}
                      />
                    </Box>

                    <Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                          CLIENT KEY (CLIENT.KEY)
                        </Typography>
                        <Button
                          component="label"
                          size="small"
                          variant="outlined"
                          sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                        >
                          Upload client.key
                          <input
                            type="file"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setCurrentCluster({
                                  ...currentCluster,
                                  client_key: evt.target?.result as string
                                });
                              };
                              reader.readAsText(file);
                            }}
                          />
                        </Button>
                      </Stack>
                      <TextField 
                        fullWidth 
                        multiline
                        rows={2}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----\n..."
                        value={currentCluster.client_key || ''}
                        onChange={(e) => setCurrentCluster({ ...currentCluster, client_key: e.target.value })}
                        sx={{ 
                          '& .MuiOutlinedInput-root': {
                            color: 'white',
                            bgcolor: 'rgba(255,255,255,0.02)',
                            borderRadius: 2,
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                          }
                        }}
                      />
                    </Box>
                  </Stack>
                </Box>
              </Stack>
            )}

            {currentCluster.auth_type === 'direct' && (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                    KUBERNETES API SERVER ENDPOINT
                  </Typography>
                  <TextField 
                    fullWidth 
                    placeholder="e.g. https://192.168.49.2:8443"
                    value={currentCluster.api_endpoint || ''}
                    onChange={(e) => setCurrentCluster({ ...currentCluster, api_endpoint: e.target.value })}
                    sx={{ 
                      '& .MuiOutlinedInput-root': {
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      }
                    }}
                  />
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      CA CERTIFICATE (CA.CRT)
                    </Typography>
                    <Button
                      component="label"
                      size="small"
                      variant="outlined"
                      sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                    >
                      Upload ca.crt
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            setCurrentCluster({
                              ...currentCluster,
                              ca_cert: evt.target?.result as string
                            });
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </Button>
                  </Stack>
                  <TextField 
                    fullWidth 
                    multiline
                    rows={3}
                    placeholder="-----BEGIN CERTIFICATE-----\n..."
                    value={currentCluster.ca_cert || ''}
                    onChange={(e) => setCurrentCluster({ ...currentCluster, ca_cert: e.target.value })}
                    sx={{ 
                      '& .MuiOutlinedInput-root': {
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      }
                    }}
                  />
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      CLIENT CERTIFICATE (CLIENT.CRT)
                    </Typography>
                    <Button
                      component="label"
                      size="small"
                      variant="outlined"
                      sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                    >
                      Upload client.crt
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            setCurrentCluster({
                              ...currentCluster,
                              client_cert: evt.target?.result as string
                            });
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </Button>
                  </Stack>
                  <TextField 
                    fullWidth 
                    multiline
                    rows={3}
                    placeholder="-----BEGIN CERTIFICATE-----\n..."
                    value={currentCluster.client_cert || ''}
                    onChange={(e) => setCurrentCluster({ ...currentCluster, client_cert: e.target.value })}
                    sx={{ 
                      '& .MuiOutlinedInput-root': {
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      }
                    }}
                  />
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      CLIENT KEY (CLIENT.KEY)
                    </Typography>
                    <Button
                      component="label"
                      size="small"
                      variant="outlined"
                      sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.7rem', borderRadius: 1.5 }}
                    >
                      Upload client.key
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            setCurrentCluster({
                              ...currentCluster,
                              client_key: evt.target?.result as string
                            });
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </Button>
                  </Stack>
                  <TextField 
                    fullWidth 
                    multiline
                    rows={3}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----\n..."
                    value={currentCluster.client_key || ''}
                    onChange={(e) => setCurrentCluster({ ...currentCluster, client_key: e.target.value })}
                    sx={{ 
                      '& .MuiOutlinedInput-root': {
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      }
                    }}
                  />
                </Box>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, pt: 3 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button onClick={handleSaveCluster} variant="contained" sx={{ textTransform: 'none', borderRadius: 2 }}>
            Save Cluster
          </Button>
        </DialogActions>
      </Dialog>

      {/* Secure Kubeconfig Preview Dialog */}
      <Dialog 
        open={viewDialogOpen} 
        onClose={() => setViewDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: '#0f172a',
            backgroundImage: 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 3,
            p: 2,
            minWidth: { xs: '90%', sm: 600 }
          }
        }}
      >
        <DialogTitle sx={{ color: 'white', fontWeight: 'bold', px: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Kubeconfig: {viewingCluster?.name}</span>
          <IconButton size="small" onClick={() => setViewDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 2, py: 1 }}>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Below is the raw YAML kubeconfig stored for this cluster connection.
            </Typography>
            <Paper 
              sx={{ 
                p: 2, 
                bgcolor: 'rgba(0,0,0,0.3)', 
                border: '1px solid rgba(255,255,255,0.05)', 
                borderRadius: 2,
                maxHeight: 300,
                overflowY: 'auto'
              }}
            >
              <Typography 
                component="pre" 
                sx={{ 
                  fontFamily: 'monospace', 
                  fontSize: '0.8rem', 
                  color: '#60a5fa', 
                  whiteSpace: 'pre-wrap',
                  m: 0 
                }}
              >
                {viewingCluster?.kubeconfig || ''}
              </Typography>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pt: 3 }}>
          <Button 
            onClick={() => {
              if (viewingCluster?.kubeconfig) {
                navigator.clipboard.writeText(viewingCluster.kubeconfig);
                alert('Kubeconfig copied to clipboard!');
              }
            }}
            variant="contained" 
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Copy to Clipboard
          </Button>
          <Button onClick={() => setViewDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

