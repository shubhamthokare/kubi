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
    stats.nodes.total > 0 && stats.pods.failed === 0 && stats.nodes.total === stats.nodes.ready;

  const getPlanTargetKey = (plan: any): string => {
    const firstAction = plan.plan?.actions?.[0];
    const namespaceKey = firstAction?.namespace || plan.namespace || "default";
    const targetKey = firstAction?.target_name || plan.pod_name || plan.plan_id;
    return `${namespaceKey}:${targetKey}`;
  };

  const getPlanSortKey = (plan: any): string => String(plan._id || plan.plan_id || "");

  const pendingApprovalsCount = Array.from(
    data.plans
      .filter((plan: any) => plan.status === "pending_approval" && !plan.superseded_by)
      .reduce((latestByTarget: Map<string, any>, plan: any) => {
        const key = getPlanTargetKey(plan);
        const existing = latestByTarget.get(key);
        if (!existing || getPlanSortKey(plan) > getPlanSortKey(existing)) {
          latestByTarget.set(key, plan);
        }
        return latestByTarget;
      }, new Map<string, any>())
      .values(),
  ).length;

  // Use real-time resources for filters
  const namespaces = data.resources.namespaces;
  const deployments = data.resources.deployments;
  const pods = data.resources.pods;

  // Filter incidents for display
  const filteredIncidents = data.incidents.filter((incident: any) => {
    const podNamespace = incident.pod?.namespace || incident.namespace || "";
    const podName = incident.pod?.name || incident.pod_name || "";
    
    if (
      namespaceFilter !== "all" &&
      podNamespace !== namespaceFilter
    )
      return false;
    if (
      deploymentFilter !== "all" &&
      !podName.startsWith(deploymentFilter)
    )
      return false;
    if (podFilter !== "all" && podName !== podFilter) return false;
    return true;
  });

  return (
    <Container maxWidth={false} disableGutters sx={{ py: 0 }}>
      {/* Top Header Row (Full Width) */}
      <Box className="ops-page-header" sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2.5 }}>
        <Box>
          <Typography variant="h4" fontWeight="850" color="white" sx={{ mb: 0.75, fontSize: { xs: '1.75rem', md: '2rem' } }}>
            Cluster Overview
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Box 
              className={settings?.clusters?.length > 0 ? "pulse-ring-1 glow-success" : "pulse-ring-1 glow-error"}
              sx={{ 
                width: 8, 
                height: 8, 
                borderRadius: '50%', 
                bgcolor: loading ? 'text.secondary' : settings?.clusters?.length > 0 ? '#10b981' : '#ef4444' 
              }} 
            />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Autonomous Status:{" "}
              {loading ? (
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: '800' }}>LOADING...</Box>
              ) : settings?.clusters?.length > 0 ? (
                <Box component="span" sx={{ color: '#10b981', fontWeight: '800', letterSpacing: '0.05em' }}>ACTIVE</Box>
              ) : (
                <Box component="span" sx={{ color: '#ef4444', fontWeight: '800', letterSpacing: '0.05em' }}>INACTIVE</Box>
              )}
            </Typography>
            <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              Uptime: <Box component="span" sx={{ color: 'white', fontWeight: 700 }}>{stats.uptime}</Box>
            </Typography>
            <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              Namespaces: <Box component="span" sx={{ color: 'white', fontWeight: 700 }}>{stats.namespaces}</Box>
            </Typography>
          </Stack>
        </Box>
        
        {/* Connection Action Buttons */}
        <Stack direction="row" spacing={2}>
          <Button 
            variant="contained" 
            size="large" 
            startIcon={<Settings size={18} />}
            onClick={() => router.push('/dashboard/configure')}
            sx={{ 
              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              color: 'white',
              boxShadow: '0 4px 16px rgba(59, 130, 246, 0.25)',
              fontSize: '0.85rem',
              fontWeight: '800',
              textTransform: 'none',
              borderRadius: 1,
              py: 1.25,
              px: 2.5,
              border: '1px solid rgba(255,255,255,0.1)',
              '&:hover': {
                background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.35)',
              },
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            Cluster Connection
          </Button>
          <IconButton 
            onClick={() => router.push('/settings')}
            sx={{ 
              bgcolor: 'rgba(255,255,255,0.02)', 
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 1,
              p: 1.25,
              '&:hover': { 
                bgcolor: 'rgba(255,255,255,0.06)',
                color: 'white',
              },
              transition: 'all 0.2s ease'
            }}
          >
            <Settings size={20} />
          </IconButton>
        </Stack>
      </Box>

      {/* Responsive Vitals Metrics Cards Grid (Row 2 - Spans 4 Columns) */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Card 1: Node Capacity */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card className="glass glass-hover" elevation={0}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Typography variant="caption" color="rgba(255,255,255,0.5)" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Node Capacity
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(96, 165, 250, 0.1)', display: 'flex' }}>
                  <Server size={18} color="#60a5fa" />
                </Box>
              </Stack>
              <Typography variant="h4" fontWeight="850" color="white" sx={{ mb: 0.75 }}>
                {Math.round((stats.nodes.ready / (stats.nodes.total || 1)) * 100)}%
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                {stats.nodes.ready} of {stats.nodes.total} Nodes Ready
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={Math.round((stats.nodes.ready / (stats.nodes.total || 1)) * 100)} 
                sx={{ 
                  height: 6, 
                  borderRadius: 3, 
                  bgcolor: 'rgba(255,255,255,0.04)',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                    borderRadius: 3
                  }
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Pod Health */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card className="glass glass-hover" elevation={0}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Typography variant="caption" color="rgba(255,255,255,0.5)" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Pod Health
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', display: 'flex' }}>
                  <Activity size={18} color="#10b981" />
                </Box>
              </Stack>
              <Typography variant="h4" fontWeight="850" color="white" sx={{ mb: 0.75 }}>
                {Math.round((stats.pods.running / (stats.pods.total || 1)) * 100)}%
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                {stats.pods.running} of {stats.pods.total} Pods Running
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={Math.round((stats.pods.running / (stats.pods.total || 1)) * 100)} 
                sx={{ 
                  height: 6, 
                  borderRadius: 3, 
                  bgcolor: 'rgba(255,255,255,0.04)',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
                    borderRadius: 3
                  }
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Stability */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card className="glass glass-hover" elevation={0}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Typography variant="caption" color="rgba(255,255,255,0.5)" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Stability Index
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(167, 139, 250, 0.1)', display: 'flex' }}>
                  <Globe size={18} color="#a78bfa" />
                </Box>
              </Stack>
              <Typography variant="h4" fontWeight="850" color="white" sx={{ mb: 0.75 }}>
                {isSystemHealthy ? "100%" : "85%"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                {stats.pods.failed} Failed • {stats.pods.pending} Pending Pods
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={isSystemHealthy ? 100 : 85} 
                sx={{ 
                  height: 6, 
                  borderRadius: 3, 
                  bgcolor: 'rgba(255,255,255,0.04)',
                  '& .MuiLinearProgress-bar': {
                    background: isSystemHealthy 
                      ? 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)' 
                      : 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
                    borderRadius: 3
                  }
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Automation Brain */}
        <Grid item xs={12} sm={6} lg={3}>
          <Card className="glass glass-hover" elevation={0}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Typography variant="caption" color="rgba(255,255,255,0.5)" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Autonomous Status
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(245, 158, 11, 0.1)', display: 'flex' }}>
                  <Zap size={18} color="#f59e0b" />
                </Box>
              </Stack>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, mb: 1.5 }}>
                {loading ? (
                  <Skeleton width={100} height={36} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                ) : (
                  <Chip 
                    label={settings?.clusters?.length > 0 ? "ACTIVE" : "INACTIVE"} 
                    sx={{ 
                      background: settings?.clusters?.length > 0 
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.05) 100%)' 
                        : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(248, 113, 113, 0.05) 100%)', 
                      color: settings?.clusters?.length > 0 ? '#34d399' : '#f87171',
                      border: settings?.clusters?.length > 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                      fontSize: '0.75rem', 
                      fontWeight: 800,
                      height: 28,
                      px: 0.5,
                      boxShadow: settings?.clusters?.length > 0 ? '0 0 16px rgba(16, 185, 129, 0.1)' : '0 0 16px rgba(239, 68, 68, 0.1)'
                    }} 
                  />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.2 }}>
                Avg Recovery: <Box component="span" sx={{ color: 'white', fontWeight: 700 }}>{stats.avg_resolution_time}</Box>
              </Typography>
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
                  borderRadius: 1,
                  height: "100%",
                  border: "1px solid rgba(148, 163, 184, 0.12)",
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 3 }}
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
                          borderRadius: 1,
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
                          borderRadius: 1,
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
                          borderRadius: 1,
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
                          borderRadius: 1,
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
                              {pendingApprovalsCount}
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
                  borderRadius: 1,
                  height: "100%",
                  border: "1px solid rgba(148, 163, 184, 0.12)",
                }}
              >
                <CardContent sx={{ p: 3 }}>
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
                          borderRadius: 1,
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
                              borderRadius: 1,
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
                                      (incident.pod?.name || incident.pod_name
                                        ? `Incident: ${incident.pod?.name || incident.pod_name}`
                                        : "Unknown Incident")}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    display="block"
                                    color="text.secondary"
                                  >
                                    {incident.pod?.namespace || incident.namespace || "default"} |{" "}
                                    {incident.pod?.reason || incident.type || "Error"}
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
