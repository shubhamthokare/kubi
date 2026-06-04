'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Cpu, HardDrive, RefreshCw, Layers, ShieldAlert, CheckCircle, AlertTriangle, Eye, Search } from 'lucide-react';
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
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Tabs,
  Tab,
  FormControl,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { kubiApi, getWsUrl } from '@/lib/api';
import { SreCard, SreConsole } from '@/components/ui/sre-layout';

export default function LogsPage() {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<{ namespaces: string[]; deployments: any[]; pods: any[] }>({
    namespaces: [],
    deployments: [],
    pods: [],
  });

  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null);
  const [expandedWorkload, setExpandedWorkload] = useState<string | null>(null);
  const [selectedPod, setSelectedPod] = useState<string | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default');
  const [activeTab, setActiveTab] = useState(0);

  // Pod Diagnostics Data
  const [podLogs, setPodLogs] = useState<string[]>([]);
  const [podYaml, setPodYaml] = useState<string>('');
  const [yamlLoading, setYamlLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Elasticsearch Archive Search State
  const [esSearchQuery, setEsSearchQuery] = useState('');
  const [esSearchResults, setEsSearchResults] = useState<any[]>([]);
  const [esSearchLoading, setEsSearchLoading] = useState(false);
  const [esSearchIndex, setEsSearchIndex] = useState('logs');

  const handleEsSearch = async () => {
    if (!esSearchQuery.trim()) return;
    try {
      setEsSearchLoading(true);
      setEsSearchResults([]);
      const res = await kubiApi.searchLogs(esSearchQuery, esSearchIndex);
      setEsSearchResults(res.results || []);
    } catch (err: any) {
      console.error("Failed to query ES logs search:", err);
      alert(err.message || "Failed to search logs archive.");
    } finally {
      setEsSearchLoading(false);
    }
  };

  // WebSocket Ref
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const fetchResources = async () => {
    try {
      const res = await kubiApi.getResources();
      setResources(res || { namespaces: [], deployments: [], pods: [] });
      if (res?.namespaces?.length > 0) {
        setExpandedNamespace(res.namespaces[0]);
      }
    } catch (error) {
      console.error('Failed to fetch workloads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
    return () => {
      disconnectWs();
    };
  }, []);

  // Autoscroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [podLogs]);

  const disconnectWs = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
  };

  const connectWs = (podName: string, ns: string) => {
    disconnectWs();
    setPodLogs([]);

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
    if (!token) {
      setPodLogs(['Error: Authorization credentials missing. Please log in again.']);
      return;
    }

    try {
      const wsUrl = getWsUrl(`/ws/logs?pod=${podName}&namespace=${ns}&token=${encodeURIComponent(token)}&tail=150`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setPodLogs([`[System] Connected to log tail stream for ${ns}/${podName}...\n`]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'eof') {
            setPodLogs((prev) => [...prev, `\n[System] ${data.message}`]);
            disconnectWs();
          } else if (data.type === 'error') {
            setPodLogs((prev) => [...prev, `\n[Error] ${data.message}`]);
            disconnectWs();
          }
        } catch {
          // Regular log line string frame
          setPodLogs((prev) => [...prev, event.data]);
        }
      };

      ws.onerror = (err) => {
        console.error('WS Error:', err);
        setPodLogs((prev) => [...prev, '\n[System Error] Log stream disconnected due to socket error.']);
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
      };
    } catch (e: any) {
      setPodLogs([`Error establishing live connection: ${e.message}`]);
    }
  };

  const loadPodYaml = async (podName: string, ns: string) => {
    setYamlLoading(true);
    setPodYaml('');
    try {
      const res = await kubiApi.getPodYaml(ns, podName);
      setPodYaml(res.yaml || '');
    } catch (err: any) {
      setPodYaml(`# Failed to retrieve pod specifications YAML:\n# ${err.message}`);
    } finally {
      setYamlLoading(false);
    }
  };

  const handlePodSelect = (podName: string, ns: string) => {
    setSelectedPod(podName);
    setSelectedNamespace(ns);
    if (activeTab === 0) {
      connectWs(podName, ns);
    } else if (activeTab === 1) {
      disconnectWs();
      loadPodYaml(podName, ns);
    } else {
      disconnectWs();
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    if (selectedPod) {
      if (newValue === 0) {
        connectWs(selectedPod, selectedNamespace);
      } else {
        disconnectWs();
        if (newValue === 1) {
          loadPodYaml(selectedPod, selectedNamespace);
        }
      }
    } else {
      disconnectWs();
    }
  };

  // Group pods by namespace and deployment using useMemo for high rendering performance
  const groupedDeployments = React.useMemo(() => {
    const maps: Record<string, any[]> = {};
    resources.namespaces.forEach((ns) => {
      maps[ns] = resources.deployments.filter((d) => d.namespace === ns);
    });
    return maps;
  }, [resources.namespaces, resources.deployments]);

  const groupedPodsByDeployment = React.useMemo(() => {
    const maps: Record<string, any[]> = {};
    resources.deployments.forEach((dep) => {
      maps[`${dep.namespace}/${dep.name}`] = resources.pods.filter(
        (p) => p.namespace === dep.namespace && p.name.startsWith(dep.name)
      );
    });
    return maps;
  }, [resources.deployments, resources.pods]);

  const groupedStandalonePods = React.useMemo(() => {
    const maps: Record<string, any[]> = {};
    resources.namespaces.forEach((ns) => {
      const depNames = (groupedDeployments[ns] || []).map((d) => d.name);
      maps[ns] = resources.pods.filter((p) => {
        if (p.namespace !== ns) return false;
        return !depNames.some((dName) => p.name.startsWith(dName));
      });
    });
    return maps;
  }, [resources.namespaces, resources.pods, groupedDeployments]);

  return (
    <Container maxWidth={false} disableGutters sx={{ py: 0 }}>
      <Box className="ops-page-header">
        <Typography variant="h4" fontWeight={850} color="white" gutterBottom sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}>
          Pod Log Explorer & Diagnostics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Inspect cluster resources, describe pod specs, and tail live logs in real-time
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <CircularProgress color="primary" size={48} />
        </Box>
      ) : (
        <Grid container spacing={2.5}>
          {/* LEFT: WORKLOADS TREE */}
          <Grid item xs={12} md={4} lg={3.5}>
            <SreCard sx={{ height: { xs: 360, md: 'calc(100vh - 250px)' }, minHeight: 520, overflowY: 'auto' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" color="white" sx={{ mb: 2, px: 1, textTransform: 'uppercase', letterSpacing: 0 }}>
                  Workloads Tree
                </Typography>
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                <List component="nav" disablePadding>
                  {resources.namespaces.map((ns) => {
                    const isNsExpanded = expandedNamespace === ns;
                    const nsDeps = groupedDeployments[ns] || [];
                    const standalonePods = groupedStandalonePods[ns] || [];

                    return (
                      <Box key={ns} sx={{ mb: 1 }}>
                        <ListItemButton
                          onClick={() => setExpandedNamespace(isNsExpanded ? null : ns)}
                          sx={{ borderRadius: 1, bgcolor: isNsExpanded ? 'rgba(96, 165, 250, 0.08)' : 'transparent', py: 1 }}
                        >
                          <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>
                            <Layers size={18} />
                          </ListItemIcon>
                          <ListItemText primary={ns} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 600, color: isNsExpanded ? 'primary.main' : 'white' }} />
                          {isNsExpanded ? <ExpandLess sx={{ color: 'rgba(255,255,255,0.5)' }} /> : <ExpandMore sx={{ color: 'rgba(255,255,255,0.5)' }} />}
                        </ListItemButton>

                        <Collapse in={isNsExpanded} timeout="auto" unmountOnExit>
                          <List component="div" disablePadding sx={{ pl: 2, mt: 0.5 }}>
                            {/* Deployments inside namespace */}
                            {nsDeps.map((dep) => {
                              const isDepExpanded = expandedWorkload === dep.name;
                              const depPods = groupedPodsByDeployment[`${ns}/${dep.name}`] || [];

                              return (
                                <Box key={dep.name} sx={{ mt: 0.5 }}>
                                  <ListItemButton
                                    onClick={() => setExpandedWorkload(isDepExpanded ? null : dep.name)}
                                    sx={{ borderRadius: 1, py: 0.75 }}
                                  >
                                    <ListItemIcon sx={{ minWidth: 32, color: 'secondary.main' }}>
                                      <Cpu size={16} />
                                    </ListItemIcon>
                                    <ListItemText primary={dep.name} primaryTypographyProps={{ fontSize: '0.85rem', color: 'white' }} />
                                    {isDepExpanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
                                  </ListItemButton>

                                  <Collapse in={isDepExpanded} timeout="auto" unmountOnExit>
                                    <List component="div" disablePadding sx={{ pl: 3 }}>
                                      {depPods.map((pod) => (
                                        <ListItemButton
                                          key={pod.name}
                                          selected={selectedPod === pod.name}
                                          onClick={() => handlePodSelect(pod.name, ns)}
                                          sx={{
                                            borderRadius: 1,
                                            py: 0.6,
                                            my: 0.2,
                                            '&.Mui-selected': { bgcolor: 'rgba(96, 165, 250, 0.15)', color: 'white' },
                                          }}
                                        >
                                          <ListItemIcon sx={{ minWidth: 24 }}>
                                            <div className="pod-indicator-active" />
                                          </ListItemIcon>
                                          <ListItemText primary={pod.name} primaryTypographyProps={{ fontSize: '0.8rem', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden' }} />
                                        </ListItemButton>
                                      ))}
                                      {depPods.length === 0 && (
                                        <Typography variant="caption" sx={{ pl: 3, display: 'block', color: 'text.secondary', py: 0.5 }}>
                                          No active pods found
                                        </Typography>
                                      )}
                                    </List>
                                  </Collapse>
                                </Box>
                              );
                            })}

                            {/* Standalone Pods inside namespace */}
                            {standalonePods.length > 0 && (
                              <Box sx={{ mt: 0.5 }}>
                                <ListItemButton
                                  onClick={() => setExpandedWorkload(expandedWorkload === `${ns}-standalone` ? null : `${ns}-standalone`)}
                                  sx={{ borderRadius: 1, py: 0.75 }}
                                >
                                  <ListItemIcon sx={{ minWidth: 32, color: 'warning.main' }}>
                                    <HardDrive size={16} />
                                  </ListItemIcon>
                                  <ListItemText primary="Standalone Pods" primaryTypographyProps={{ fontSize: '0.85rem', color: 'white' }} />
                                  {expandedWorkload === `${ns}-standalone` ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
                                </ListItemButton>

                                <Collapse in={expandedWorkload === `${ns}-standalone`} timeout="auto" unmountOnExit>
                                  <List component="div" disablePadding sx={{ pl: 3 }}>
                                    {standalonePods.map((pod) => (
                                      <ListItemButton
                                        key={pod.name}
                                        selected={selectedPod === pod.name}
                                        onClick={() => handlePodSelect(pod.name, ns)}
                                        sx={{
                                            borderRadius: 1,
                                          py: 0.6,
                                          my: 0.2,
                                          '&.Mui-selected': { bgcolor: 'rgba(96, 165, 250, 0.15)', color: 'white' },
                                        }}
                                      >
                                        <ListItemIcon sx={{ minWidth: 24 }}>
                                          <div className="pod-indicator-standalone" />
                                        </ListItemIcon>
                                        <ListItemText primary={pod.name} primaryTypographyProps={{ fontSize: '0.8rem', fontFamily: 'monospace' }} />
                                      </ListItemButton>
                                    ))}
                                  </List>
                                </Collapse>
                              </Box>
                            )}
                          </List>
                        </Collapse>
                      </Box>
                    );
                  })}
                </List>
              </CardContent>
            </SreCard>
          </Grid>

          {/* RIGHT: DIAGNOSTICS & LOG STREAMING PANEL */}
          <Grid item xs={12} md={8} lg={8.5}>
            {selectedPod ? (
              <SreCard sx={{ height: { xs: 560, md: 'calc(100vh - 250px)' }, minHeight: 520, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.05)', px: 3, pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
                      <Typography variant="h6" fontWeight="bold" color="white" sx={{ fontFamily: 'monospace' }}>
                        {selectedPod}
                      </Typography>
                      <Chip label={selectedNamespace} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 'bold' }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Pod telemetry status - switched context
                    </Typography>
                  </Box>
                  <Tabs value={activeTab} onChange={handleTabChange} sx={{ '& .MuiTab-root': { py: 2, textTransform: 'none', fontWeight: 'bold' } }}>
                    <Tab icon={<Terminal size={16} />} iconPosition="start" label="Live Logs Console" />
                    <Tab icon={<Eye size={16} />} iconPosition="start" label="YAML Manifest" />
                    <Tab icon={<Search size={16} />} iconPosition="start" label="Search Archive (ES)" />
                  </Tabs>
                </Box>
 
                {/* TABCONTENT 0: LIVE LOGS */}
                {activeTab === 0 && (
                  <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', bgcolor: '#020617', overflow: 'hidden', position: 'relative' }}>
                    {/* Log actions header */}
                    <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.02)' }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <div className={wsConnected ? 'ws-status-active' : 'ws-status-inactive'} />
                        <Typography variant="caption" color={wsConnected ? 'success.main' : 'error.main'} fontWeight="bold">
                          {wsConnected ? 'LIVE STREAM ACTIVE' : 'STREAM DISCONNECTED'}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1.5}>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => setPodLogs([])}
                          sx={{ color: 'text.secondary', textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          Clear Output
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<RefreshCw size={12} className={wsConnected ? 'animate-spin' : ''} />}
                          onClick={() => connectWs(selectedPod, selectedNamespace)}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
                        >
                          Reconnect
                        </Button>
                      </Stack>
                    </Box>
 
                    {/* Console body */}
                    <SreConsole sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                      <Stack spacing={0.5}>
                        {podLogs.map((line, idx) => (
                          <Typography
                            key={idx}
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              whiteSpace: 'pre-wrap',
                              color: line.startsWith('[stderr]') ? '#f87171' : line.startsWith('[Error]') ? '#ef4444' : line.startsWith('[System]') ? '#38bdf8' : '#e2e8f0',
                            }}
                          >
                            {line}
                          </Typography>
                        ))}
                      </Stack>
                      <div ref={logEndRef} />
                    </SreConsole>
                  </Box>
                )}
 
                {/* TABCONTENT 1: YAML SPEC DESCRIBE */}
                {activeTab === 1 && (
                  <Box sx={{ flexGrow: 1, bgcolor: '#020617', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {yamlLoading ? (
                      <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <CircularProgress color="primary" />
                      </Box>
                    ) : (
                      <SreConsole sx={{ flexGrow: 1, p: 3, whiteSpace: 'pre-wrap', color: '#38bdf8' }}>
                        {podYaml || '# No manifest retrieved.'}
                      </SreConsole>
                    )}
                  </Box>
                )}

                {/* TABCONTENT 2: ELASTICSEARCH SEARCH ARCHIVE */}
                {activeTab === 2 && (
                  <Box sx={{ flexGrow: 1, bgcolor: '#020617', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Search controls header */}
                    <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={3}>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={esSearchIndex}
                              onChange={(e) => setEsSearchIndex(e.target.value)}
                              sx={{ borderRadius: 1, bgcolor: 'rgba(0,0,0,0.4)', color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }}
                            >
                              <MenuItem value="logs">Logs index</MenuItem>
                              <MenuItem value="incidents">Incidents index</MenuItem>
                              <MenuItem value="rca">RCA index</MenuItem>
                              <MenuItem value="events">Events index</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            size="small"
                            placeholder="Search logs by keyword, exception, or traceback..."
                            value={esSearchQuery}
                            onChange={(e) => setEsSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleEsSearch()}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                color: 'white',
                                borderRadius: 1,
                                bgcolor: 'rgba(0,0,0,0.4)',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }
                              }
                            }}
                          />
                        </Grid>
 
                        <Grid item xs={12} sm={3}>
                          <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            onClick={handleEsSearch}
                            disabled={esSearchLoading || !esSearchQuery.trim()}
                            startIcon={esSearchLoading ? <CircularProgress size={16} color="inherit" /> : <Search size={16} />}
                            sx={{ height: 40, borderRadius: 1, textTransform: 'none', fontWeight: 'bold' }}
                          >
                            {esSearchLoading ? 'Searching...' : 'Search'}
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
 
                    {/* Results panel */}
                    <SreConsole sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                      {esSearchLoading ? (
                        <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <CircularProgress color="primary" />
                        </Box>
                      ) : esSearchResults.length === 0 ? (
                        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                          <Search size={32} style={{ opacity: 0.1, marginBottom: 12 }} />
                          <Typography variant="body2" color="text.secondary">
                            Enter a search query to scan historical SRE data from Elasticsearch.
                          </Typography>
                        </Box>
                      ) : (
                        <Stack spacing={2}>
                          {esSearchResults.map((hit, idx) => (
                            <Box key={idx} className="sre-card" sx={{ p: 2, borderRadius: 1.5 }}>
                              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                  Match #{idx + 1} - Score: {hit.score?.toFixed(2) || '1.0'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {hit.timestamp ? new Date(hit.timestamp).toLocaleString() : 'Just now'}
                                </Typography>
                              </Stack>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#e2e8f0', fontSize: '0.8rem' }}>
                                {hit.message || hit.content || hit.log || JSON.stringify(hit)}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </SreConsole>
                  </Box>
                )}
              </SreCard>
            ) : (
              <SreCard
                sx={{
                  height: { xs: 420, md: 'calc(100vh - 250px)' },
                  minHeight: 520,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  py: 6,
                }}
              >
                <Terminal size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                <Typography variant="body1" color="white" fontWeight="medium" gutterBottom>
                  No Container Selected
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Expand a namespace and click on an SRE pod to stream logs or view YAML
                </Typography>
              </SreCard>
            )}
          </Grid>
        </Grid>
      )}
    </Container>
  );
}
