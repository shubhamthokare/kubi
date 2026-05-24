"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  ArrowUpDown,
  Calendar,
  AlertCircle,
  Loader2,
  Play,
  Wrench,
  X,
  Terminal,
  FileText,
  Cpu,
  Server,
  GitBranch,
} from "lucide-react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  Container,
  Stack,
  Divider,
  TextField,
  InputAdornment,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Button,
  Tab,
  Tabs,
  Grid,
  Select,
  MenuItem,
  FormControl,
  Drawer,
} from "@mui/material";
import { kubiApi, getWsUrl } from "@/lib/api";

interface Incident {
  _id?: string;
  id: string;
  title?: string;
  severity?: "critical" | "high" | "medium" | "low";
  status: "active" | "investigating" | "resolved" | "pending";
  first_detected?: string;
  resolved_at?: string;
  plan_id?: string;
  plan_summary?: string;
  pod?: {
    name: string;
    namespace: string;
    phase: string;
    reason?: string;
    message?: string;
    uid: string;
    creation_timestamp?: string;
  };
}

// Removed mockIncidents to ensure real data is shown

type ChipColor =
  | "error"
  | "warning"
  | "info"
  | "success"
  | "default"
  | "primary"
  | "secondary";

const getSeverityColor = (severity?: string): ChipColor => {
  if (!severity) return "default";
  switch (severity.toLowerCase()) {
    case "critical":
      return "error";
    case "high":
      return "warning";
    case "medium":
      return "info";
    case "low":
      return "success";
    default:
      return "default";
  }
};

const getStatusColor = (status?: string): ChipColor => {
  if (!status) return "default";
  switch (status.toLowerCase()) {
    case "active":
      return "error";
    case "investigating":
      return "warning";
    case "resolved":
      return "success";
    case "pending":
      return "info";
    default:
      return "default";
  }
};

const getStatusIcon = (status?: string) => {
  if (!status) return null;
  switch (status.toLowerCase()) {
    case "active":
      return <AlertCircle size={16} />;
    case "investigating":
      return <Clock size={16} />;
    case "resolved":
      return <CheckCircle size={16} />;
    case "pending":
      return <AlertTriangle size={16} />;
    default:
      return null;
  }
};

interface PostmortemSection {
  title: string;
  content: string;
}

const parsePostmortem = (markdown?: string): PostmortemSection[] | null => {
  if (!markdown) return null;
  
  const sections: PostmortemSection[] = [];
  const regex = /##\s+([^\n]+)/g;
  let match;
  const headerIndices: { title: string; index: number }[] = [];
  
  while ((match = regex.exec(markdown)) !== null) {
    headerIndices.push({
      title: match[1],
      index: match.index
    });
  }
  
  if (headerIndices.length === 0) {
    return [{ title: "Incident Postmortem", content: markdown }];
  }
  
  for (let i = 0; i < headerIndices.length; i++) {
    const current = headerIndices[i];
    const next = headerIndices[i + 1];
    
    const headerTextLength = current.title.length + 3;
    const contentStart = current.index + headerTextLength;
    const contentEnd = next ? next.index : markdown.length;
    
    sections.push({
      title: current.title,
      content: markdown.slice(contentStart, contentEnd).trim()
    });
  }
  
  return sections;
};

