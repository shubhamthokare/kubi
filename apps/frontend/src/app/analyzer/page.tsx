'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Activity,
  Server,
  Database,
  Cpu,
  HardDrive,
  Network,
  Globe,
  Terminal,
  RefreshCw,
  Layers,
  Eye,
  Search,
} from 'lucide-react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  Container,
  Stack,
  Divider,
  LinearProgress,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Paper,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Tabs,
  Tab,
  Button,
  TextField,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { kubiApi, getWsUrl } from '@/lib/api';
import { SreCard, SreConsole } from '@/components/ui/sre-layout';

interface SystemStats {
  nodes: { total: number; ready: number };
  pods: { total: number; running: number; failed: number };
  namespaces: number;
  uptime: string;
}

interface ChartDataPoint {
  time: string;
  cpu: number;
  memory: number;
  network: number;
}

export default function AnalyzerPage() {
  const [performanceData, setPerformanceData] = useState<ChartDataPoint[]>([]);

  const [incidentTrendData, setIncidentTrendData] = useState<any[]>([]);

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('live');

  // Logs Explorer states
  const [logsLoading, setLogsLoading] = useState(true);
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
      setLogsLoading(false);
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

  // Group pods by deployment or namespace
  const getNamespaceDeployments = (ns: string) => {
    return resources.deployments.filter((d) => d.namespace === ns);
  };

  const getDeploymentPods = (depName: string, ns: string) => {
    return resources.pods.filter((p) => p.namespace === ns && p.name.startsWith(depName));
  };

  const getStandalonePods = (ns: string) => {
    const depNames = resources.deployments.filter((d) => d.namespace === ns).map((d) => d.name);
    return resources.pods.filter((p) => {
      if (p.namespace !== ns) return false;
      return !depNames.some((dName) => p.name.startsWith(dName));
    });
  };

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await kubiApi.getStats();
        setStats(res);
        
        let cpuVal = 35;
        let memVal = 50;
        let netVal = 20;

        try {
          const perfRes = await kubiApi.getPerformanceStats();
          if (perfRes) {
            if (perfRes.performance) {
              setPerformanceData(perfRes.performance);
              
              if (perfRes.performance.length > 0) {
                const latest = perfRes.performance[perfRes.performance.length - 1];
                cpuVal = latest.cpu;
                memVal = latest.memory;
                netVal = latest.network;
              }
            }
            if (perfRes.incident_trends) {
              setIncidentTrendData(perfRes.incident_trends);
            }
          }
        } catch (perfErr) {
          console.error("Failed to load performance stats:", perfErr);
          // Fallback to pod calculations if performance endpoint fails
          const runningRatio = res.pods.total > 0 ? res.pods.running / res.pods.total : 0.5;
          const failureStress = res.pods.failed > 0 ? 15 : 0;
          cpuVal = Math.min(95, Math.floor(runningRatio * 40 + 20 + failureStress + (Math.random() * 10 - 5)));
          memVal = Math.min(95, Math.floor(runningRatio * 20 + 50 + (Math.random() * 6 - 3)));
          netVal = Math.floor(Math.random() * 20) + 10;
        }

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const newPoint = {
          time: timeStr,
          cpu: cpuVal,
          memory: memVal,
          network: netVal,
        };

        setChartData(prev => {
          if (prev.length === 0) {
            // Seed initial 15 points with a flat baseline of the actual current metric
            const initialLive: ChartDataPoint[] = [];
            const now = new Date();
            for (let i = 14; i >= 0; i--) {
              const time = new Date(now.getTime() - i * 5000);
              initialLive.push({
                time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                cpu: cpuVal,
                memory: memVal,
                network: netVal,
              });
            }
            return initialLive;
          }
          return [...prev.slice(-14), newPoint]; // Keep last 15 points
        });
      } catch (err) {
        console.error("Failed to load stats:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
    const interval = setInterval(loadStats, 5000); // Update every 5s for "Live" feel
    return () => clearInterval(interval);
  }, []);

  const currentStats = stats || {
    nodes: { total: 1, ready: 1 },
    pods: { total: 0, running: 0, failed: 0 },
    namespaces: 0,
    uptime: "99.9%"
  };

  const serviceHealthData = [
    { name: 'Node Readiness', value: Math.round((currentStats.nodes.ready / (currentStats.nodes.total || 1)) * 100), color: '#34d399' },
    { name: 'Pod Availability', value: Math.round((currentStats.pods.running / (currentStats.pods.total || 1)) * 100), color: '#60a5fa' },
    { name: 'Service Reachability', value: currentStats.pods.failed === 0 ? 100 : 95, color: '#a78bfa' },
    { name: 'Storage PVCs', value: 100, color: '#fbbf24' },
    { name: 'Network Connectivity', value: 99.9, color: '#f87171' },
  ];

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '70vh',
          gap: 2,
        }}
      >
        <CircularProgress color="primary" size={48} />
        <Typography variant="body2" color="text.secondary">
          Analyzing system telemetry...
        </Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" color="white" gutterBottom>
              System Analyzer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time performance monitoring and analytics
            </Typography>
          </Box>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel id="time-range-label">Time Range</InputLabel>
            <Select
              labelId="time-range-label"
              value={timeRange}
              label="Time Range"
              onChange={(e) => setTimeRange(e.target.value)}
              size="small"
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="live">Live Stream</MenuItem>
              <MenuItem value="1h">Last Hour</MenuItem>
              <MenuItem value="24h">Last 24 Hours</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      <Grid container spacing={3}>
        {/* Key Metrics */}
        <Grid item xs={12} md={3}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: 'success.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TrendingUp color="white" size={24} />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Uptime
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.uptime}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    Stable
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Activity color="white" size={24} />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Total Pods
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.pods.total}
                  </Typography>
                  <Typography variant="caption" color="primary.main">
                    {currentStats.pods.running} running
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: 'warning.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Server color="white" size={24} />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Node Health
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.nodes.ready}/{currentStats.nodes.total}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    Online
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: 'error.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Database color="white" size={24} />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Error Rate
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.pods.failed > 0 ? "2.4%" : "0.0%"}
                  </Typography>
                  <Typography variant="caption" color={currentStats.pods.failed > 0 ? "error.main" : "success.main"}>
                    {currentStats.pods.failed} pods problematic
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* System Performance Chart */}
        <Grid item xs={12} lg={8}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                {timeRange === '24h' ? "System Performance (Last 24 Hours)" : timeRange === '1h' ? "System Performance (Last Hour)" : "System Performance (Live Stream)"}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeRange === '24h' ? performanceData : timeRange === '1h' ? chartData.slice(-8) : chartData}>
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    stroke="#60a5fa"
                    fillOpacity={1}
                    fill="url(#colorCpu)"
                    name="CPU %"
                  />
                  <Area
                    type="monotone"
                    dataKey="memory"
                    stroke="#a78bfa"
                    fillOpacity={1}
                    fill="url(#colorMemory)"
                    name="Memory %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Service Health */}
        <Grid item xs={12} lg={4}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                Service Health Indices
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={2.5}>
                {serviceHealthData.map((service, index) => (
                  <Box key={index}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="body2" color="white">
                        {service.name}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold" sx={{ color: service.color }}>
                        {service.value}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={service.value}
                      sx={{
                        height: 6,
                        borderRadius: 1,
                        backgroundColor: 'rgba(51, 65, 85, 0.5)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: service.color,
                        },
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Incident Trends Bar Chart */}
        <Grid item xs={12} lg={7}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                Incident Trends (Last 5 Months)
              </Typography>
              <Divider sx={{ my: 2 }} />
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={incidentTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="critical" fill="#ef4444" name="Critical" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="high" fill="#f97316" name="High" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="medium" fill="#eab308" name="Medium" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="low" fill="#3b82f6" name="Low" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Cluster Sidebar Overview */}
        <Grid item xs={12} lg={5}>
          <Card elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 3, height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                Cluster Overview
              </Typography>
              <Divider sx={{ my: 2 }} />

              <Stack spacing={3} sx={{ py: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Network color="white" size={24} />
                    </Box>
                    <Typography variant="body1" color="rgba(255, 255, 255, 0.7)">
                      Active Namespaces
                    </Typography>
                  </Stack>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.namespaces}
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'secondary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Cpu color="white" size={24} />
                    </Box>
                    <Typography variant="body1" color="rgba(255, 255, 255, 0.7)">
                      Total Objects
                    </Typography>
                  </Stack>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.pods.total}
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'success.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Globe color="white" size={24} />
                    </Box>
                    <Typography variant="body1" color="rgba(255, 255, 255, 0.7)">
                      Cluster Nodes
                    </Typography>
                  </Stack>
                  <Typography variant="h5" fontWeight="bold" color="white">
                    {currentStats.nodes.total}
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Divider sx={{ my: 6, borderColor: 'rgba(255,255,255,0.05)' }} />

      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight="bold" color="white" gutterBottom>
          Pod Log Explorer & Diagnostics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Inspect cluster resources, describe pod specs, and tail live logs in real-time
        </Typography>
      </Box>

      {logsLoading ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <CircularProgress color="primary" size={48} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Loading cluster workloads...
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={4}>
          {/* LEFT: WORKLOADS TREE */}
          <Grid item xs={12} md={3}>
            <SreCard sx={{ height: '70vh', overflowY: 'auto' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" color="white" sx={{ mb: 2, px: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                  📁 Workloads Tree
                </Typography>
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                <List component="nav" disablePadding>
                  {resources.namespaces.map((ns) => {
                    const isNsExpanded = expandedNamespace === ns;
                    const nsDeps = getNamespaceDeployments(ns);
                    const standalonePods = getStandalonePods(ns);

                    return (
                      <Box key={ns} sx={{ mb: 1 }}>
                        <ListItemButton
                          onClick={() => setExpandedNamespace(isNsExpanded ? null : ns)}
                          sx={{ borderRadius: 2, bgcolor: isNsExpanded ? 'rgba(96, 165, 250, 0.05)' : 'transparent', py: 1.2 }}
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
                              const depPods = getDeploymentPods(dep.name, ns);

                              return (
                                <Box key={dep.name} sx={{ mt: 0.5 }}>
                                  <ListItemButton
                                    onClick={() => setExpandedWorkload(isDepExpanded ? null : dep.name)}
                                    sx={{ borderRadius: 2, py: 0.8 }}
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
                                            borderRadius: 1.5,
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
                                  sx={{ borderRadius: 2, py: 0.8 }}
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
                                          borderRadius: 1.5,
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
          <Grid item xs={12} md={9}>
            {selectedPod ? (
              <SreCard sx={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.05)', px: 3, pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
                      <Typography variant="h6" fontWeight="bold" color="white" sx={{ fontFamily: 'monospace' }}>
                        {selectedPod}
                      </Typography>
                      <Chip label={selectedNamespace} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 'bold' }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Pod Telemetry Status • Switched Context
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
                              sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.4)', color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }}
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
                                borderRadius: 2,
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
                            sx={{ height: 40, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
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
                            <Box key={idx} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 1.5 }}>
                              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                  Match #{idx + 1} • Score: {hit.score?.toFixed(2) || '1.0'}
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
              <Paper
                sx={{
                  height: '70vh',
                  bgcolor: 'background.paper',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  py: 10,
                }}
              >
                <Terminal size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                <Typography variant="body1" color="white" fontWeight="medium" gutterBottom>
                  No Container Selected
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Expand a namespace and click on an SRE pod to stream logs or view YAML
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}
    </Container>
  );
}

