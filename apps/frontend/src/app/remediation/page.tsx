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
  CheckCircle2 
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
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' as 'success' | 'error' | 'info' });

  const fetchPlans = async () => {
    try {
      const [plansRes, incidentsRes] = await Promise.all([
        kubiApi.getPlans(),
        kubiApi.getIncidents()
      ]);
      setPlans(plansRes.plans || []);
      // Filter incidents where AI analysis failed
      const failed = (incidentsRes.incidents || []).filter((inc: any) => inc.ai_failed && inc.status === 'active');
      setFailedIncidents(failed);
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
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mb: 6 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="white" gutterBottom>
            Remediation Plans
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review and authorize AI-generated recovery operations
          </Typography>
        </Box>
        
        <Button 
          variant="outlined" 
          startIcon={<History size={18} />}
          sx={{ borderRadius: 2, textTransform: 'none', borderColor: 'rgba(255,255,255,0.1)', color: 'text.secondary' }}
        >
          Execution History
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <Loader2 className="animate-spin text-primary" size={48} />
        </Box>
      ) : plans.length === 0 && failedIncidents.length === 0 ? (
        <Paper sx={{ py: 10, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
          <Wrench size={48} style={{ opacity: 0.1, margin: '0 auto 16px' }} />
          <Typography color="text.secondary">No plans pending review.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          <Grid item xs={12} lg={8}>
            <Stack spacing={3}>
              {/* Failed AI Analyses */}
              {failedIncidents.map((incident) => (
                <Card 
                  key={incident._id} 
                  sx={{ 
                    bgcolor: 'rgba(239, 68, 68, 0.05)', 
                    borderRadius: 3, 
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                      <AlertTriangle className="text-red-400" size={24} />
                      <Typography variant="h6" fontWeight="bold" color="white">AI Analysis Failed</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      The AI agent was unable to generate a remediation plan for <strong>{incident.pod.name}</strong>.
                    </Typography>
                    <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, mb: 3 }}>
                      <Typography variant="caption" sx={{ color: 'red', fontFamily: 'monospace' }}>
                        {incident.rca || "Unknown error during analysis"}
                      </Typography>
                    </Box>
                    {incident.error_type === 'API_KEY_BLOCKED' && (
                      <Alert severity="error" variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
                        Your Gemini API key appears to be blocked. Please update it in your configuration.
                      </Alert>
                    )}
                    <Button 
                      variant="contained" 
                      color="primary"
                      onClick={() => kubiApi.triggerScan()}
                      sx={{ borderRadius: 2, textTransform: 'none' }}
                    >
                      Retry Scan
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {plans.map((plan) => {
                const isTargetPod = podName && plan.plan?.actions?.some((a: any) => a.target_name === podName);
                const isHighlighted = plan.plan_id === highlightId || isTargetPod;
                const isPending = plan.status === 'pending_approval';

                return (
                  <Card 
                    key={plan.plan_id} 
                    sx={{ 
                      bgcolor: 'background.paper', 
                      borderRadius: 3, 
                      border: `1px solid ${isHighlighted ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: isHighlighted ? '0 0 20px rgba(59, 130, 246, 0.15)' : 'none',
                      transition: 'all 0.3s ease',
                      position: 'relative'
                    }}
                  >
                    {isHighlighted && !highlightId && (
                      <Box sx={{ 
                        position: 'absolute', 
                        top: 0, 
                        right: 0, 
                        bgcolor: 'primary.main', 
                        color: 'white', 
                        px: 1.5, 
                        py: 0.5, 
                        borderBottomLeftRadius: 12,
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        zIndex: 1
                      }}>
                        TARGET MATCH
                      </Box>
                    )}
                    <CardContent sx={{ p: 4 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                        <Box>
                           <Chip 
                            label={plan.status.replace('_', ' ')} 
                            size="small" 
                            color={
                              plan.status === 'pending_approval' ? "warning" :
                              plan.status.startsWith('failed') || plan.status === 'rejected' ? "error" :
                              "success"
                            } 
                            variant="outlined" 
                            sx={{ textTransform: 'uppercase', fontWeight: 'bold', mb: 1.5, mr: 1 }} 
                          />
                          {plan.generated_by === 'ai' && (
                            <Chip 
                              label="AI Generated" 
                              size="small" 
                              color="info"
                              variant="filled"
                              sx={{ 
                                bgcolor: 'rgba(59, 130, 246, 0.15)', 
                                color: '#60a5fa', 
                                fontWeight: 'bold', 
                                mb: 1.5,
                                border: '1px solid rgba(59, 130, 246, 0.3)'
                              }} 
                            />
                          )}
                          <Typography variant="h5" fontWeight="bold" color="white">
                            {plan.plan?.summary || "Remediation Proposal"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {plan.plan_id.slice(0, 8)}
                          </Typography>
                        </Box>
                        {plan.status === 'completed' && <CheckCircle2 className="text-emerald-400" size={32} />}
                      </Stack>

                      <Box sx={{ mb: 4 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase', mb: 2, display: 'block' }}>
                          Proposed Sequence
                        </Typography>
                        <Stack spacing={2}>
                          {plan.plan?.actions?.slice(0, 3).map((action: any, i: number) => (
                            <Paper key={i} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                              <Typography variant="body2" color="white">
                                <strong>Step {i + 1}:</strong> {action.action_type} on {action.target_name}
                              </Typography>
                            </Paper>
                          ))}
                          {plan.plan?.actions?.length > 3 && (
                            <Button variant="text" size="small" onClick={() => handleViewDetails(plan)}>
                              +{plan.plan.actions.length - 3} more steps
                            </Button>
                          )}
                        </Stack>
                      </Box>

                       {isPending && (
                        <Stack direction="row" spacing={2}>
                          <Button 
                            fullWidth 
                            variant="contained" 
                            startIcon={actionLoading === plan.plan_id ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />}
                            onClick={() => handleApprove(plan.plan_id)}
                            disabled={actionLoading !== null}
                            sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold', textTransform: 'none' }}
                          >
                            Approve and Execute
                          </Button>
                          <Button 
                            variant="outlined" 
                            color="error"
                            onClick={() => handleReject(plan.plan_id)}
                            disabled={actionLoading !== null}
                            sx={{ px: 4, borderRadius: 2, textTransform: 'none', borderColor: 'rgba(248, 113, 113, 0.2)' }}
                          >
                            {actionLoading === plan.plan_id ? <Loader2 className="animate-spin" size={18} /> : <X size={20} />}
                          </Button>
                        </Stack>
                      )}

                      {(plan.status.startsWith('failed') || plan.status === 'rejected') && (
                        <Box sx={{ mt: 3, p: 3, borderRadius: 3, border: plan.status === 'rejected' ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)', bgcolor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.02)' : 'rgba(239, 68, 68, 0.02)' }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <AlertTriangle className={plan.status === 'rejected' ? "text-amber-400" : "text-red-400"} size={18} />
                            <Typography variant="subtitle2" fontWeight="bold" color="white">
                              {plan.status === 'rejected' ? 'Remediation Proposal Rejected' : `Remediation Failed (${plan.status.replace('_', ' ')})`}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            {plan.status === 'rejected' 
                              ? 'This plan was rejected. You can trigger a new scan to let the AI re-analyze, or use the manual actions below.'
                              : 'The automated remediation plan was executed but failed verification or execution. You can retry the AI scan to re-analyze, or use the manual quick-action buttons below.'
                            }
                          </Typography>
                          
                          <Stack spacing={2}>
                            <Button 
                              variant="contained" 
                              color="primary"
                              startIcon={actionLoading === `retry-${plan.plan_id}` ? <Loader2 className="animate-spin" size={18} /> : <Cpu size={18} />}
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
                              sx={{ py: 1.2, borderRadius: 2, fontWeight: 'bold', textTransform: 'none' }}
                            >
                              {actionLoading === `retry-${plan.plan_id}` ? 'Retrying scan...' : 'Retry AI Analysis & Generate New Plan'}
                            </Button>
                            
                            {plan.plan?.actions && plan.plan.actions.length > 0 && (
                              <>
                                <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />
                                
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', textTransform: 'uppercase', mb: 1, display: 'block' }}>
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
                                        startIcon={actionLoading === actionKey ? <Loader2 className="animate-spin" size={16} /> : <Wrench size={16} />}
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
                                          borderRadius: 2, 
                                          textTransform: 'none', 
                                          borderColor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                          color: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.9)' : 'rgba(239, 68, 68, 0.9)',
                                          '&:hover': {
                                            borderColor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(239, 68, 68, 0.5)',
                                            bgcolor: plan.status === 'rejected' ? 'rgba(245, 158, 11, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                                          }
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

          <Grid item xs={12} lg={4}>
            <Card sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                  Context Intelligence
                </Typography>
                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                <Stack spacing={3}>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Cpu className="text-emerald-400" size={20} />
                    <Typography variant="body2" color="emerald.100">AI Agent: Operational</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Plans are generated based on real-time pod metrics and deployment history. Approving a plan initiates a multi-step recovery sequence with health verification.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Plan Details Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        {selectedPlan && (
          <>
            <DialogTitle sx={{ bgcolor: 'background.paper', color: 'white' }}>
              <Typography variant="h6" fontWeight="bold">{selectedPlan.plan?.summary || "Plan Details"}</Typography>
              <Typography variant="caption" color="text.secondary">ID: {selectedPlan.plan_id}</Typography>
            </DialogTitle>
            <DialogContent sx={{ bgcolor: 'background.paper' }}>
              <Stack spacing={3} sx={{ mt: 2 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" color="white" sx={{ mb: 2 }}>Proposed Actions</Typography>
                  <Stack spacing={2}>
                    {selectedPlan.plan?.actions?.map((action: any, i: number) => (
                      <Paper key={i} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="subtitle2" color="primary.main">{action.action_type}</Typography>
                        <Typography variant="body2" color="white">{action.target_name} ({action.namespace})</Typography>
                        <Typography variant="caption" color="text.secondary">{action.reasoning}</Typography>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'background.paper', p: 3 }}>
              <Button onClick={() => setDialogOpen(false)} sx={{ color: 'text.secondary' }}>Close</Button>
              {selectedPlan.status === 'pending_approval' && (
                <Button variant="contained" color="success" onClick={() => { handleApprove(selectedPlan.plan_id); setDialogOpen(false); }}>
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
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
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