export default function IncidentsPage() {
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespaceFilter, setNamespaceFilter] = useState("all");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [drawerTab, setDrawerTab] = useState(0);

  useEffect(() => {
    if (selectedIncident) {
      setDrawerTab(0);
    }
  }, [selectedIncident]);

  // Live Log Stream State
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [logConnectionStatus, setLogConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  useEffect(() => {
    if (drawerTab !== 1 || !selectedIncident) {
      setLiveLogs([]);
      setLogConnectionStatus('disconnected');
      return;
    }

    let ws: WebSocket | null = null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const pod = selectedIncident.pod?.name;
    const namespace = selectedIncident.pod?.namespace || 'default';

    if (!pod || !token) {
      setLogConnectionStatus('error');
      setLiveLogs(['[error] Missing pod metadata or access token.']);
      return;
    }

    setLogConnectionStatus('connecting');
    setLiveLogs(['[system] Initializing live SRE console log stream...']);

    try {
      const wsUrl = getWsUrl(`/ws/logs?pod=${pod}&namespace=${namespace}&token=${token}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setLogConnectionStatus('connected');
        setLiveLogs(prev => [...prev, `[system] Connected to stream for pod ${pod}.`]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'eof') {
            setLiveLogs(prev => [...prev, `[system] Stream ended: ${data.message}`]);
            setLogConnectionStatus('disconnected');
          } else if (data.type === 'error') {
            setLiveLogs(prev => [...prev, `[error] ${data.message}`]);
            setLogConnectionStatus('error');
          }
        } catch {
          // Plain text line
          setLiveLogs(prev => [...prev, event.data]);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setLogConnectionStatus('error');
        setLiveLogs(prev => [...prev, '[error] WebSocket connection failed or was interrupted.']);
      };

      ws.onclose = () => {
        setLogConnectionStatus('disconnected');
        setLiveLogs(prev => [...prev, '[system] Log stream session closed.']);
      };

    } catch (e: any) {
      setLogConnectionStatus('error');
      setLiveLogs(prev => [...prev, `[error] ${e.message || 'Failed to connect.'}`]);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [drawerTab, selectedIncident]);

  const fetchIncidents = async () => {
    try {
      const res = await kubiApi.getIncidents();
      setIncidents(res.incidents || []);
    } catch (error) {
      console.error("Failed to fetch incidents:", error);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadNamespaces() {
      try {
        const res = await kubiApi.getResources();
        if (res && res.namespaces) {
          setNamespaces(res.namespaces);
        }
      } catch (err) {
        console.error("Failed to load namespaces:", err);
      }
    }
    loadNamespaces();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      await kubiApi.triggerScan();
      await fetchIncidents();
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      setScanning(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const stats = React.useMemo(() => {
    const total = incidents.length;
    const active = incidents.filter((i: Incident) => i.status === "active").length;
    const resolved = incidents.filter((i: Incident) => i.status === "resolved");

    // Avg Resolution Time calculation
    let totalMs = 0;
    let count = 0;
    resolved.forEach((i: Incident) => {
      if (i.resolved_at && i.first_detected) {
        const start = new Date(i.first_detected).getTime();
        const end = new Date(i.resolved_at).getTime();
        if (end > start) {
          totalMs += end - start;
          count++;
        }
      }
    });

    const avgMs = count > 0 ? totalMs / count : 0;
    const avgMinutes = Math.floor(avgMs / 60000);
    const avgSeconds = Math.floor((avgMs % 60000) / 1000);

    let avgDisplay = "0s";
    if (avgMinutes > 0) {
      avgDisplay = `${avgMinutes}m ${avgSeconds}s`;
    } else if (avgSeconds > 0) {
      avgDisplay = `${avgSeconds}s`;
    } else if (count > 0) {
      avgDisplay = "< 1s";
    } else {
      avgDisplay = "N/A";
    }

    const autoResolvedRate =
      total > 0 ? Math.round((resolved.length / total) * 100) : 0;

    return {
      total,
      active,
      avgResolutionTime: avgDisplay,
      autoResolvedRate: `${autoResolvedRate}%`,
    };
  }, [incidents]);

  const displayIncidents = React.useMemo(() => {
    return incidents.filter((incident: Incident) => {
      // Filter by Search Query
      const query = searchQuery.toLowerCase();

      // Derived fields for filtering consistency
      const podName = incident.pod?.name || "";
      const podNamespace = incident.pod?.namespace || "";
      const derivedSeverity =
        incident.severity ||
        (incident.pod?.phase === "Failed" ? "critical" : "high");

      const matchesSearch =
        (incident.id || "").toLowerCase().includes(query) ||
        (incident.title || "").toLowerCase().includes(query) ||
        podName.toLowerCase().includes(query) ||
        podNamespace.toLowerCase().includes(query) ||
        derivedSeverity.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      // Filter by Namespace
      if (namespaceFilter !== "all" && podNamespace !== namespaceFilter) {
        return false;
      }

      // Filter by Tab
      if (tabValue === 0) return true; // All
      if (tabValue === 1) return incident.status === "active" && !incident.plan_id; // Active (No Plan yet)
      if (tabValue === 2) return incident.status === "resolved"; // Resolved
      if (tabValue === 3) return incident.status === "active" && incident.plan_id; // Pending Approval (Has Plan)

      return true;
    });
  }, [incidents, tabValue, searchQuery, namespaceFilter]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{ fontWeight: "bold" }}
              color="white"
              gutterBottom
            >
              Incident Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track and resolve system incidents automatically
            </Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              startIcon={scanning ? <Loader2 size={18} /> : <Play size={18} />}
              onClick={handleScan}
              disabled={scanning}
              sx={{
                bgcolor: "primary.main",
                borderRadius: 2,
                px: 3,
                textTransform: "none",
                fontWeight: "bold",
              }}
            >
              {scanning ? "Scanning..." : "Trigger Manual Scan"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Calendar />}
              sx={{ textTransform: "none", borderRadius: 2 }}
            >
              Last 30 days
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card
            elevation={0}
            sx={{ bgcolor: "background.paper", borderRadius: 3 }}
          >
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Total Incidents
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ fontWeight: "bold" }}
                  color="white"
                >
                  {stats.total}
                </Typography>
                <Chip
                  label={
                    stats.total > 0 ? "Cluster Analytics" : "All Systems Clear"
                  }
                  size="small"
                  color={stats.total > 0 ? "info" : "success"}
                  variant="outlined"
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card
            elevation={0}
            sx={{ bgcolor: "background.paper", borderRadius: 3 }}
          >
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Active Incidents
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ fontWeight: "bold" }}
                  color="white"
                >
                  {stats.active}
                </Typography>
                <Chip
                  label={
                    stats.active > 0
                      ? "Requiring Attention"
                      : "No active threats"
                  }
                  size="small"
                  color={stats.active > 0 ? "warning" : "success"}
                  variant="outlined"
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card
            elevation={0}
            sx={{ bgcolor: "background.paper", borderRadius: 3 }}
          >
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Avg Resolution Time
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ fontWeight: "bold" }}
                  color="white"
                >
                  {stats.avgResolutionTime}
                </Typography>
                <Chip
                  label="Real-time AI Performance"
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card
            elevation={0}
            sx={{ bgcolor: "background.paper", borderRadius: 3 }}
          >
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Auto-Resolved
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ fontWeight: "bold" }}
                  color="white"
                >
                  {stats.autoResolvedRate}
                </Typography>
                <Chip
                  label="AI Autonomy Rate"
                  size="small"
                  color="success"
                  variant="outlined"
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Main Content */}
        <Grid size={{ xs: 12 }}>
          <Card
            elevation={0}
            sx={{ bgcolor: "background.paper", borderRadius: 3 }}
          >
            <CardContent sx={{ p: 0 }}>
              {/* Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: "divider", px: 3 }}>
                <Tabs value={tabValue} onChange={handleTabChange}>
                  <Tab label="All Incidents" />
                  <Tab label="Active" />
                  <Tab label="Resolved" />
                  <Tab label="Pending Approval" />
                </Tabs>
              </Box>

              {/* Search and Filters */}
              <Box sx={{ p: 3 }}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "center" }}
                >
                  <TextField
                    fullWidth
                    placeholder="Search incidents by ID, title, or service..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search size={20} />
                          </InputAdornment>
                        ),
                      },
                    }}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "rgba(255,255,255,0.02)",
                      },
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <Select
                      value={namespaceFilter}
                      onChange={(e) => setNamespaceFilter(e.target.value)}
                      displayEmpty
                      sx={{
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                        '& .MuiSelect-select': { py: 1.0, fontSize: '0.85rem' }
                      }}
                    >
                      <MenuItem value="all">All Namespaces</MenuItem>
                      {namespaces.map((ns) => (
                        <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <IconButton>
                    <Filter size={20} />
                  </IconButton>
                  <IconButton>
                    <ArrowUpDown size={20} />
                  </IconButton>
                </Stack>
              </Box>

              <Divider />

              {/* Incidents Table */}
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Incident ID</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Severity</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Happened At</TableCell>
                      <TableCell>Detected At</TableCell>
                      <TableCell>Resolved At</TableCell>
                      <TableCell>Assignee</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 10 }}>
                          <Loader2 size={40} className="animate-spin" />
                        </TableCell>
                      </TableRow>
                    ) : displayIncidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 10 }}>
                          <Stack sx={{ alignItems: "center" }} spacing={2}>
                            <CheckCircle size={48} color="#34d399" />
                            <Typography
                              variant="h6"
                              color="white"
                              sx={{ fontWeight: "medium" }}
                            >
                              All Clear
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              No incidents detected in the cluster.
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayIncidents.map((incident: Incident, idx: number) => {
                        const getActionProps = () => {
                          const isResolved = incident.status === 'resolved';
                          const hasPlan = !!incident.plan_id;
                          const isActive = incident.status === 'active';

                          if (isResolved) {
                            return {
                              label: "View Report",
                              variant: "contained" as const,
                              color: "success" as const,
                              icon: <Calendar size={14} />,
                              href: `/reports?incident_id=${incident._id}`
                            };
                          }

                          if (hasPlan) {
                            return {
                              label: "Remediate",
                              variant: "contained" as const,
                              color: "primary" as const,
                              icon: <Wrench size={14} />,
                              href: `/remediation?plan_id=${incident.plan_id}`
                            };
                          }

                          return {
                            label: isActive && !hasPlan ? "Analyzing..." : "Remediate",
                            variant: "outlined" as const,
                            color: "primary" as const,
                            icon: isActive && !hasPlan ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />,
                            href: `/remediation?pod=${incident.pod?.name || ""}&namespace=${incident.pod?.namespace || ""}`
                          };
                        };

                        const actionProps = getActionProps();
                        const incidentSeverity =
                          incident.severity ||
                          (incident.pod?.phase === "Failed"
                            ? "critical"
                            : "high");

                        return (
                          <TableRow
                            key={incident.id || incident._id || idx}
                            hover
                            onClick={() => setSelectedIncident(incident)}
                            sx={{
                              cursor: "pointer",
                              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.04)" },
                            }}
                          >
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: "700", fontFamily: 'monospace' }}
                                color="primary"
                              >
                                {incident.pod?.namespace}/{incident.pod?.name || "N/A"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.5, fontSize: '0.65rem' }}>
                                UID: {incident.id?.split('-').pop()?.slice(0, 8) || "N/A"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="white">
                                {incident.title ||
                                  (incident.pod?.name
                                    ? `Anomaly in ${incident.pod.name}`
                                    : "Unknown Anomaly")}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={incidentSeverity.toUpperCase()}
                                size="small"
                                color={getSeverityColor(incidentSeverity)}
                                variant="filled"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                icon={
                                  getStatusIcon(incident.status || "active") ||
                                  undefined
                                }
                                label={
                                  incident.status
                                    ? incident.status.charAt(0).toUpperCase() +
                                      incident.status.slice(1)
                                    : "Active"
                                }
                                size="small"
                                color={getStatusColor(
                                  incident.status || "active",
                                )}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="white">
                                {incident.pod?.creation_timestamp
                                  ? new Date(
                                      incident.pod.creation_timestamp,
                                    ).toLocaleTimeString()
                                  : "N/A"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {incident.first_detected
                                  ? new Date(incident.first_detected).toLocaleTimeString()
                                  : "Detecting..."}
                              </Typography>
                              {incident.first_detected && incident.pod?.creation_timestamp && 
                               new Date(incident.first_detected) < new Date(incident.pod.creation_timestamp) && (
                                <Typography variant="caption" color="warning.main" sx={{ fontSize: '0.6rem', display: 'block' }}>
                                  * Legacy record or clock drift
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {incident.resolved_at
                                  ? new Date(incident.resolved_at).toLocaleTimeString()
                                  : "—"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                sx={{ alignItems: "center" }}
                                spacing={1}
                              >
                                <Avatar
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    bgcolor: "primary.main",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  AI
                                </Avatar>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  AI Agent
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              <Button
                                size="small"
                                variant={actionProps.variant}
                                color={actionProps.color}
                                startIcon={actionProps.icon}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  globalThis.location.href = actionProps.href;
                                }}
                                sx={{ 
                                  borderRadius: 2, 
                                  textTransform: "none",
                                  fontWeight: 'bold',
                                  boxShadow: (incident.plan_id || incident.status === 'resolved') ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none'
                                }}
                              >
                                {actionProps.label}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Footer */}
              <Box sx={{ p: 3, borderTop: 1, borderColor: "divider" }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                >
                  Showing {displayIncidents.length} incidents
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Drawer
        anchor="right"
        open={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 600, md: 700 },
            bgcolor: "#0f172a",
            backgroundImage: "none",
            borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "-12px 0 36px rgba(0, 0, 0, 0.6)",
            p: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {selectedIncident && (
          <>
            {/* Header */}
            <Box
              sx={{
                p: 3,
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                bgcolor: "#1e293b",
              }}
            >
              <Stack spacing={0.5}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: "bold",
                      opacity: 0.6,
                      color: "primary.main",
                    }}
                  >
                    Incident Analyzer
                  </Typography>
                  <Chip
                    label={(selectedIncident.severity || (selectedIncident.pod?.phase === "Failed" ? "critical" : "high")).toUpperCase()}
                    size="small"
                    color={getSeverityColor(selectedIncident.severity || (selectedIncident.pod?.phase === "Failed" ? "critical" : "high"))}
                    sx={{ fontWeight: "bold", fontSize: "0.65rem", height: 20 }}
                  />
                </Stack>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    mt: 0.5,
                    color: "#f8fafc",
                  }}
                >
                  {selectedIncident.pod?.namespace}/{selectedIncident.pod?.name || "Unknown Resource"}
                </Typography>
              </Stack>
              <IconButton
                onClick={() => setSelectedIncident(null)}
                sx={{
                  color: "text.secondary",
                  "&:hover": {
                    color: "white",
                    bgcolor: "rgba(255, 255, 255, 0.08)",
                  },
                }}
              >
                <X size={20} />
              </IconButton>
            </Box>

            {/* Navigation Tabs */}
            <Box
              sx={{
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                bgcolor: "#1e293b",
              }}
            >
              <Tabs
                value={drawerTab}
                onChange={(_, val) => setDrawerTab(val)}
                variant="fullWidth"
                textColor="primary"
                indicatorColor="primary"
                sx={{
                  "& .MuiTab-root": {
                    textTransform: "none",
                    fontWeight: "bold",
                    fontSize: "0.8rem",
                    py: 1.5,
                    color: "#94a3b8",
                  },
                  "& .Mui-selected": {
                    color: "#38bdf8 !important",
                  },
                  "& .MuiTabs-indicator": {
                    bgcolor: "#38bdf8",
                  },
                }}
              >
                <Tab label="Overview" icon={<Server size={16} />} iconPosition="start" />
                <Tab label="Live Logs" icon={<Terminal size={16} />} iconPosition="start" />
                <Tab label="AI Plan" icon={<Cpu size={16} />} iconPosition="start" />
                <Tab label="Postmortem" icon={<FileText size={16} />} iconPosition="start" />
                <Tab label="CI/CD" icon={<GitBranch size={16} />} iconPosition="start" />
              </Tabs>
            </Box>

            {/* Scrollable Content Body */}
            <Box sx={{ p: 3, flex: 1, overflowY: "auto", bgcolor: "#0f172a" }}>
              {/* Tab 0: Overview & Console Logs */}
              {drawerTab === 0 && (
                <Stack spacing={3}>
                  <Card
                    sx={{
                      bgcolor: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: 3,
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: "bold", mb: 2, color: "white" }}
                      >
                        Resource Metadata
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Namespace
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: "600", color: "#e2e8f0", mt: 0.5 }}
                          >
                            {selectedIncident.pod?.namespace || "N/A"}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Pod Name
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: "600",
                              color: "#e2e8f0",
                              mt: 0.5,
                              fontFamily: "monospace",
                            }}
                          >
                            {selectedIncident.pod?.name || "N/A"}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Resource Phase
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                bgcolor:
                                  selectedIncident.pod?.phase === "Running"
                                    ? "#34d399"
                                    : "#f87171",
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: "600", color: "#e2e8f0" }}
                            >
                              {selectedIncident.pod?.phase || "Unknown"}
                            </Typography>
                          </Stack>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Status
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: "600",
                              color:
                                selectedIncident.status === "resolved"
                                  ? "#34d399"
                                  : "#fbbf24",
                              mt: 0.5,
                              textTransform: "capitalize",
                            }}
                          >
                            {selectedIncident.status}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            First Detected
                          </Typography>
                          <Typography variant="body2" sx={{ color: "#cbd5e1", mt: 0.5 }}>
                            {selectedIncident.first_detected
                              ? new Date(selectedIncident.first_detected).toLocaleString()
                              : "N/A"}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Resolved At
                          </Typography>
                          <Typography variant="body2" sx={{ color: "#cbd5e1", mt: 0.5 }}>
                            {selectedIncident.resolved_at
                              ? new Date(selectedIncident.resolved_at).toLocaleString()
                              : "Active / Unresolved"}
                          </Typography>
                        </Grid>
                        {selectedIncident.pod?.uid && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Pod UID
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "monospace",
                                fontSize: "0.8rem",
                                color: "#94a3b8",
                                mt: 0.5,
                              }}
                            >
                              {selectedIncident.pod.uid}
                            </Typography>
                          </Grid>
                        )}
                        {selectedIncident.pod?.reason && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Failure Reason
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "monospace",
                                bgcolor: "rgba(248, 113, 113, 0.08)",
                                color: "#f87171",
                                p: 1.5,
                                borderRadius: 2,
                                mt: 0.5,
                                fontSize: "0.8rem",
                                border: "1px solid rgba(248, 113, 113, 0.15)",
                              }}
                            >
                              {selectedIncident.pod.reason}
                            </Typography>
                          </Grid>
                        )}
                        {selectedIncident.pod?.message && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Pod Status Message
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ color: "#94a3b8", fontSize: "0.8rem", mt: 0.5 }}
                            >
                              {selectedIncident.pod.message}
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </CardContent>
                  </Card>

                  {/* Console Logs */}
                  <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Terminal size={16} color="#38bdf8" />
                      <Typography variant="subtitle2" sx={{ fontWeight: "bold", color: "white" }}>
                        Cluster Logs & Event Context
                      </Typography>
                    </Stack>
                    {selectedIncident.logs_context ? (
                      <Box
                        sx={{
                          bgcolor: "#020617",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: 3,
                          p: 2,
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          color: "#38bdf8",
                          overflowX: "auto",
                          maxHeight: 300,
                          whiteSpace: "pre-wrap",
                          boxShadow: "inset 0 2px 8px rgba(0, 0, 0, 0.8)",
                          "&::-webkit-scrollbar": { width: 6, height: 6 },
                          "&::-webkit-scrollbar-thumb": {
                            bgcolor: "rgba(255, 255, 255, 0.15)",
                            borderRadius: 3,
                          },
                        }}
                      >
                        {selectedIncident.logs_context}
                      </Box>
                    ) : (
                      <Card
                        sx={{
                          bgcolor: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 3,
                        }}
                      >
                        <CardContent sx={{ p: 3, textAlign: "center" }}>
                          <Typography variant="body2" color="text.secondary">
                            No active container logs or pod event history was recorded.
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                  </Stack>
                </Stack>
              )}

              {/* Tab 1: Live Logs Console Stream */}
              {drawerTab === 1 && (
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar
                          sx={{
                            width: 28,
                            height: 28,
                            bgcolor: "#0284c7",
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                          }}
                        >
                          <Terminal size={14} />
                        </Avatar>
                        <Typography variant="subtitle1" sx={{ fontWeight: "bold", color: "white" }}>
                          Live SRE Console Logs
                        </Typography>
                      </Stack>
                      
                      {/* Connection status badge */}
                      <Chip
                        label={
                          logConnectionStatus === 'connected' ? 'LIVE' :
                          logConnectionStatus === 'connecting' ? 'CONNECTING' :
                          logConnectionStatus === 'error' ? 'ERROR' : 'OFFLINE'
                        }
                        size="small"
                        sx={{
                          fontWeight: 'bold',
                          fontSize: '0.7rem',
                          bgcolor:
                            logConnectionStatus === 'connected' ? 'rgba(16, 185, 129, 0.1)' :
                            logConnectionStatus === 'connecting' ? 'rgba(245, 158, 11, 0.1)' :
                            logConnectionStatus === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                          color:
                            logConnectionStatus === 'connected' ? '#10B981' :
                            logConnectionStatus === 'connecting' ? '#F59E0B' :
                            logConnectionStatus === 'error' ? '#EF4444' : '#94A3B8',
                          border:
                            logConnectionStatus === 'connected' ? '1px solid rgba(16, 185, 129, 0.2)' :
                            logConnectionStatus === 'connecting' ? '1px solid rgba(245, 158, 11, 0.2)' :
                            logConnectionStatus === 'error' ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
                          '& .MuiChip-label': { px: 1.5 }
                        }}
                      />
                    </Stack>

                    <Box
                      sx={{
                        bgcolor: "#020617",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 3,
                        p: 3,
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                        color: "#38bdf8",
                        overflowY: "auto",
                        height: "55vh",
                        boxShadow: "inset 0 4px 20px rgba(0, 0, 0, 0.9)",
                        position: 'relative',
                        "&::-webkit-scrollbar": { width: 6, height: 6 },
                        "&::-webkit-scrollbar-thumb": {
                          bgcolor: "rgba(255, 255, 255, 0.15)",
                          borderRadius: 3,
                        },
                      }}
                    >
                      {liveLogs.map((line, index) => {
                        let color = "#e2e8f0"; // default log color
                        if (line.includes("[system]")) {
                          color = "#10B981"; // success green
                        } else if (line.includes("[error]") || line.includes("[stderr]")) {
                          color = "#EF4444"; // error red
                        } else if (line.includes("WARN") || line.includes("WARNING")) {
                          color = "#F59E0B"; // warning amber
                        }
                        
                        return (
                          <div key={index} style={{ color, marginBottom: '6px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                            {line}
                          </div>
                        );
                      })}
                      {logConnectionStatus === 'connected' && (
                        <div style={{ display: 'flex', alignItems: 'center', color: '#10B981', marginTop: '12px', fontSize: '0.75rem' }}>
                          <span style={{ 
                            width: 6, 
                            height: 6, 
                            borderRadius: '50%', 
                            backgroundColor: '#10B981', 
                            display: 'inline-block',
                            marginRight: 8,
                            animation: 'pulse 1.5s infinite ease-in-out'
                          }} />
                          Streaming live console stdout...
                        </div>
                      )}
                    </Box>
                  </Box>
                </Stack>
              )}

              {/* Tab 2: AI Root Cause Analysis & Plan */}
              {drawerTab === 2 && (
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          bgcolor: "#818cf8",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                        }}
                      >
                        AI
                      </Avatar>
                      <Typography variant="subtitle1" sx={{ fontWeight: "bold", color: "white" }}>
                        AI Root Cause Analysis
                      </Typography>
                    </Stack>
                    <Card
                      sx={{
                        background:
                          "linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(167, 139, 250, 0.04) 100%)",
                        border: "1px solid rgba(167, 139, 250, 0.15)",
                        borderRadius: 3,
                        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
                      }}
                    >
                      <CardContent sx={{ p: 3 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            color: "#cbd5e1",
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                            fontSize: "0.875rem",
                          }}
                        >
                          {selectedIncident.rca ||
                            "AI analysis is in progress. The agent is correlating pod failures and event streams to locate the root cause."}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>

                  {/* Remediation Plan */}
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                      <Wrench size={18} color="#38bdf8" />
                      <Typography variant="subtitle1" sx={{ fontWeight: "bold", color: "white" }}>
                        Autonomous Remediation Plan
                      </Typography>
                    </Stack>
                    {selectedIncident.plan_summary ? (
                      <Card
                        sx={{
                          bgcolor: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 3,
                        }}
                      >
                        <CardContent sx={{ p: 3 }}>
                          <Typography
                            variant="body2"
                            sx={{ color: "#94a3b8", mb: 2.5, fontWeight: "500" }}
                          >
                            {selectedIncident.plan_summary}
                          </Typography>
                          <Divider sx={{ mb: 2.5, borderColor: "rgba(255, 255, 255, 0.06)" }} />
                          {/* Display action items list if present dynamically or a single clear description */}
                          <Stack spacing={2}>
                            {(selectedIncident as any).plan_actions?.map(
                              (action: any, index: number) => (
                                <Stack
                                  key={index}
                                  direction="row"
                                  spacing={2}
                                  alignItems="flex-start"
                                >
                                  <Avatar
                                    sx={{
                                      width: 24,
                                      height: 24,
                                      bgcolor: "primary.dark",
                                      fontSize: "0.75rem",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {index + 1}
                                  </Avatar>
                                  <Box>
                                    <Typography
                                      variant="body2"
                                      sx={{ fontWeight: "bold", color: "white" }}
                                    >
                                      {action.action_type
                                        ?.split("_")
                                        .map(
                                          (w: string) =>
                                            w.charAt(0).toUpperCase() + w.slice(1)
                                        )
                                        .join(" ") || "Remediation Step"}
                                    </Typography>
                                    {action.parameters &&
                                      Object.keys(action.parameters).length > 0 && (
                                        <Box
                                          sx={{
                                            mt: 0.5,
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 0.5,
                                          }}
                                        >
                                          {Object.entries(action.parameters).map(([k, v]) => (
                                            <Chip
                                              key={k}
                                              label={`${k}: ${v}`}
                                              size="small"
                                              sx={{
                                                fontSize: "0.7rem",
                                                height: 18,
                                                bgcolor: "rgba(255,255,255,0.04)",
                                                color: "#94a3b8",
                                                border: "1px solid rgba(255,255,255,0.06)",
                                              }}
                                            />
                                          ))}
                                        </Box>
                                      )}
                                  </Box>
                                </Stack>
                              )
                            ) || (
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Avatar
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    bgcolor: "primary.dark",
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                  }}
                                >
                                  1
                                </Avatar>
                                <Typography variant="body2" sx={{ color: "white" }}>
                                  Execute autonomous rollback or patch deployment
                                </Typography>
                              </Stack>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card
                        sx={{
                          bgcolor: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 3,
                        }}
                      >
                        <CardContent sx={{ p: 3, textAlign: "center" }}>
                          <Typography variant="body2" color="text.secondary">
                            No automated remediation plan generated for this incident type.
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                  </Box>
                </Stack>
              )}

              {/* Tab 3: Postmortem Report */}
              {drawerTab === 3 && (
                <Box>
                  {parsePostmortem(selectedIncident.postmortem) ? (
                    <Stack spacing={3}>
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                        <CheckCircle size={22} color="#34d399" />
                        <Typography variant="h6" sx={{ fontWeight: "bold", color: "white" }}>
                          Postmortem Investigation Report
                        </Typography>
                      </Stack>
                      {parsePostmortem(selectedIncident.postmortem)!.map((sec, idx) => {
                        const titleLower = sec.title.toLowerCase();
                        let icon = <FileText size={18} color="#60a5fa" />;
                        let headerBg = "rgba(96, 165, 250, 0.08)";
                        let borderColor = "rgba(96, 165, 250, 0.15)";
                        let titleColor = "#60a5fa";

                        if (titleLower.includes("what happened")) {
                          icon = <AlertCircle size={18} color="#f87171" />;
                          headerBg = "rgba(248, 113, 113, 0.08)";
                          borderColor = "rgba(248, 113, 113, 0.15)";
                          titleColor = "#f87171";
                        } else if (titleLower.includes("why it happened")) {
                          icon = <Cpu size={18} color="#fbbf24" />;
                          headerBg = "rgba(251, 191, 36, 0.08)";
                          borderColor = "rgba(251, 191, 36, 0.15)";
                          titleColor = "#fbbf24";
                        } else if (
                          titleLower.includes("how it was resolved") ||
                          titleLower.includes("how resolved")
                        ) {
                          icon = <CheckCircle size={18} color="#34d399" />;
                          headerBg = "rgba(52, 211, 153, 0.08)";
                          borderColor = "rgba(52, 211, 153, 0.15)";
                          titleColor = "#34d399";
                        } else if (titleLower.includes("prevent") || titleLower.includes("future")) {
                          icon = <Server size={18} color="#a78bfa" />;
                          headerBg = "rgba(167, 139, 250, 0.08)";
                          borderColor = "rgba(167, 139, 250, 0.15)";
                          titleColor = "#a78bfa";
                        }

                        return (
                          <Card
                            key={idx}
                            sx={{
                              bgcolor: "rgba(255, 255, 255, 0.01)",
                              border: `1px solid ${borderColor}`,
                              borderRadius: 2.5,
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                px: 2,
                                py: 1.5,
                                bgcolor: headerBg,
                                borderBottom: `1px solid ${borderColor}`,
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                              }}
                            >
                              {icon}
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  fontWeight: "bold",
                                  color: titleColor,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                {sec.title}
                              </Typography>
                            </Box>
                            <CardContent sx={{ p: 2.5 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  color: "#e2e8f0",
                                  lineHeight: 1.6,
                                  whiteSpace: "pre-wrap",
                                  fontSize: "0.875rem",
                                }}
                              >
                                {sec.content.trim()}
                              </Typography>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Box sx={{ textAlign: "center", py: 8, px: 3 }}>
                      <Stack sx={{ alignItems: "center" }} spacing={2}>
                        <Loader2 size={48} color="#64748b" className="animate-spin" />
                        <Typography
                          variant="subtitle1"
                          color="white"
                          sx={{ fontWeight: "bold" }}
                        >
                          Awaiting Postmortem Compilation
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ maxWidth: 350, mt: 1 }}
                        >
                          The incident is currently {selectedIncident.status}. A comprehensive root
                          cause postmortem report will be automatically compiled once the incident is
                          fully resolved by the AI agent.
                        </Typography>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}

              {/* Tab 4: GitLab Pipeline Integration */}
              {drawerTab === 4 && (
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
                    <GitBranch size={22} color="#f472b6" />
                    <Typography variant="h6" sx={{ fontWeight: "bold", color: "white" }}>
                      GitLab CI/CD Integration
                    </Typography>
                  </Stack>
                  {selectedIncident.gitlab_pipeline ? (
                    <Stack spacing={3}>
                      <Card
                        sx={{
                          bgcolor: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 3,
                        }}
                      >
                        <CardContent sx={{ p: 3 }}>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            sx={{ mb: 3 }}
                          >
                            <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: "bold", color: "text.secondary" }}
                            >
                              Pipeline Deployment Reference
                            </Typography>
                            <Chip
                              label={selectedIncident.gitlab_pipeline.status?.toUpperCase() || "UNKNOWN"}
                              color={
                                selectedIncident.gitlab_pipeline.status === "success"
                                  ? "success"
                                  : selectedIncident.gitlab_pipeline.status === "failed"
                                  ? "error"
                                  : selectedIncident.gitlab_pipeline.status === "running"
                                  ? "warning"
                                  : "default"
                              }
                              size="small"
                              sx={{ fontWeight: "bold", fontSize: "0.7rem", height: 22 }}
                            />
                          </Stack>
                          <Grid container spacing={2.5}>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Repository Project
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: "600", color: "white", mt: 0.5 }}
                              >
                                {selectedIncident.gitlab_pipeline.project || "N/A"}
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Pipeline ID
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: "monospace",
                                  fontWeight: "600",
                                  color: "white",
                                  mt: 0.5,
                                }}
                              >
                                #{selectedIncident.gitlab_pipeline.pipeline_id || "N/A"}
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Build Stage
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: "600", color: "white", mt: 0.5 }}
                              >
                                {selectedIncident.gitlab_pipeline.stage || "N/A"}
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Triggered By
                              </Typography>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                <Avatar
                                  sx={{
                                    width: 20,
                                    height: 20,
                                    bgcolor: "#f472b6",
                                    fontSize: "0.7rem",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {selectedIncident.gitlab_pipeline.author
                                    ?.charAt(0)
                                    .toUpperCase() || "U"}
                                </Avatar>
                                <Typography variant="body2" sx={{ color: "white" }}>
                                  {selectedIncident.gitlab_pipeline.author || "N/A"}
                                </Typography>
                              </Stack>
                            </Grid>
                            {selectedIncident.gitlab_pipeline.commit_message && (
                              <Grid item xs={12}>
                                <Divider sx={{ my: 1, borderColor: "rgba(255, 255, 255, 0.06)" }} />
                                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                                  Git Commit Message / Ref
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "#e2e8f0",
                                    fontFamily: "monospace",
                                    fontSize: "0.8rem",
                                    bgcolor: "#020617",
                                    p: 2,
                                    borderRadius: 2,
                                    mt: 0.5,
                                    border: "1px solid rgba(255, 255, 255, 0.08)",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {selectedIncident.gitlab_pipeline.commit_message}
                                </Typography>
                              </Grid>
                            )}
                          </Grid>
                        </CardContent>
                      </Card>

                      {selectedIncident.gitlab_pipeline.status === "failed" && (
                        <Card
                          sx={{
                            bgcolor: "rgba(248, 113, 113, 0.04)",
                            border: "1px solid rgba(248, 113, 113, 0.15)",
                            borderRadius: 3,
                          }}
                        >
                          <CardContent sx={{ p: 2.5, display: "flex", gap: 2 }}>
                            <AlertCircle
                              size={20}
                              color="#f87171"
                              style={{ flexShrink: 0, marginTop: 2 }}
                            />
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: "bold", color: "#f87171" }}>
                                Deployment Failure Correlated
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontSize: "0.8rem", mt: 0.5, lineHeight: 1.5 }}
                              >
                                This failed deployment pipeline likely introduced the breaking change. The AI Agent's autonomous remediation is designed to patch or revert this deployment in order to restore normal system operations.
                              </Typography>
                            </Box>
                          </CardContent>
                        </Card>
                      )}
                    </Stack>
                  ) : (
                    <Card
                      sx={{
                        bgcolor: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        borderRadius: 3,
                      }}
                    >
                      <CardContent sx={{ p: 3, textAlign: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                          No GitLab deployment pipeline correlated for this incident.
                        </Typography>
                      </CardContent>
                    </Card>
                  )}
                </Box>
              )}
            </Box>
          </>
        )}
      </Drawer>
    </Container>
  );
}
