'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Code, 
  Terminal, 
  Copy, 
  Check, 
  Layers, 
  Database, 
  ShieldAlert, 
  HelpCircle, 
  RefreshCw, 
  FileText, 
  ArrowLeft,
  Cpu,
  Info
} from 'lucide-react';
import {
  Box,
  CardContent,
  Chip,
  Typography,
  Container,
  Paper,
  Stack,
  Divider,
  Button,
  Grid,
  CircularProgress,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Alert,
  IconButton,
  Snackbar
} from '@mui/material';
import Link from 'next/link';
import { kubiApi } from '@/lib/api';
import { SreCard, SreConsole } from '@/components/ui/sre-layout';

export default function IngestionHubPage() {
  const [loading, setLoading] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [activeTab, setActiveTab] = useState(0);
  const [copiedText, setCopiedText] = useState(false);
  
  // Dynamic Anomaly Templates State
  const [templates, setTemplates] = useState<any[]>([]);
  
  // Sandbox State
  const [podName, setPodName] = useState('kubi-payment-service-58fb89d-7hjkl');
  const [namespace, setNamespace] = useState('default');
  const [alertType, setAlertType] = useState('CrashLoopBackOff');
  const [message, setMessage] = useState('NullPointerException in CoreProcessor loop');
  const [rawLogs, setRawLogs] = useState('');
  const [useV1, setUseV1] = useState(true);
  
  // Response simulation telemetry
  const [simResponse, setSimResponse] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  
  // Ingest audit trail
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Authentication Dev Token Helper
  const [devToken, setDevToken] = useState('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dev-sre-placeholder');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Fetch current namespaces
        const resources = await kubiApi.getResources();
        if (resources?.namespaces) {
          setNamespaces(resources.namespaces);
          if (resources.namespaces.length > 0 && !resources.namespaces.includes(namespace)) {
            setNamespace(resources.namespaces[0]);
          }
        }
        
        // Fetch dynamic anomaly templates from the backend API
        try {
          const tempRes = await kubiApi.getAnomalyTemplates();
          if (tempRes && tempRes.templates) {
            setTemplates(tempRes.templates);
            const first = tempRes.templates[0];
            if (first) {
              setAlertType(first.type);
              setPodName(first.pod_name);
              setMessage(first.message);
              setRawLogs(first.raw_logs);
            }
          }
        } catch (e) {
          console.error("Failed to fetch backend anomaly templates:", e);
        }
        
        // Fetch active JWT dev token to pre-inject into copy paste guides
        const tokenRes = await kubiApi.getDevToken().catch(() => null);
        if (tokenRes && tokenRes.token) {
          setDevToken(tokenRes.token);
        } else {
          // Fallback to active session token
          const sessionToken = localStorage.getItem('access_token');
          if (sessionToken) {
            setDevToken(sessionToken);
          }
        }
      } catch (err) {
        console.error("Failed to load metadata:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await kubiApi.getIncidents();
      // Filter out only recent incidents or display last 5
      const list = res.incidents || [];
      // Sort and slice
      const sorted = [...list].sort((a: any, b: any) => {
        const dateA = new Date(a.first_detected || a.created_at || 0).getTime();
        const dateB = new Date(b.first_detected || b.created_at || 0).getTime();
        return dateB - dateA;
      });
      setHistory(sorted.slice(0, 5));
    } catch (err) {
      console.error("Failed to fetch ingest history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAlertTypeChange = (type: string) => {
    setAlertType(type);
    const template = templates.find((t) => t.type === type);
    if (template) {
      setRawLogs(template.raw_logs || "");
      setMessage(template.message || "");
      setPodName(template.pod_name || "");
    }
  };

  const triggerSimulation = async () => {
    try {
      setSimLoading(true);
      setSimResponse(null);
      
      const payload = {
        pod_name: podName,
        cluster_id: localStorage.getItem('active_cluster_id') || 'local-minikube',
        namespace: namespace,
        type: alertType,
        message: message,
        raw_logs: rawLogs,
        status: 'active'
      };

      const res = await kubiApi.ingestIncidentSim(payload, useV1);
      setSimResponse(res);
      
      // Refresh delivery trail
      await fetchHistory();
    } catch (err: any) {
      console.error("Simulation dispatch failed:", err);
      setSimResponse({
        error: true,
        status: 'failed',
        message: err.message || "Failed to contact ingestion endpoint."
      });
    } finally {
      setSimLoading(false);
    }
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
  };

  // Integration snippets precompiled with user tokens
  const curlCode = `curl -X POST \\
  http://kubi.kontactless.in/api${useV1 ? '/v1' : ''}/incidents/ingest \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${devToken}' \\
  -d '{
    "pod_name": "${podName}",
    "namespace": "${namespace}",
    "cluster_id": "production-cluster-01",
    "type": "${alertType}",
    "message": "${message}",
    "raw_logs": ${JSON.stringify(rawLogs)},
    "status": "active"
  }'`;

  const alertmanagerCode = `route:
  receiver: 'kubi-webhook'
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
- name: 'kubi-webhook'
  webhook_configs:
  - url: 'http://kubi.kontactless.in/api${useV1 ? '/v1' : ''}/incidents/ingest'
    http_config:
      bearer_token: '${devToken}'
    send_resolved: false`;

  const pythonAgentCode = `import requests

API_URL = "http://kubi.kontactless.in/api${useV1 ? '/v1' : ''}/incidents/ingest"
TOKEN = "${devToken}"

payload = {
    "pod_name": "${podName}",
    "namespace": "${namespace}",
    "cluster_id": "production-cluster-01",
    "type": "${alertType}",
    "message": "${message}",
    "raw_logs": """${rawLogs}""",
    "status": "active"
}

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}"
}

try:
    response = requests.post(API_URL, json=payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Connection failed: {e}")`;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header breadcrumb */}
      <Box sx={{ mb: 4 }}>
        <Button 
          component={Link} 
          href="/incidents"
          startIcon={<ArrowLeft size={16} />}
          sx={{ mb: 2, textTransform: 'none', color: 'text.secondary', '&:hover': { color: 'white' } }}
        >
          Back to Incidents
        </Button>
        <Typography variant="h4" fontWeight="bold" color="white" gutterBottom>
          Webhook Ingestion & Simulation Hub
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Simulate external incidents, wire up Prometheus Alertmanager receivers, and monitor API delivery audit trails.
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {/* LEFT COLUMN: SIMULATOR SANDBOX */}
        <Grid item xs={12} lg={6}>
          <SreCard sx={{ height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight="bold" color="white" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  🧪 Alert Simulator Sandbox
                </Typography>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <Select
                    value={useV1 ? 'v1' : 'legacy'}
                    onChange={(e) => setUseV1(e.target.value === 'v1')}
                    sx={{ 
                      color: 'white', 
                      fontSize: '0.8rem',
                      height: 30,
                      bgcolor: 'rgba(255,255,255,0.05)',
                      borderRadius: 1.5,
                      '& fieldset': { border: 'none' } 
                    }}
                  >
                    <MenuItem value="v1">v1 API route</MenuItem>
                    <MenuItem value="legacy">Legacy route</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              
              <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

              <Stack spacing={3}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="select-type-label" sx={{ color: 'text.secondary' }}>Anomaly Type</InputLabel>
                      <Select
                        labelId="select-type-label"
                        value={alertType}
                        label="Anomaly Type"
                        onChange={(e) => handleAlertTypeChange(e.target.value)}
                        sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)', color: 'white' }}
                      >
                        {templates.map((t) => (
                          <MenuItem key={t.type} value={t.type}>{t.type}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="select-ns-label" sx={{ color: 'text.secondary' }}>Target Namespace</InputLabel>
                      <Select
                        labelId="select-ns-label"
                        value={namespace}
                        label="Target Namespace"
                        onChange={(e) => setNamespace(e.target.value)}
                        sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)', color: 'white' }}
                      >
                        {namespaces.map((ns) => (
                          <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Alert severity="info" sx={{ bgcolor: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', color: '#a5b4fc', borderRadius: 2 }}>
                  <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', mb: 0.5 }}>
                    Anomaly Description:
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    {templates.find((t) => t.type === alertType)?.description || "Loading anomaly details..."}
                  </Typography>
                </Alert>

                <TextField
                  fullWidth
                  size="small"
                  label="Simulated Pod Name"
                  value={podName}
                  onChange={(e) => setPodName(e.target.value)}
                  variant="outlined"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)' } }}
                />

                <TextField
                  fullWidth
                  size="small"
                  label="Diagnostic Message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  variant="outlined"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)' } }}
                />

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                    Raw Container Logs (Simulated Core Traces)
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={6}
                    value={rawLogs}
                    onChange={(e) => setRawLogs(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        color: '#60a5fa',
                        borderRadius: 2,
                        bgcolor: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.05)'
                      }
                    }}
                  />
                </Box>

                <Button
                  fullWidth
                  variant="contained"
                  onClick={triggerSimulation}
                  disabled={simLoading || !podName.trim()}
                  startIcon={simLoading ? <CircularProgress size={18} color="inherit" /> : <Play size={18} />}
                  sx={{
                    height: 48,
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, #6366f1 0%, #a78bfa 100%)',
                    boxShadow: '0 8px 16px rgba(99, 102, 241, 0.25)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #4f46e5 0%, #8b5cf6 100%)',
                    }
                  }}
                >
                  {simLoading ? 'Injecting Mock Alert...' : 'Inject Simulated Incident'}
                </Button>

                {/* Simulated Server Response Monospace */}
                {simResponse && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                      Server API Response:
                    </Typography>
                    <SreConsole sx={{ p: 2, border: simResponse.error ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)' }}>
                      <span style={{ color: simResponse.error ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                        HTTP STATUS {simResponse.error ? '500 ERROR' : '200 OK'}
                      </span>
                      <pre style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap', color: '#e2e8f0', fontSize: '0.75rem' }}>
                        {JSON.stringify(simResponse, null, 2)}
                      </pre>
                    </SreConsole>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </SreCard>
        </Grid>

        {/* RIGHT COLUMN: INTEGRATION GUIDES */}
        <Grid item xs={12} lg={6}>
          <SreCard sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.05)', px: 4, pt: 3 }}>
              <Typography variant="h6" fontWeight="bold" color="white" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                🔌 Webhook Integration Guides
              </Typography>
              <Tabs 
                value={activeTab} 
                onChange={(_e, v) => setActiveTab(v)}
                sx={{
                  '& .MuiTab-root': { py: 1.5, textTransform: 'none', fontWeight: 'bold', fontSize: '0.85rem' }
                }}
              >
                <Tab icon={<Layers size={14} />} iconPosition="start" label="Alertmanager" />
                <Tab icon={<Code size={14} />} iconPosition="start" label="Curl API" />
                <Tab icon={<Terminal size={14} />} iconPosition="start" label="Custom Python" />
              </Tabs>
            </Box>

            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(0,0,0,0.15)' }}>
              {/* TAB 0: ALERTMANAGER */}
              {activeTab === 0 && (
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" color="white" gutterBottom>
                      Prometheus Alertmanager Webhook Receiver
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                      Configure your Alertmanager block to send visual alerts and trigger Kubi's autonomous postmortem pipelines instantly.
                    </Typography>
                  </Box>
                  
                  <Box sx={{ position: 'relative' }}>
                    <IconButton 
                      onClick={() => handleCopyCode(alertmanagerCode)}
                      sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary', '&:hover': { color: 'white' }, zIndex: 1 }}
                    >
                      <Copy size={16} />
                    </IconButton>
                    <SreConsole sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: '#a78bfa' }}>
                        {alertmanagerCode}
                      </pre>
                    </SreConsole>
                  </Box>
                  <Alert severity="warning" sx={{ bgcolor: 'rgba(217, 119, 6, 0.05)', border: '1px solid rgba(217, 119, 6, 0.15)', color: '#fcd34d', borderRadius: 2 }}>
                    Ensure that the `bearer_token` matches your secret SRE credentials. Keep this file securely encrypted.
                  </Alert>
                </Stack>
              )}

              {/* TAB 1: CURL CLI */}
              {activeTab === 1 && (
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" color="white" gutterBottom>
                      Trigger via Shell command line
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                      Manually test connection pipelines or trigger custom external SRE alerts using raw `curl` scripts.
                    </Typography>
                  </Box>

                  <Box sx={{ position: 'relative' }}>
                    <IconButton 
                      onClick={() => handleCopyCode(curlCode)}
                      sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary', '&:hover': { color: 'white' }, zIndex: 1 }}
                    >
                      <Copy size={16} />
                    </IconButton>
                    <SreConsole sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: '#60a5fa' }}>
                        {curlCode}
                      </pre>
                    </SreConsole>
                  </Box>
                </Stack>
              )}

              {/* TAB 2: PYTHON CUSTOM AGENT */}
              {activeTab === 2 && (
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" color="white" gutterBottom>
                      Autonomous Custom Agent Script
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                      Integrate telemetry pipelines directly in your custom application watchers using our Python bindings.
                    </Typography>
                  </Box>

                  <Box sx={{ position: 'relative' }}>
                    <IconButton 
                      onClick={() => handleCopyCode(pythonAgentCode)}
                      sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary', '&:hover': { color: 'white' }, zIndex: 1 }}
                    >
                      <Copy size={16} />
                    </IconButton>
                    <SreConsole sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: '#34d399' }}>
                        {pythonAgentCode}
                      </pre>
                    </SreConsole>
                  </Box>
                </Stack>
              )}
            </Box>
          </SreCard>
        </Grid>
      </Grid>

      {/* BOTTOM PANE: DELIVERY AUDIT TRAIL */}
      <Box sx={{ mt: 5 }}>
        <SreCard>
          <CardContent sx={{ p: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight="bold" color="white" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  📜 Webhook Delivery Log (Live Audit Trail)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Real-time processed incident alerts and webhook dispatches received by the API layer.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                size="small"
                onClick={fetchHistory}
                disabled={historyLoading}
                startIcon={<RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />}
                sx={{ textTransform: 'none', borderRadius: 2, borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              >
                Refresh Log
              </Button>
            </Stack>

            <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

            {historyLoading && history.length === 0 ? (
              <Box sx={{ py: 6, textDecoration: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : history.length === 0 ? (
              <Box sx={{ py: 4, textDecoration: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No alerts ingested yet. Complete a simulator dispatch to generate telemetry.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {history.map((item, idx) => (
                  <Paper
                    key={item.id || item._id || idx}
                    sx={{
                      p: 2.5,
                      bgcolor: 'rgba(255,255,255,0.01)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 2,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 2
                    }}
                  >
                    <Stack direction="row" spacing={2.5} alignItems="center">
                      <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Database size={16} style={{ color: '#6366f1' }} />
                      </Box>
                      <Box>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Typography variant="body2" fontWeight="bold" color="white" sx={{ fontFamily: 'monospace' }}>
                            {item.pod?.namespace || item.namespace || 'default'}/{item.pod?.name || item.pod_name || 'N/A'}
                          </Typography>
                          <Chip 
                            label={(item.type || 'CrashLoopBackOff').toUpperCase()} 
                            size="small" 
                            color={item.type === 'CrashLoopBackOff' ? 'error' : item.type === 'OutOfMemory' ? 'warning' : 'primary'}
                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 'bold' }} 
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Payload Msg: {item.message || 'No additional logs captured.'}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack alignItems="flex-end" spacing={0.5}>
                      <Chip 
                        icon={<Check size={12} />} 
                        label="SUCCESSFULLY INGESTED" 
                        size="small" 
                        color="success" 
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.65rem', fontWeight: 'bold' }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                        {item.first_detected ? new Date(item.first_detected).toLocaleTimeString() : 'Just now'}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </CardContent>
        </SreCard>
      </Box>

      <Snackbar
        open={copiedText}
        autoHideDuration={2000}
        onClose={() => setCopiedText(false)}
        message="Code copied to clipboard successfully!"
      />
    </Container>
  );
}
