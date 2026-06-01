'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  CheckCircle, 
  AlertTriangle, 
  Play, 
  Pause, 
  FileText, 
  History, 
  Wrench, 
  Loader2, 
  Check, 
  X, 
  Cpu, 
  CheckCircle2,
  Server
} from 'lucide-react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  Container,
  Paper,
  Stack,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Snackbar,
  Alert
} from '@mui/material';
import { kubiApi } from '@/lib/api';

function RemediationContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('plan_id');
  const podName = searchParams.get('pod');
  const namespace = searchParams.get('namespace');

  const [plans, setPlans] = useState<any[]>([]);
  const [failedIncidents, setFailedIncidents] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' as 'success' | 'error' | 'info' });

  const fetchPlans = async () => {
    try {
      const [plansRes, incidentsRes, settingsRes] = await Promise.all([
        kubiApi.getPlans(),
        kubiApi.getIncidents(),
        kubiApi.getSettings().catch(() => null)
      ]);
      setPlans(plansRes.plans || []);
      // Filter incidents where AI analysis failed
      const failed = (incidentsRes.incidents || []).filter((inc: any) => inc.ai_failed && inc.status === 'active');
      setFailedIncidents(failed);
      if (settingsRes) {
        setClusters(settingsRes.clusters || []);
      }
    } catch (error) {
      console.error("Failed to fetch remediation data:", error);
      setPlans([]);
      setFailedIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleApprove = async (planId: string) => {
    setActionLoading(planId);
    try {
      const res = await kubiApi.approvePlan(planId);
      if (res.status === 'error') {
        throw new Error(res.message || "Approval failed");
      }
      setSnackbar({ open: true, message: 'Remediation plan approved and executing!', severity: 'success' });
      await fetchPlans();
    } catch (err: any) {
      console.error("Approval failed:", err);
      setSnackbar({ open: true, message: err.message || "Failed to approve remediation plan.", severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (planId: string) => {
    setActionLoading(planId);
    try {
      await kubiApi.rejectPlan(planId);
      setSnackbar({ open: true, message: 'Remediation plan rejected.', severity: 'info' });
      await fetchPlans();
    } catch (err: any) {
      console.error("Rejection failed:", err);
      setSnackbar({ open: true, message: "Failed to reject plan.", severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = (plan: any) => {
    setSelectedPlan(plan);
    setDialogOpen(true);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, pb: 16 }}>
      {/* Page Header */}
      <Stack 
        direction={{ xs: 'column', sm: 'row' }} 
        justifyContent="space-between" 
        alignItems={{ xs: 'flex-start', sm: 'flex-end' }} 
        spacing={2} 
        sx={{ mb: 6 }}
      >
        <Box>
          <Typography 
            variant="h4" 
            fontWeight="900" 
            color="white" 
            gutterBottom
            sx={{
              letterSpacing: '-1.5px',
              background: 'linear-gradient(135deg, #ffffff 30%, #a5f3fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Remediation Plans
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
            Review, authorize, and track AI-generated recovery operations
          </Typography>
        </Box>
        
        <Button 
          variant="outlined" 
          startIcon={<History size={16} />}
          sx={{ 
            borderRadius: 2.5, 
            textTransform: 'none', 
            borderColor: 'rgba(255,255,255,0.06)', 
            color: 'rgba(255,255,255,0.65)',
            bgcolor: 'rgba(255,255,255,0.01)',
            fontWeight: 600,
            fontSize: '0.8rem',
            '&:hover': {
              borderColor: 'rgba(255,255,255,0.15)',
              bgcolor: 'rgba(255,255,255,0.04)',
              color: '#ffffff'
            }
          }}
        >
          Execution History
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ py: 15, textAlign: 'center' }}>
          <Loader2 className="animate-spin text-primary" size={48} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontWeight: 500 }}>
            Loading active incident playbooks...
          </Typography>
        </Box>
      ) : clusters.length === 0 ? (
        <Paper 
          sx={{ 
            py: 12, 
            textAlign: 'center', 
            bgcolor: 'rgba(15, 23, 42, 0.25)', 
            borderRadius: 4, 
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            maxWidth: '620px',
            margin: '40px auto'
          }}
        >
          <AlertTriangle size={48} style={{ opacity: 0.85, margin: '0 auto 16px', color: '#f59e0b' }} />
          <Typography fontWeight="800" color="white" gutterBottom sx={{ fontSize: '1.25rem', letterSpacing: '-0.3px' }}>
            No Connected Clusters
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, px: 6, lineHeight: 1.6 }}>
            Please connect to a Kubernetes cluster connection to begin monitoring incidents and generating autonomous remediation plans.
          </Typography>
          <Button
            variant="contained"
            onClick={() => window.location.href = '/dashboard/configure'}
            sx={{
              borderRadius: 2.5,
              textTransform: 'none',
              px: 4.5,
              py: 1.25,
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)',
              '&:hover': {
                background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                transform: 'translateY(-1px)',
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.35)'
              },
              transition: 'all 0.2s ease'
            }}
          >
            Configure Cluster Connection
          </Button>
        </Paper>
      ) : plans.length === 0 && failedIncidents.length === 0 ? (
        <Paper 
          sx={{ 
            py: 12, 
            textAlign: 'center', 
            bgcolor: 'rgba(15, 23, 42, 0.25)', 
            borderRadius: 4, 
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <Wrench size={48} style={{ opacity: 0.2, margin: '0 auto 16px', color: '#60a5fa' }} />
          <Typography fontWeight="700" color="white" gutterBottom>No plans pending SRE review</Typography>
          <Typography variant="body2" color="text.secondary">All clusters are fully synchronized and healthy.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          {/* Main Column */}
          <Grid item xs={12} lg={8.5}>
            <Stack spacing={4.5}>
              {/* Failed AI Analyses */}
              {failedIncidents.map((incident) => (
                <Card 
                  key={incident._id} 
                  className="glass glow-error"
                  sx={{ 
                    borderRadius: 4, 
                    borderLeft: '5px solid #ef4444 !important',
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
                      <Box sx={{ p: 1, bgcolor: 'rgba(239, 68, 68, 0.1)', borderRadius: 2 }}>
                        <AlertTriangle className="text-red-400" size={24} />
                      </Box>
                      <Typography variant="h6" fontWeight="bold" color="white">
                        AI Analysis Failed
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, fontSize: '0.85rem', lineHeight: 1.6 }}>
                      The AI SRE agent was unable to compile an autonomous remediation plan for resource <strong>{incident.pod?.name || incident.pod_name || "Unknown Resource"}</strong>.
                    </Typography>
                    <Box sx={{ p: 2.5, bgcolor: 'rgba(2, 6, 23, 0.65)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 3, mb: 3.5 }}>
                      <Typography variant="caption" sx={{ color: '#fca5a5', fontFamily: 'monospace', fontSize: '0.75rem', display: 'block', leading: 1.6 }}>
                        {incident.rca || "Unknown error during analysis"}
                      </Typography>
                    </Box>
                    {incident.error_type === 'API_KEY_BLOCKED' && (
                      <Alert severity="error" variant="outlined" sx={{ borderRadius: 3, mb: 3.5, borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', bgcolor: 'rgba(239,68,68,0.02)' }}>
                        Your Gemini API key appears to be blocked. Please check your cloud quotas and configuration.
                      </Alert>
                    )}
                    <Button 
                      variant="contained" 
                      onClick={() => kubiApi.triggerScan()}
                      sx={{ 
                        borderRadius: 2.5, 
                        textTransform: 'none',
                        px: 4,
                        py: 1.2,
                        fontWeight: 'bold',
                        background: 'linear-gradient(135deg, #ef4444 0%, #f43f5e 100%)',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.2)'
                      }}
                    >
                      Retry Incident Scan
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {/* Active Plans */}
              {plans.map((plan) => {
                const isTargetPod = podName && plan.plan?.actions?.some((a: any) => a.target_name === podName);
                const isHighlighted = plan.plan_id === highlightId || isTargetPod;
                const isPending = plan.status === 'pending_approval';
                
                // Set color scheme based on status
                const getStatusMeta = () => {
                  if (plan.status === 'pending_approval') return { color: '#f59e0b', shadow: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b' };
                  if (plan.status.startsWith('failed') || plan.status === 'rejected') return { color: '#ef4444', shadow: 'rgba(239, 68, 68, 0.1)', border: '#ef4444' };
                  return { color: '#10b981', shadow: 'rgba(16, 185, 129, 0.1)', border: '#10b981' };
                };
                const statusMeta = getStatusMeta();

                return (
                  <Card 
                    key={plan.plan_id} 
                    className={`glass`}
                    sx={{ 
                      borderRadius: 4, 
                      borderLeft: `5px solid ${statusMeta.color} !important`,
                      boxShadow: isHighlighted ? `0 0 30px ${statusMeta.shadow}` : 'none',
                      borderColor: isHighlighted ? statusMeta.border : 'rgba(255,255,255,0.06)',
                      position: 'relative',
                      '&:hover': {
                        borderColor: isHighlighted ? statusMeta.border : 'rgba(255,255,255,0.12)',
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    {isHighlighted && !highlightId && (
                      <Box sx={{ 
                        position: 'absolute', 
                        top: 0, 
                        right: 0, 
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', 
                        color: 'white', 
                        px: 2, 
                        py: 0.6, 
                        borderBottomLeftRadius: 16,
                        fontSize: '0.65rem',
                        fontWeight: '800',
                        letterSpacing: '0.5px',
                        zIndex: 1,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                      }}>
                        TARGET MATCHED
                      </Box>
                    )}
                    <CardContent sx={{ p: { xs: 3.5, sm: 4.5 } }}>
                      {/* Top Badges and Title */}
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3.5 }}>
                        <Box>
                          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                            <Chip 
                              label={plan.status.replace('_', ' ')} 
                              size="small" 
                              sx={{ 
                                textTransform: 'uppercase', 
                                fontWeight: '900', 
                                fontSize: '0.65rem',
                                color: statusMeta.color,
                                borderColor: `${statusMeta.color}44`,
                                bgcolor: `${statusMeta.color}08`,
                                border: '1px solid'
                              }} 
                            />
                            {plan.generated_by === 'ai' && (
                              <Chip 
                                label="AI Generated" 
                                size="small" 
                                sx={{ 
                                  bgcolor: 'rgba(96, 165, 250, 0.08)', 
                                  color: '#60a5fa', 
                                  fontWeight: '900', 
                                  fontSize: '0.65rem',
                                  border: '1px solid rgba(96, 165, 250, 0.15)',
                                  boxShadow: '0 0 10px rgba(96,165,250,0.05)'
                                }} 
                              />
                            )}
                            {plan.tokens_consumed > 0 && (
                              <Chip 
                                label={`${plan.tokens_consumed.toLocaleString()} Tokens`}
                                size="small" 
                                sx={{ 
                                  bgcolor: 'rgba(56, 189, 248, 0.08)', 
                                  color: '#38bdf8', 
                                  fontWeight: '900', 
                                  fontSize: '0.65rem',
                                  border: '1px solid rgba(56, 189, 248, 0.15)',
                                  boxShadow: '0 0 10px rgba(56,189,248,0.05)'
                                }} 
                              />
                            )}
                            {plan.cluster_id && (
                              <Chip 
                                icon={<Server size={12} style={{ color: 'inherit' }} />}
                                label={clusters.find(c => c.id === plan.cluster_id || c.agent_cluster_id === plan.cluster_id)?.name || plan.cluster_id} 
                                size="small" 
                                sx={{ 
                                  bgcolor: 'rgba(167, 139, 250, 0.08)', 
                                  color: '#c084fc', 
                                  fontWeight: '900', 
                                  fontSize: '0.65rem',
                                  border: '1px solid rgba(167, 139, 250, 0.15)',
                                  boxShadow: '0 0 10px rgba(167,139,250,0.05)',
                                  '& .MuiChip-icon': {
                                    color: 'inherit',
                                    marginRight: '4px',
                                    marginLeft: '4px'
                                  }
                                }} 
                              />
                            )}
                          </Stack>
                          <Typography variant="h5" fontWeight="800" color="white" sx={{ mb: 0.5, letterSpacing: '-0.5px' }}>
                            {plan.plan?.summary || "Remediation Proposal"}
                          </Typography>
                          {(plan.pod_name || plan.namespace) && (
                            <Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ mb: 1.5, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 500 }}>
                              <span>Deployment/Pod: <strong style={{ color: '#ffffff' }}>{plan.pod_name || 'N/A'}</strong></span>
                              <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                              <span>Namespace: <strong style={{ color: '#ffffff' }}>{plan.namespace || 'default'}</strong></span>
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', opacity: 0.6 }}>
                            ID: {plan.plan_id.slice(0, 8)}
                          </Typography>
                        </Box>
                        {plan.status === 'completed' && <CheckCircle2 className="text-emerald-400" size={32} />}
                      </Stack>

                      {/* Timeline Sequence Steps */}
                      <Box sx={{ mb: 4.5 }}>
                        <Typography 
                          variant="caption" 
                          color="text.secondary" 
                          fontWeight="800" 
                          sx={{ textTransform: 'uppercase', mb: 2.5, display: 'block', letterSpacing: '0.8px' }}
                        >
                          Proposed Execution Steps
                        </Typography>
                        
                        <Stack spacing={2} sx={{ position: 'relative', pl: 1 }}>
                          {plan.plan?.actions?.slice(0, 3).map((action: any, i: number) => (
                            <Paper 
                              key={i} 
                              sx={{ 
                                p: 2.5, 
                                bgcolor: 'rgba(255,255,255,0.01)', 
                                border: '1px solid rgba(255,255,255,0.04)', 
                                borderRadius: 3,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2.5,
                                '&:hover': {
                                  bgcolor: 'rgba(255,255,255,0.02)',
                                  borderColor: 'rgba(255,255,255,0.08)'
                                },
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <Box 
                                sx={{ 
                                  width: 28, 
                                  height: 28, 
                                  borderRadius: 1.5, 
                                  bgcolor: `${statusMeta.color}08`, 
                                  border: `1px solid ${statusMeta.color}25`,
                                  color: statusMeta.color,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: '900',
                                  fontFamily: 'monospace',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {i + 1}
                              </Box>
                              <Box>
                                <Typography variant="body2" color="white" fontWeight="600" sx={{ mb: 0.5 }}>
                                  {action.action_type.replace('_', ' ')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  Target: <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{action.target_name}</strong> ({action.namespace})
                                </Typography>
                              </Box>
                            </Paper>
                          ))}
                          {plan.plan?.actions?.length > 3 && (
                            <Button 
                              variant="text" 
                              size="small" 
                              onClick={() => handleViewDetails(plan)}
                              sx={{ textTransform: 'none', color: '#60a5fa', fontWeight: 'bold', alignSelf: 'flex-start', ml: 1 }}
                            >
                              +{plan.plan.actions.length - 3} more sequence steps
                            </Button>
                          )}
                        </Stack>
                      </Box>

                      {/* Approval buttons */}
                      {isPending && (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
                          <Button 
                            fullWidth 
                            variant="contained" 
                            startIcon={actionLoading === plan.plan_id ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                            onClick={() => handleApprove(plan.plan_id)}
                            disabled={actionLoading !== null}
                            sx={{ 
                              py: 1.5, 
                              borderRadius: 3, 
                              fontWeight: '800', 
                              textTransform: 'none',
                              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                              boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.4)',
                              '&:hover': {
                                boxShadow: '0 12px 24px -2px rgba(59, 130, 246, 0.5)'
                              }
                            }}
                          >
                            Approve and Execute
                          </Button>
                          <Button 
                            variant="outlined" 
                            color="error"
                            onClick={() => handleReject(plan.plan_id)}
                            disabled={actionLoading !== null}
                            sx={{ 
                              px: 4, 
                              py: 1.5,
                              borderRadius: 3, 
                              textTransform: 'none', 
                              borderColor: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              bgcolor: 'rgba(239, 68, 68, 0.02)',
                              fontWeight: 700,
                              '&:hover': {
                                borderColor: '#ef4444',
                                bgcolor: 'rgba(239, 68, 68, 0.08)'
                              }
                            }}
                          >
                            {actionLoading === plan.plan_id ? <Loader2 className="animate-spin" size={18} /> : <X size={18} />}
                          </Button>
                        </Stack>
                      )}

                      {/* Failure / Rejection custom panels */}
                      {(plan.status.startsWith('failed') || plan.status === 'rejected') && (
                        <Box 
                          sx={{ 
                            mt: 3.5, 
                            p: 3, 
                            borderRadius: 4, 
                            border: plan.status === 'rejected' ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)', 
                            bgcolor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.02)' : 'rgba(239, 68, 68, 0.02)' 
                          }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                            <AlertTriangle className={plan.status === 'rejected' ? "text-amber-400" : "text-red-400"} size={20} />
                            <Typography variant="subtitle2" fontWeight="900" color="white">
                              {plan.status === 'rejected' ? 'Remediation Proposal Rejected' : `Remediation Failed (${plan.status.replace('_', ' ')})`}
                            </Typography>
                          </Stack>
                          
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, fontSize: '0.85rem', lineHeight: 1.6 }}>
                            {plan.status === 'rejected' 
                              ? 'This plan was rejected. You can trigger a new scan to let the AI re-analyze, or use the manual intervention steps below.'
                              : 'The automated remediation plan was executed but failed verification or execution. You can retry the AI scan to re-analyze, or use the manual quick-action buttons below.'
                            }
                          </Typography>
                          
                          <Stack spacing={3}>
                            {/* Retry Analysis Button upgraded to premium submit styles */}
                            <Button 
                              variant="contained" 
                              startIcon={actionLoading === `retry-${plan.plan_id}` ? <Loader2 className="animate-spin" size={16} /> : <Cpu size={16} />}
                              onClick={async () => {
                                setActionLoading(`retry-${plan.plan_id}`);
                                try {
                                  await kubiApi.triggerScan();
                                  setSnackbar({ open: true, message: 'AI scan triggered successfully! Re-analyzing incident...', severity: 'success' });
                                  await fetchPlans();
                                } catch (err: any) {
                                  setSnackbar({ open: true, message: err.message || 'Failed to trigger scan.', severity: 'error' });
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              disabled={actionLoading !== null}
                              sx={{ 
                                py: 1.5, 
                                borderRadius: 3, 
                                fontWeight: '800', 
                                textTransform: 'none',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                                boxShadow: '0 8px 24px -4px rgba(59, 130, 246, 0.4)',
                                '&:hover': {
                                  boxShadow: '0 12px 28px -2px rgba(59, 130, 246, 0.5), 0 0 16px rgba(139, 92, 246, 0.2)',
                                  transform: 'translateY(-1px)',
                                  opacity: 0.95
                                }
                              }}
                            >
                              {actionLoading === `retry-${plan.plan_id}` ? 'Retrying scan...' : 'Retry AI Analysis & Generate New Plan'}
                            </Button>
                            
                            {plan.plan?.actions && plan.plan.actions.length > 0 && (
                              <>
                                <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.06)' }} />
                                
                                <Typography 
                                  variant="caption" 
                                  color="text.secondary" 
                                  sx={{ fontWeight: '800', textTransform: 'uppercase', mb: 1, display: 'block', letterSpacing: '0.8px' }}
                                >
                                  Manual Intervention Actions
                                </Typography>
                                
                                <Stack direction="row" flexWrap="wrap" gap={1.5}>
                                  {plan.plan.actions.map((action: any, i: number) => {
                                    const actionKey = `${plan.plan_id}-manual-${i}`;
                                    let btnText = '';
                                    if (action.action_type === 'restart_pod') btnText = `Restart Pod ${action.target_name}`;
                                    else if (action.action_type === 'restart_deployment') btnText = `Restart Deployment ${action.target_name}`;
                                    else if (action.action_type === 'rollback_deployment') btnText = `Rollback Deployment ${action.target_name}`;
                                    else if (action.action_type === 'trigger_gitlab_pipeline') btnText = `Trigger GitLab Pipeline`;
                                    else btnText = `Run ${action.action_type} on ${action.target_name}`;

                                    return (
                                      <Button
                                        key={i}
                                        variant="outlined"
                                        color={plan.status === 'rejected' ? "warning" : "error"}
                                        size="small"
                                        startIcon={actionLoading === actionKey ? <Loader2 className="animate-spin" size={14} /> : <Wrench size={14} />}
                                        onClick={async () => {
                                          setActionLoading(actionKey);
                                          try {
                                            const res = await kubiApi.executeManualAction({
                                              action_type: action.action_type,
                                              target_name: action.target_name,
                                              namespace: action.namespace,
                                              cluster_id: plan.cluster_id || null,
                                              reason: 'Manual user intervention'
                                            });
                                            setSnackbar({ open: true, message: res.message || 'Action executed successfully!', severity: 'success' });
                                            await fetchPlans();
                                          } catch (err: any) {
                                            setSnackbar({ open: true, message: err.message || 'Action execution failed.', severity: 'error' });
                                          } finally {
                                            setActionLoading(null);
                                          }
                                        }}
                                        disabled={actionLoading !== null}
                                        sx={{ 
                                          borderRadius: 2.5, 
                                          textTransform: 'none', 
                                          fontFamily: 'monospace',
                                          fontSize: '0.75rem',
                                          borderColor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                                          color: plan.status === 'rejected' ? '#f59e0b' : '#ef4444',
                                          bgcolor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                                          fontWeight: 'bold',
                                          '&:hover': {
                                            borderColor: plan.status === 'rejected' ? '#f59e0b' : '#ef4444',
                                            bgcolor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                                            boxShadow: plan.status === 'rejected' ? '0 0 12px rgba(245, 158, 11, 0.15)' : '0 0 12px rgba(239, 68, 68, 0.15)',
                                            transform: 'translateY(-1px)'
                                          },
                                          transition: 'all 0.2s ease'
                                        }}
                                      >
                                        {btnText}
                                      </Button>
                                    );
                                  })}
                                </Stack>
                              </>
                            )}
                          </Stack>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Grid>

          {/* Context Sidebar */}
          <Grid item xs={12} lg={3.5}>
            <Card 
              className="glass"
              sx={{ 
                borderRadius: 4, 
                border: '1px solid rgba(255,255,255,0.06)',
                position: 'sticky',
                top: 96
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h6" fontWeight="800" color="white" gutterBottom sx={{ letterSpacing: '-0.3px' }}>
                  Context Intelligence
                </Typography>
                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.06)' }} />
                <Stack spacing={3}>
                  <Box 
                    sx={{ 
                      p: 2.5, 
                      borderRadius: 3, 
                      bgcolor: 'rgba(16, 185, 129, 0.05)', 
                      border: '1px solid rgba(16, 185, 129, 0.15)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 2,
                      boxShadow: '0 0 16px rgba(16, 185, 129, 0.03)'
                    }}
                  >
                    <Cpu className="text-emerald-400" size={20} />
                    <Typography variant="body2" fontWeight="600" color="emerald.100" sx={{ fontSize: '0.8rem' }}>
                      AI Agent: Operational
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
                    Remediation plans are generated autonomously based on real-time container log analysis and K8s deployment structures. Approving a proposal safely patch-injects configurations and triggers structured rolling updates with instant cluster-health diagnostics.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Plan Details Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'rgba(9, 13, 22, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
            borderRadius: 4
          }
        }}
      >
        {selectedPlan && (
          <>
            <DialogTitle sx={{ color: 'white', px: 4, pt: 4 }}>
              <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '-0.5px' }}>
                {selectedPlan.plan?.summary || "Plan Details"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                ID: {selectedPlan.plan_id}
              </Typography>
            </DialogTitle>
            <DialogContent sx={{ px: 4 }}>
              <Stack spacing={3} sx={{ mt: 2 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" color="white" sx={{ mb: 2 }}>
                    Proposed Sequence Details
                  </Typography>
                  <Stack spacing={2}>
                    {selectedPlan.plan?.actions?.map((action: any, i: number) => (
                      <Paper 
                        key={i} 
                        sx={{ 
                          p: 2.5, 
                          bgcolor: 'rgba(255,255,255,0.01)', 
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 3
                        }}
                      >
                        <Typography variant="subtitle2" color="primary.main" fontWeight="bold" sx={{ mb: 0.5 }}>
                          {action.action_type.replace('_', ' ')}
                        </Typography>
                        <Typography variant="body2" color="white" fontWeight="600" sx={{ mb: 1 }}>
                          Target: {action.target_name} ({action.namespace})
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', leading: 1.5 }}>
                          {action.reasoning}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 4, pt: 2 }}>
              <Button onClick={() => setDialogOpen(false)} sx={{ color: 'text.secondary', fontWeight: 'bold' }}>
                Close
              </Button>
              {selectedPlan.status === 'pending_approval' && (
                <Button 
                  variant="contained" 
                  color="success" 
                  onClick={() => { handleApprove(selectedPlan.plan_id); setDialogOpen(false); }}
                  sx={{ borderRadius: 2.5, fontWeight: 'bold', textTransform: 'none', px: 3 }}
                >
                  Approve Now
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          sx={{ 
            width: '100%',
            borderRadius: 3,
            bgcolor: snackbar.severity === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
            color: 'white',
            fontWeight: 'bold',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            '& .MuiAlert-icon': {
              color: 'white'
            }
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default function RemediationPage() {
  return (
    <Suspense fallback={<Box sx={{ py: 10, textAlign: 'center' }}><Loader2 className="animate-spin text-primary" size={48} /></Box>}>
      <RemediationContent />
    </Suspense>
  );
}
