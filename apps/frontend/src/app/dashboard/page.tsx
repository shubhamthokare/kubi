"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Zap,
  Server,
  Database,
  Globe,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Typography,
  Container,
  Paper,
  Stack,
  Divider,
  Grid,
  Skeleton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from "@mui/material";
import { kubiApi } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<any>({
    incidents: [],
    plans: [],
    stats: null,
    resources: { namespaces: [], deployments: [], pods: [] },
  });
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [namespaceFilter, setNamespaceFilter] = useState("all");
  const [deploymentFilter, setDeploymentFilter] = useState("all");
  const [podFilter, setPodFilter] = useState("all");
  const [postmortemDialog, setPostmortemDialog] = useState<{open: boolean, content: string, title: string, loading: boolean}>({
    open: false,
    content: '',
    title: '',
    loading: false
  });

  const handleViewReport = async (incident: any) => {
    setPostmortemDialog({
      open: true,
      title: incident.pod?.name || "Service",
      content: incident.postmortem || '',
      loading: !incident.postmortem
    });

    if (!incident.postmortem) {
      try {
        const res = await kubiApi.getIncidentReport(incident._id);
        setPostmortemDialog(prev => ({
          ...prev,
          content: res.report_md,
          loading: false
        }));
      } catch (error) {
        console.error("Failed to fetch report:", error);
        setPostmortemDialog(prev => ({
          ...prev,
          content: "Failed to fetch report from server.",
          loading: false
        }));
      }
    }
  };

  useEffect(() => {
    async function loadData(isInitial = false) {
      try {
        const [incidentsRes, plansRes, statsRes, resourcesRes, settingsRes] =
          await Promise.all([
            kubiApi.getIncidents().catch(err => { console.error("Failed to load incidents:", err); return { incidents: [] }; }),
            kubiApi.getPlans().catch(err => { console.error("Failed to load plans:", err); return { plans: [] }; }),
            kubiApi.getStats().catch(err => { console.error("Failed to load stats:", err); return null; }),
            kubiApi.getResources().catch(err => { console.error("Failed to load resources:", err); return { namespaces: [], deployments: [], pods: [] }; }),
            kubiApi.getSettings().catch(err => { console.error("Failed to load settings:", err); return null; }),
          ]);

        if (settingsRes) {
          setSettings(settingsRes);
          
          if (isInitial) {
            const configClusters = settingsRes.clusters || [];
            let stored = localStorage.getItem("active_cluster_id");
            if (configClusters.length === 0) {
              if (stored) {
                localStorage.removeItem("active_cluster_id");
                loadData(false);
                return;
              }
            } else {
              if (!stored || !configClusters.some((c: any) => c.id === stored)) {
                const corrected = settingsRes.active_cluster_id || configClusters[0]?.id || "";
                if (corrected) {
                  localStorage.setItem("active_cluster_id", corrected);
                  loadData(false);
                  return;
                }
              }
            }
          }
        }

        setData({
          incidents: incidentsRes?.incidents || [],
          plans: plansRes?.plans || [],
          stats: statsRes,
          resources: resourcesRes || {
            namespaces: [],
            deployments: [],
            pods: [],
          },
        });
      } catch (error) {
        console.error("Dashboard data load failed:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData(true);
    const interval = setInterval(() => loadData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = data.stats || {
    nodes: { total: 0, ready: 0 },
    pods: { total: 0, running: 0, failed: 0, pending: 0 },
    namespaces: 0,
    uptime: "N/A",
    avg_resolution_time: "N/A",
  };

  const isSystemHealthy =
    stats.pods.failed === 0 && stats.nodes.total === stats.nodes.ready;

  // Use real-time resources for filters
  const namespaces = data.resources.namespaces;
  const deployments = data.resources.deployments;
  const pods = data.resources.pods;

  // Filter incidents for display
  const filteredIncidents = data.incidents.filter((incident: any) => {
    if (
      namespaceFilter !== "all" &&
      incident.pod?.namespace !== namespaceFilter
    )
      return false;
    if (
      deploymentFilter !== "all" &&
      !incident.pod?.name?.startsWith(deploymentFilter)
    )
      return false;
    if (podFilter !== "all" && incident.pod?.name !== podFilter) return false;
    return true;
  });

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      {/* Header Row: Overview + Unified Vitals */}
      <Grid container spacing={3} sx={{ mb: 6, mt: 1 }}>
        {/* Left Section: Branding & Configure (25%) */}
        <Grid item xs={12} lg={3} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Box sx={{ px: { xs: 0, lg: 2 }, mb: { xs: 4, lg: 0 } }}>
            <Typography variant="h3" fontWeight="900" color="white" sx={{ letterSpacing: '-0.04em', mb: 0.5, fontSize: { xs: '2rem', md: '2.5rem' } }}>
              Cluster Overview
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500, mb: 3, opacity: 0.8 }}>
              Autonomous Status:{" "}
              {loading ? (
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: '800' }}>LOADING...</Box>
              ) : settings?.clusters?.length > 0 ? (
                <Box component="span" sx={{ color: 'success.main', fontWeight: '800' }}>ACTIVE</Box>
              ) : (
                <Box component="span" sx={{ color: 'error.main', fontWeight: '800' }}>INACTIVE</Box>
              )}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
              <Button 
                variant="contained" 
                size="large" 
                startIcon={<Settings size={20} />}
                onClick={() => router.push('/dashboard/configure')}
                sx={{ 
                  bgcolor: 'primary.main',
                  color: 'white',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25)',
                  fontSize: '0.875rem',
                  fontWeight: '800',
                  textTransform: 'none',
                  borderRadius: 2.5,
                  py: 1.5,
                  px: 4,
                  '&:hover': {
                    bgcolor: 'primary.dark',
                    transform: 'translateY(-2px)',
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                Cluster Connection
              </Button>
              <IconButton 
                onClick={() => router.push('/settings')}
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.05)', 
                  color: 'white',
                  borderRadius: 2.5,
                  p: 1.5,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                <Settings size={24} />
              </IconButton>
            </Stack>
          </Box>
        </Grid>
        
        {/* Right Section: System Vitals Card (75%) */}
        <Grid item xs={12} lg={9}>
          <Card 
            elevation={0} 
            sx={{ 
              bgcolor: 'rgba(255,255,255,0.02)', 
              borderRadius: 4, 
              border: '1px solid rgba(255,255,255,0.05)',
              backdropFilter: 'blur(20px)',
              overflow: 'hidden'
            }}
          >
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              {/* Top Bar: Operational Metadata */}
              <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Typography variant="caption" fontWeight="800" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    System Health & Operations
                  </Typography>
                  <Stack direction="row" spacing={{ xs: 2, md: 3 }} alignItems="center" flexWrap="wrap">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main', boxShadow: '0 0 10px #10b981' }} />
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Uptime:</Typography>
                      <Typography variant="caption" fontWeight="bold" color="white" sx={{ whiteSpace: 'nowrap' }}>{stats.uptime}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>NS:</Typography>
                      <Typography variant="caption" fontWeight="bold" color="white">{stats.namespaces}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Avg Res:</Typography>
                      <Typography variant="caption" fontWeight="bold" color="white">{stats.avg_resolution_time}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Last Scan:</Typography>
                      <Typography variant="caption" fontWeight="bold" color="white" sx={{ whiteSpace: 'nowrap' }}>Just now</Typography>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>

              {/* Main Metrics Grid */}
              <Grid container>
                <Grid item xs={12} sx={{ p: 3 }}>
                  <Grid container spacing={3} alignItems="center">
                    {/* Groups of Metrics */}
                    <Grid item xs={6} sm={4} md={2}>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Node Capacity</Typography>
                        <Typography variant="h5" fontWeight="900" color="primary">
                          {Math.round((stats.nodes.ready / (stats.nodes.total || 1)) * 100)}%
                        </Typography>
                      </Stack>
                    </Grid>
                    
                    <Divider orientation="vertical" flexItem sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.05)', display: { xs: 'none', md: 'block' } }} />
                    
                    <Grid item xs={6} sm={4} md={2}>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pod Health</Typography>
                        <Typography variant="h5" fontWeight="900" color="success.main">
                          {Math.round((stats.pods.running / (stats.pods.total || 1)) * 100)}%
                        </Typography>
                      </Stack>
                    </Grid>

                    <Divider orientation="vertical" flexItem sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.05)', display: { xs: 'none', md: 'block' } }} />

                    <Grid item xs={6} sm={4} md={2}>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stability</Typography>
                        <Typography variant="h5" fontWeight="900" color={isSystemHealthy ? "success.main" : "warning.main"}>
                          {isSystemHealthy ? "100%" : "85%"}
                        </Typography>
                      </Stack>
                    </Grid>

                    <Divider orientation="vertical" flexItem sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.05)', display: { xs: 'none', md: 'block' } }} />

                    <Grid item xs={12} sm={6} md={3} sx={{ ml: 'auto' }}>
                      <Box sx={{ 
                        p: 2, 
                        borderRadius: 3, 
                        bgcolor: loading ? 'rgba(255,255,255,0.02)' : settings?.clusters?.length > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)', 
                        border: loading ? '1px solid rgba(255,255,255,0.05)' : settings?.clusters?.length > 0 ? '1px solid rgba(16, 185, 129, 0.1)' : '1px solid rgba(239, 68, 68, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center'
                      }}>
                        <Typography variant="caption" color={loading ? "text.secondary" : settings?.clusters?.length > 0 ? "success.main" : "error.main"} sx={{ fontWeight: 800, mb: 1, textTransform: 'uppercase' }}>
                          Autonomous Status
                        </Typography>
                        {loading ? (
                          <Skeleton width={80} height={24} sx={{ bgcolor: "rgba(255,255,255,0.1)", borderRadius: 1 }} />
                        ) : (
                          <Chip 
                            label={settings?.clusters?.length > 0 ? "ACTIVE" : "INACTIVE"} 
                            color={settings?.clusters?.length > 0 ? "success" : "error"} 
                            sx={{ 
                              height: 24, 
                              px: 1,
                              fontSize: '0.65rem', 
                              fontWeight: 900, 
                              borderRadius: 1,
                              boxShadow: settings?.clusters?.length > 0 ? '0 0 12px rgba(16, 185, 129, 0.3)' : '0 0 12px rgba(239, 68, 68, 0.3)'
                            }} 
                          />
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Hero Section: System Status (2x2) + Incident Stream (Right) */}
        <Grid item xs={12}>
          <Grid container spacing={3}>
            {/* Left Column: System Status 2x2 Grid */}
            <Grid item xs={12} lg={6}>
              <Card
                elevation={0}
                sx={{
                  bgcolor: "background.paper",
                  borderRadius: 3,
                  height: "100%",
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 4 }}
                  >
                    <Box>
                      <Typography
                        variant="h5"
                        fontWeight="bold"
                        color="white"
                        gutterBottom
                      >
                        System Status
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Real-time monitoring across all services
                      </Typography>
                    </Box>
                    {loading ? (
                      <Skeleton
                        width={100}
                        height={32}
                        sx={{ bgcolor: "rgba(255,255,255,0.1)" }}
                      />
                    ) : (
                      <Chip
                        icon={<CheckCircle size={16} />}
                        label={
                          isSystemHealthy ? "Operational" : "Attention Required"
                        }
                        color={isSystemHealthy ? "success" : "warning"}
                        variant="filled"
                      />
                    )}
                  </Stack>

                  <Grid container spacing={2}>
                    {/* 2x2 Grid Items */}
                    <Grid item xs={6}>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: "rgba(248, 113, 113, 0.05)",
                          border: "1px solid rgba(248, 113, 113, 0.1)",
                          borderRadius: 2,
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            Incident Reports
                          </Typography>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1.5}
                          >
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: 1,
                                bgcolor: "error.main",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <AlertTriangle color="white" size={18} />
                            </Box>
                            <Typography
                              variant="h5"
                              fontWeight="bold"
                              color="white"
                            >
                              {data.incidents.filter((i: any) => i.status !== 'resolved').length}/{data.incidents.length}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    </Grid>

                    <Grid item xs={6}>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: "rgba(96, 165, 250, 0.05)",
                          border: "1px solid rgba(96, 165, 250, 0.1)",
                          borderRadius: 2,
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            Ready Nodes
                          </Typography>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1.5}
                          >
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: 1,
                                bgcolor: "primary.main",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Server color="white" size={18} />
                            </Box>
                            <Typography
                              variant="h5"
                              fontWeight="bold"
                              color="white"
                            >
                              {stats.nodes.ready}/{stats.nodes.total}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    </Grid>

                    <Grid item xs={6}>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: "rgba(52, 211, 153, 0.05)",
                          border: "1px solid rgba(52, 211, 153, 0.1)",
                          borderRadius: 2,
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            Failed + Pending / Total Pods
                          </Typography>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1.5}
                          >
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: 1,
                                bgcolor: "success.main",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Activity color="white" size={18} />
                            </Box>
                            <Typography
                              variant="h5"
                              fontWeight="bold"
                              color="white"
                              sx={{ fontSize: '1.25rem' }}
                            >
                              {stats.pods.failed + stats.pods.pending}/{stats.pods.total}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    </Grid>

                    <Grid item xs={6}>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: "rgba(251, 191, 36, 0.05)",
                          border: "1px solid rgba(251, 191, 36, 0.1)",
                          borderRadius: 2,
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            Pending Approvals
                          </Typography>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1.5}
                          >
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: 1,
                                bgcolor: "warning.main",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Zap color="white" size={18} />
                            </Box>
                            <Typography
                              variant="h5"
                              fontWeight="bold"
                              color="white"
                            >
                              {
                                data.plans.filter(
                                  (p: any) => p.status === "pending_approval",
                                ).length
                              }
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Right Column: Recent Incident Stream */}
            <Grid item xs={12} lg={6}>
              <Card
                elevation={0}
                sx={{
                  bgcolor: "background.paper",
                  borderRadius: 3,
                  height: "100%",
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography
                      variant="h6"
                      fontWeight="bold"
                      color="white"
                    >
                      Recent Incident Stream
                    </Typography>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
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
                          '& .MuiSelect-select': { py: 0.75, fontSize: '0.8rem' }
                        }}
                      >
                        <MenuItem value="all">All Namespaces</MenuItem>
                        {namespaces.map((ns: string) => (
                          <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>

                  {filteredIncidents.length === 0 ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        py: 6,
                        bgcolor: "#0f172a",
                        borderRadius: 2,
                      }}
                    >
                      <Stack alignItems="center" spacing={1.5}>
                        <CheckCircle size={32} color="#34d399" />
                        <Typography variant="body1" color="white">
                          All Clear
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          No active incidents detected.
                        </Typography>
                      </Stack>
                    </Box>
                  ) : (
                    <Stack spacing={1.5}>
                      {filteredIncidents
                        .slice(0, 4)
                        .map((incident: any, idx: number) => (
                          <Paper
                            key={idx}
                            sx={{
                              p: 1.5,
                              bgcolor: "#0f172a",
                              borderRadius: 2,
                              border: "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                              >
                                <Box
                                  sx={{
                                    p: 0.8,
                                    borderRadius: 1,
                                    bgcolor: "error.main",
                                  }}
                                >
                                  <AlertTriangle size={14} color="white" />
                                </Box>
                                <Box>
                                  <Typography
                                    variant="caption"
                                    fontWeight="bold"
                                    color="white"
                                  >
                                    {incident.title ||
                                      (incident.pod
                                        ? `Incident: ${incident.pod.name}`
                                        : "Unknown Incident")}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    display="block"
                                    color="text.secondary"
                                  >
                                    {incident.pod?.namespace} |{" "}
                                    {incident.pod?.reason}
                                  </Typography>
                                </Box>
                              </Stack>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {incident.status === 'resolved' && (
                                  <Button 
                                    size="small" 
                                    variant="text" 
                                    sx={{ fontSize: '0.65rem', color: 'primary.light', p: 0, minWidth: 0 }}
                                    onClick={() => handleViewReport(incident)}
                                  >
                                    View Report
                                  </Button>
                                )}
                                <Chip
                                  label={
                                    incident.status?.toUpperCase() || "ACTIVE"
                                  }
                                  size="small"
                                  color={
                                    incident.status === "resolved"
                                      ? "success"
                                      : "error"
                                  }
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: "0.65rem" }}
                                />
                              </Stack>
                            </Stack>
                          </Paper>
                        ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Postmortem Dialog */}
      <Dialog 
        open={postmortemDialog.open} 
        onClose={() => setPostmortemDialog({ ...postmortemDialog, open: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: 'background.paper', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CheckCircle color="#34d399" size={24} />
            <Typography variant="h6" fontWeight="bold">Postmortem: {postmortemDialog.title}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'background.paper', pt: 3 }}>
          <Box sx={{ color: 'rgba(255,255,255,0.8)' }}>
            {postmortemDialog.loading ? (
              <Stack alignItems="center" py={4} spacing={2}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">Generating specialized report...</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.2)', p: 3, borderRadius: 2 }}>
                {postmortemDialog.content || "No report content available."}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'background.paper', p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setPostmortemDialog({ ...postmortemDialog, open: false })} sx={{ color: 'text.secondary' }}>Close</Button>
          <Button variant="contained" onClick={() => window.print()} sx={{ borderRadius: 2 }}>Export PDF</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
