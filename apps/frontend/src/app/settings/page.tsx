'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Shield, Database, Zap, Mail, Webhook, Clock, User, Lock, Globe, Eye, Terminal, Save, Loader2, CheckCircle2, Briefcase, Users, Trash2 } from 'lucide-react';
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
  Switch,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Avatar,
  Tabs,
  Tab,
  Grid,
  Alert,
  Snackbar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import { kubiApi } from '@/lib/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function SettingsPage() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete account.');
      }
      
      localStorage.removeItem('access_token');
      localStorage.removeItem('username');
      localStorage.removeItem('active_cluster_id');
      window.location.href = '/register';
    } catch (error: any) {
      alert(error.message || 'An error occurred during account deletion.');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };
  
  // Real Settings State
  const [settings, setSettings] = useState({
    namespaces: ['default'],
    scan_interval: 30,
    gemini_model: 'models/gemini-2.5-pro',
    token_profile: 'moderate',
    gitlab_enabled: false,
    kubeconfig: '',
    gemini_api_key: '',
    gitlab_api_url: '',
    gitlab_private_token: '',
    chatops_enabled: false,
    chatops_provider: 'slack',
    chatops_webhook_url: '',
    token_quota: 100000,
    token_usage: 0
  });

  // Connection Test States
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ status: 'success' | 'error' | 'blocked' | 'invalid' | null; message: string }>({ status: null, message: '' });
  
  const [testingGitLab, setTestingGitLab] = useState(false);
  const [gitlabTestResult, setGitlabTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });

  const [testingChatOps, setTestingChatOps] = useState(false);
  const [chatopsTestResult, setChatopsTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });

  // 👥 Workspace & Teams State
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [newWsName, setNewWsName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [wsLoading, setWsLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchMembers = async (wsId: string) => {
    if (!wsId) return;
    try {
      setMembersLoading(true);
      const list = await kubiApi.getWorkspaceMembers(wsId);
      setMembers(list || []);
    } catch (error) {
      console.error("Failed to fetch workspace members:", error);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (activeWorkspaceId) {
      fetchMembers(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  // 🔑 Linked SSO Identities State
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  // 🔎 Elasticsearch Diagnostics State
  const [esHealth, setEsHealth] = useState<any>(null);
  const [esLoading, setEsLoading] = useState(false);
  const [testingEs, setTestingEs] = useState(false);
  const [esTestResult, setEsTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });

  // Mockup States (kept for UI completeness)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);

  const fetchWorkspaces = async () => {
    try {
      setWsLoading(true);
      const list = await kubiApi.getWorkspaces();
      setWorkspaces(list || []);
      const stored = localStorage.getItem('active_workspace_id');
      if (stored) {
        setActiveWorkspaceId(stored);
      } else if (list && list.length > 0) {
        setActiveWorkspaceId(list[0].id);
        localStorage.setItem('active_workspace_id', list[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch workspaces:", error);
    } finally {
      setWsLoading(false);
    }
  };

  const fetchLinkedAccounts = async () => {
    try {
      setLinkedLoading(true);
      const list = await kubiApi.getLinkedAccounts();
      setLinkedAccounts(list || []);
    } catch (error) {
      console.error("Failed to fetch linked accounts:", error);
    } finally {
      setLinkedLoading(false);
    }
  };

  const fetchEsHealth = async () => {
    try {
      setEsLoading(true);
      const res = await kubiApi.getEsHealth();
      setEsHealth(res);
    } catch (error) {
      console.error("Failed to fetch ES health:", error);
      setEsHealth({ status: 'offline', message: 'Elasticsearch connection failed' });
    } finally {
      setEsLoading(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    try {
      setWsLoading(true);
      const res = await kubiApi.createWorkspace(newWsName);
      setNewWsName('');
      await fetchWorkspaces();
      
      if (res && res.id) {
        const switchRes = await kubiApi.switchWorkspace(res.id);
        if (switchRes && switchRes.access_token) {
          localStorage.setItem("access_token", switchRes.access_token);
          localStorage.setItem("active_workspace_id", switchRes.workspace_id);
          localStorage.removeItem("active_cluster_id");
          window.location.reload();
        }
      }
    } catch (err) {
      console.error("Failed to create workspace:", err);
      alert("Failed to create workspace.");
    } finally {
      setWsLoading(false);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim() || !activeWorkspaceId) return;
    try {
      setInviting(true);
      await kubiApi.inviteWorkspaceMember(activeWorkspaceId, inviteEmail, inviteRole);
      setInviteEmail('');
      alert(`Invitation successfully sent to ${inviteEmail}!`);
      await fetchMembers(activeWorkspaceId);
    } catch (err: any) {
      console.error("Failed to invite member:", err);
      alert(err.message || "Failed to send workspace invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeMember = async (userId: string) => {
    if (!activeWorkspaceId) return;
    if (!confirm("Are you absolutely sure you want to revoke this user's access?")) return;
    try {
      await kubiApi.revokeWorkspaceMember(activeWorkspaceId, userId);
      alert("Member access successfully revoked.");
      await fetchMembers(activeWorkspaceId);
    } catch (err: any) {
      console.error("Failed to revoke member:", err);
      alert(err.message || "Failed to revoke member access.");
    }
  };

  const handleUnlinkAccount = async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect your ${provider} login provider?`)) return;
    try {
      setLinkedLoading(true);
      await kubiApi.unlinkAccount(provider);
      await fetchLinkedAccounts();
      alert(`Successfully disconnected your ${provider} credentials.`);
    } catch (err: any) {
      console.error("Failed to unlink account:", err);
      alert(err.message || `Failed to disconnect your ${provider} account.`);
    } finally {
      setLinkedLoading(false);
    }
  };

  const handleValidateEs = async () => {
    try {
      setTestingEs(true);
      setEsTestResult({ status: null, message: '' });
      const res = await kubiApi.validateEs();
      setEsTestResult({ status: res.status === 'success' ? 'success' : 'error', message: res.message });
      await fetchEsHealth();
    } catch (err: any) {
      console.error("Failed to validate ES:", err);
      setEsTestResult({ status: 'error', message: err.message || 'Validation failed.' });
    } finally {
      setTestingEs(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchWorkspaces();
    fetchLinkedAccounts();
    fetchEsHealth();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await kubiApi.getSettings();
      
      let modelVal = data.gemini_model || 'models/gemini-2.5-pro';
      if (modelVal && !modelVal.startsWith('models/')) {
        modelVal = `models/${modelVal}`;
      }

      setSettings({
        namespaces: data.namespaces || ['default'],
        scan_interval: data.scan_interval || 30,
        gemini_model: modelVal,
        token_profile: data.token_profile || 'moderate',
        gitlab_enabled: !!data.gitlab_enabled,
        kubeconfig: data.kubeconfig || '',
        gemini_api_key: data.gemini_api_key || '',
        gitlab_api_url: data.gitlab_api_url || '',
        gitlab_private_token: data.gitlab_private_token || '',
        chatops_enabled: !!data.chatops_enabled,
        chatops_provider: data.chatops_provider || 'slack',
        chatops_webhook_url: data.chatops_webhook_url || '',
        token_quota: data.token_quota !== undefined ? data.token_quota : 100000,
        token_usage: data.token_usage !== undefined ? data.token_usage : 0
      });
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestGemini = async () => {
    try {
      setTestingGemini(true);
      setGeminiTestResult({ status: null, message: '' });
      const res = await kubiApi.validateGemini({ gemini_api_key: settings.gemini_api_key });
      setGeminiTestResult({ status: res.status, message: res.message });
    } catch (error: any) {
      setGeminiTestResult({ status: 'error', message: error.message || 'Validation failed.' });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestGitLab = async () => {
    try {
      setTestingGitLab(true);
      setGitlabTestResult({ status: null, message: '' });
      const res = await kubiApi.validateGitLab({
        gitlab_api_url: settings.gitlab_api_url,
        gitlab_private_token: settings.gitlab_private_token
      });
      setGitlabTestResult({ status: res.status === 'success' ? 'success' : 'error', message: res.message });
    } catch (error: any) {
      setGitlabTestResult({ status: 'error', message: error.message || 'Validation failed.' });
    } finally {
      setTestingGitLab(false);
    }
  };

  const handleTestChatOps = async () => {
    try {
      setTestingChatOps(true);
      setChatopsTestResult({ status: null, message: '' });
      const res = await kubiApi.validateChatOps({
        chatops_provider: settings.chatops_provider,
        chatops_webhook_url: settings.chatops_webhook_url
      });
      setChatopsTestResult({ status: res.status === 'success' ? 'success' : 'error', message: res.message });
    } catch (error: any) {
      setChatopsTestResult({ status: 'error', message: error.message || 'Validation failed.' });
    } finally {
      setTestingChatOps(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await kubiApi.updateSettings(settings);
      setShowSuccess(true);
    } catch (error) {
      console.error("Failed to update settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ py: 0 }}>
      {/* Header */}
      <Box className="ops-page-header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'flex-end' }, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={850} color="white" gutterBottom sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}>
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure your autonomous operations platform
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          startIcon={saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          onClick={handleSave}
          disabled={saving}
          sx={{ 
            borderRadius: 1,
            px: 3,
            py: 1,
            textTransform: 'none',
            fontWeight: 'bold',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid size={12}>
          <Card elevation={0} sx={{ bgcolor: 'rgba(15,23,42,0.62)', borderRadius: 1, border: '1px solid rgba(148,163,184,0.12)' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange} 
                sx={{ 
                  px: 2,
                  '& .MuiTab-root': { color: 'text.secondary', py: 2 },
                  '& .Mui-selected': { color: 'primary.main' }
                }}
              >
                <Tab icon={<User size={18} />} iconPosition="start" label="General" />
                <Tab icon={<Bell size={18} />} iconPosition="start" label="Notifications" />
                <Tab icon={<Zap size={18} />} iconPosition="start" label="AI & Automation" />
                <Tab icon={<Database size={18} />} iconPosition="start" label="Integrations" />
                <Tab icon={<Briefcase size={18} />} iconPosition="start" label="Workspace & Team" />
                <Tab icon={<Lock size={18} />} iconPosition="start" label="Identity & Security" />
              </Tabs>
            </Box>

            {/* General Settings */}
            <TabPanel value={tabValue} index={0}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={4}>
                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Cluster Context
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Define which parts of your infrastructure Kubi AI should monitor.
                    </Typography>
                    
                    <Grid container spacing={3}>
                      <Grid size={{ xs: 12, md: 8 }}>
                        <TextField
                          fullWidth
                          label="Monitored Namespaces"
                          placeholder="default, production, staging"
                          value={settings.namespaces.join(', ')}
                          onChange={(e) => setSettings({ ...settings, namespaces: e.target.value.split(',').map(s => s.trim()) })}
                          variant="outlined"
                          helperText="Comma-separated list of namespaces"
                          sx={{ 
                            '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' },
                            '& .MuiFormHelperText-root': { color: 'text.secondary' }
                          }}
                        />
                      </Grid>
                    </Grid>
                  </Box>

                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      System Profile
                    </Typography>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Stack direction="row" alignItems="center" spacing={3} sx={{ mb: 3 }}>
                      <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        K
                      </Avatar>
                      <Box>
                        <Typography variant="h6" color="white" fontWeight="medium">
                          Kubi Autonomous Agent
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Version 0.1.0-alpha • Connected to Local Cluster
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="#ef4444" gutterBottom>
                      Danger Zone
                    </Typography>
                    <Divider sx={{ my: 2, borderColor: 'rgba(239, 68, 68, 0.2)' }} />
                    <Card sx={{ bgcolor: 'rgba(239, 68, 68, 0.04)', borderRadius: 1, border: '1px solid rgba(239, 68, 68, 0.18)', p: 2 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                        <Box sx={{ textAlign: 'left' }}>
                          <Typography variant="body1" color="white" fontWeight="semibold">Delete SRE Account</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Permanently delete your account, owned workspaces, and all associated cluster mappings. This action is irreversible.
                          </Typography>
                        </Box>
                        <Button
                          variant="contained"
                          color="error"
                          onClick={() => setDeleteDialogOpen(true)}
                          sx={{
                            borderRadius: 1,
                            px: 3,
                            py: 1.2,
                            textTransform: 'none',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                            '&:hover': {
                              bgcolor: '#dc2626',
                              boxShadow: '0 6px 16px rgba(239, 68, 68, 0.3)',
                            }
                          }}
                        >
                          Delete Account
                        </Button>
                      </Stack>
                    </Card>
                  </Box>
                </Stack>
              </CardContent>
            </TabPanel>

            {/* Notifications */}
            <TabPanel value={tabValue} index={1}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={3}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Alert Channels
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Configure how you want to be notified of autonomous incident and remediation actions.
                    </Typography>
                  </Box>
                  
                  {/* Email Alerts Card */}
                  <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }}>
                          <Mail size={22} color="white" />
                        </Box>
                        <Box>
                          <Typography variant="body1" color="white" fontWeight="semibold">Email Postmortems</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Receive professional PDF postmortems and critical alerts via email.
                          </Typography>
                        </Box>
                      </Stack>
                      <Switch checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} color="primary" />
                    </Stack>
                  </Box>

                  {/* ChatOps Webhook Alerts Card */}
                  <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderLeft: settings.chatops_enabled ? '4px solid #10B981' : '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: settings.chatops_enabled ? 3 : 0 }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }}>
                          <Webhook size={22} color="white" />
                        </Box>
                        <Box>
                          <Typography variant="body1" color="white" fontWeight="semibold">ChatOps Webhooks</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Stream real-time incident updates & autonomous actions to Slack, Teams, or Discord.
                          </Typography>
                        </Box>
                      </Stack>
                      <Switch 
                        checked={settings.chatops_enabled} 
                        onChange={(e) => setSettings({ ...settings, chatops_enabled: e.target.checked })} 
                        color="success" 
                      />
                    </Stack>

                    {settings.chatops_enabled && (
                      <Box sx={{ mt: 2, pt: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Grid container spacing={3}>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <FormControl fullWidth>
                              <InputLabel id="chatops-provider-label" sx={{ color: 'text.secondary' }}>Platform Provider</InputLabel>
                              <Select
                                labelId="chatops-provider-label"
                                value={settings.chatops_provider}
                                label="Platform Provider"
                                onChange={(e) => setSettings({ ...settings, chatops_provider: e.target.value })}
                                sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', color: 'white' }}
                              >
                                <MenuItem value="slack">Slack</MenuItem>
                                <MenuItem value="teams">Microsoft Teams</MenuItem>
                                <MenuItem value="discord">Discord</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid size={{ xs: 12, md: 8 }}>
                            <TextField
                              fullWidth
                              label="Incoming Webhook URL"
                              type="password"
                              placeholder="https://hooks.slack.com/services/..."
                              value={settings.chatops_webhook_url}
                              onChange={(e) => setSettings({ ...settings, chatops_webhook_url: e.target.value })}
                              variant="outlined"
                              sx={{ 
                                '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' }
                              }}
                            />
                          </Grid>

                          <Grid size={12}>
                            <Button
                              variant="outlined"
                              onClick={handleTestChatOps}
                              disabled={testingChatOps || !settings.chatops_webhook_url}
                              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
                            >
                              {testingChatOps ? <CircularProgress size={20} sx={{ mr: 1 }} /> : 'Send Test Notification'}
                            </Button>
                          </Grid>
                        </Grid>

                        {chatopsTestResult.status && (
                          <Alert 
                            severity={chatopsTestResult.status === 'success' ? 'success' : 'error'} 
                            sx={{ mt: 2, borderRadius: 2 }}
                          >
                            {chatopsTestResult.message}
                          </Alert>
                        )}
                      </Box>
                    )}
                  </Box>
                  
                  <Alert severity="info" sx={{ bgcolor: 'rgba(2, 136, 209, 0.1)', color: '#90caf9', border: '1px solid rgba(2, 136, 209, 0.2)', mt: 1 }}>
                    All incident summaries and remediation reports sent to alert channels are fully sanitized for SRE and Snyk security compliance.
                  </Alert>
                </Stack>
              </CardContent>
            </TabPanel>


            {/* AI & Automation */}
            <TabPanel value={tabValue} index={2}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={4}>
                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Brain Configuration
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Select the LLM that powers root cause analysis and remediation planning.
                    </Typography>
                    
                    <Grid container spacing={3}>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <FormControl fullWidth>
                          <InputLabel id="model-label" sx={{ color: 'text.secondary' }}>Gemini Model</InputLabel>
                          <Select 
                            labelId="model-label" 
                            value={settings.gemini_model} 
                            label="Gemini Model"
                            onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
                            sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', color: 'white' }}
                          >
                            <MenuItem value="models/gemini-2.5-flash">Gemini 2.5 Flash (Fast)</MenuItem>
                            <MenuItem value="models/gemini-2.5-pro">Gemini 2.5 Pro (Standard)</MenuItem>
                            <MenuItem value="models/gemini-2.0-flash">Gemini 2.0 Flash</MenuItem>
                            <MenuItem value="models/gemini-2.0-flash-001">Gemini 2.0 Flash (001)</MenuItem>
                            <MenuItem value="models/gemini-2.0-flash-lite-001">Gemini 2.0 Flash Lite (001)</MenuItem>
                            <MenuItem value="models/gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <FormControl fullWidth>
                          <InputLabel id="interval-label" sx={{ color: 'text.secondary' }}>Scan Interval</InputLabel>
                          <Select 
                            labelId="interval-label" 
                            value={settings.scan_interval} 
                            label="Scan Interval"
                            onChange={(e) => setSettings({ ...settings, scan_interval: Number(e.target.value) })}
                            sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', color: 'white' }}
                          >
                            <MenuItem value={15}>15 Seconds</MenuItem>
                            <MenuItem value={30}>30 Seconds</MenuItem>
                            <MenuItem value={60}>1 Minute</MenuItem>
                            <MenuItem value={300}>5 Minutes</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <FormControl fullWidth>
                          <InputLabel id="token-profile-label" sx={{ color: 'text.secondary' }}>Gemini Token Usage</InputLabel>
                          <Select 
                            labelId="token-profile-label" 
                            value={settings.token_profile || 'moderate'} 
                            label="Gemini Token Usage"
                            onChange={(e) => setSettings({ ...settings, token_profile: e.target.value })}
                            sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', color: 'white' }}
                          >
                            <MenuItem value="less">Less (Ultra-Concise, minimal tokens)</MenuItem>
                            <MenuItem value="moderate">Moderate (Standard, optimal detail)</MenuItem>
                            <MenuItem value="max">Max (Verbose, maximum SRE details)</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>
                    
                    <Grid container spacing={3} sx={{ mt: 1 }}>
                      <Grid size={{ xs: 12, md: 9 }}>
                        <TextField
                          fullWidth
                          label="Gemini API Key"
                          type="password"
                          placeholder="Enter your Gemini API key (masked if already saved)"
                          value={settings.gemini_api_key}
                          onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                          variant="outlined"
                          sx={{ 
                            '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' }
                          }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button
                          variant="outlined"
                          onClick={handleTestGemini}
                          disabled={testingGemini}
                          sx={{ height: 56, borderRadius: 2, textTransform: 'none', fontWeight: 'bold', width: '100%' }}
                        >
                          {testingGemini ? <CircularProgress size={20} /> : 'Test Connection'}
                        </Button>
                      </Grid>
                    </Grid>
                    {geminiTestResult.status && (
                      <Alert 
                        severity={
                          geminiTestResult.status === 'success' 
                            ? 'success' 
                            : geminiTestResult.status === 'blocked' 
                            ? 'warning' 
                            : 'error'
                        } 
                        sx={{ mt: 2, borderRadius: 2 }}
                      >
                        {geminiTestResult.message}
                      </Alert>
                    )}
                  </Box>

                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Autonomous Strategy
                    </Typography>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.1)' }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: 'success.dark', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Zap size={20} color="white" />
                        </Box>
                        <Box>
                          <Typography variant="body1" color="white" fontWeight="medium">Manual Approval Workflow</Typography>
                          <Typography variant="caption" color="text.secondary">Currently, all remediation actions require human approval.</Typography>
                        </Box>
                      </Stack>
                      <Chip label="Enforced" size="small" color="success" variant="outlined" />
                    </Stack>
                  </Box>

                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      LLM Token Quota & Usage
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Monitor and adjust your AI token consumption quotas. If the quota is exceeded, the agent will fall back to local rule-based simulation.
                    </Typography>
                    
                    <Paper sx={{ p: 3, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 8 }}>
                          <Stack spacing={2}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="body2" color="text.secondary">Current Token Consumption</Typography>
                              <Typography variant="body2" fontWeight="bold" color={settings.token_usage >= settings.token_quota ? '#EF4444' : '#38bdf8'}>
                                {settings.token_usage.toLocaleString()} / {settings.token_quota.toLocaleString()} Tokens ({((settings.token_usage / Math.max(1, settings.token_quota)) * 100).toFixed(1)}%)
                              </Typography>
                            </Stack>
                            
                            <Box sx={{ width: '100%', height: 10, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                              <Box sx={{ 
                                width: `${Math.min(100, (settings.token_usage / Math.max(1, settings.token_quota)) * 100)}%`, 
                                height: '100%', 
                                bgcolor: settings.token_usage >= settings.token_quota ? '#EF4444' : '#38bdf8',
                                borderRadius: 5,
                                boxShadow: settings.token_usage >= settings.token_quota ? '0 0 10px rgba(239, 68, 68, 0.5)' : '0 0 10px rgba(56, 189, 248, 0.5)',
                                transition: 'width 0.4s ease'
                              }} />
                            </Box>

                            <Stack direction="row" spacing={4} sx={{ mt: 1 }}>
                              <Box>
                                <Typography variant="caption" color="text.secondary" display="block">Remaining Tokens</Typography>
                                <Typography variant="body2" fontWeight="bold" color="white">
                                  {Math.max(0, settings.token_quota - settings.token_usage).toLocaleString()}
                                </Typography>
                              </Box>
                              <Box>
                                <Typography variant="caption" color="text.secondary" display="block">Status</Typography>
                                <Chip 
                                  label={settings.token_usage >= settings.token_quota ? "QUOTA EXCEEDED" : "ACTIVE"} 
                                  size="small" 
                                  sx={{ 
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 'bold',
                                    bgcolor: settings.token_usage >= settings.token_quota ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    color: settings.token_usage >= settings.token_quota ? '#EF4444' : '#10B981',
                                    border: settings.token_usage >= settings.token_quota ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                                  }} 
                                />
                              </Box>
                            </Stack>
                          </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <TextField
                            fullWidth
                            label="Token Quota Limit"
                            type="number"
                            value={settings.token_quota}
                            onChange={(e) => setSettings({ ...settings, token_quota: Math.max(0, Number(e.target.value)) })}
                            variant="outlined"
                            sx={{ 
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' }
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Paper>
                  </Box>
                </Stack>
              </CardContent>
            </TabPanel>

            {/* Integrations */}
            <TabPanel value={tabValue} index={3}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={4}>
                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      External Context
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Connect Kubi to your CI/CD and observability stack.
                    </Typography>
                    
                    <Grid container spacing={3}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Avatar sx={{ bgcolor: '#e24329' }}>G</Avatar>
                                <Box>
                                  <Typography variant="body1" color="white" fontWeight="medium">GitLab CI/CD</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {settings.gitlab_enabled ? 'Active Integration' : 'Disabled'}
                                  </Typography>
                                </Box>
                              </Stack>
                              <Switch 
                                checked={settings.gitlab_enabled} 
                                onChange={(e) => setSettings({ ...settings, gitlab_enabled: e.target.checked })}
                              />
                            </Stack>

                            {settings.gitlab_enabled && (
                              <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <Stack spacing={2}>
                                  <TextField
                                    fullWidth
                                    label="GitLab API URL"
                                    placeholder="https://gitlab.com/api/v4"
                                    value={settings.gitlab_api_url}
                                    onChange={(e) => setSettings({ ...settings, gitlab_api_url: e.target.value })}
                                    variant="outlined"
                                    sx={{ 
                                      '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' }
                                    }}
                                  />
                                  <TextField
                                    fullWidth
                                    label="GitLab Private Token"
                                    type="password"
                                    placeholder="Enter private token (masked if already saved)"
                                    value={settings.gitlab_private_token}
                                    onChange={(e) => setSettings({ ...settings, gitlab_private_token: e.target.value })}
                                    variant="outlined"
                                    sx={{ 
                                      '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' }
                                    }}
                                  />
                                  <Button
                                    variant="outlined"
                                    onClick={handleTestGitLab}
                                    disabled={testingGitLab}
                                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
                                  >
                                    {testingGitLab ? <CircularProgress size={20} /> : 'Test GitLab Connection'}
                                  </Button>
                                  {gitlabTestResult.status && (
                                    <Alert 
                                      severity={gitlabTestResult.status === 'success' ? 'success' : 'error'} 
                                      sx={{ borderRadius: 2 }}
                                    >
                                      {gitlabTestResult.message}
                                    </Alert>
                                  )}
                                </Stack>
                              </Box>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>

                      <Grid size={{ xs: 12, md: 6 }}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Avatar sx={{ bgcolor: '#0055ff' }}>E</Avatar>
                                <Box>
                                  <Typography variant="body1" color="white" fontWeight="medium">Elasticsearch Node</Typography>
                                  <Typography variant="caption" color={esHealth?.status === 'green' || esHealth?.status === 'yellow' ? 'success.main' : 'text.secondary'}>
                                    {esHealth?.status ? `Status: ${esHealth.status.toUpperCase()}` : 'Not Checked'}
                                  </Typography>
                                </Box>
                              </Stack>
                              <Button 
                                variant="outlined" 
                                size="small" 
                                onClick={handleValidateEs}
                                disabled={testingEs}
                                sx={{ borderRadius: 2, textTransform: 'none' }}
                              >
                                {testingEs ? <CircularProgress size={16} /> : 'Test Connection'}
                              </Button>
                            </Stack>
                            
                            {esHealth?.detail && (
                              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  Node Name: {esHealth.detail.name || 'N/A'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  Cluster: {esHealth.detail.cluster_name || 'N/A'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  Version: {esHealth.detail.version?.number || 'N/A'}
                                </Typography>
                              </Box>
                            )}

                            {esTestResult.status && (
                              <Alert 
                                severity={esTestResult.status === 'success' ? 'success' : 'error'} 
                                sx={{ mt: 2, borderRadius: 2 }}
                              >
                                {esTestResult.message}
                              </Alert>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  </Box>


                </Stack>
              </CardContent>
            </TabPanel>

            {/* Workspace & Team */}
            <TabPanel value={tabValue} index={4}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={4}>
                  {/* Workspace Catalog */}
                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Workspace Catalog
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Define tenant organizations and easily toggle between SRE environments.
                    </Typography>

                    <Stack spacing={2} sx={{ mb: 4 }}>
                      {workspaces.map((ws) => (
                        <Paper
                          key={ws.id}
                          sx={{
                            p: 2.5,
                            bgcolor: 'rgba(255,255,255,0.01)',
                            border: ws.id === activeWorkspaceId ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.05)',
                            boxShadow: ws.id === activeWorkspaceId ? '0 0 12px rgba(167, 139, 250, 0.1)' : 'none',
                            borderRadius: 2,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Briefcase size={18} style={{ color: '#a78bfa' }} />
                            <Box>
                              <Typography variant="subtitle2" fontWeight="bold" color="white">{ws.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                Role: <Chip label={ws.role.toUpperCase()} size="small" color={ws.role === 'owner' ? 'secondary' : 'default'} sx={{ height: 16, fontSize: '0.65rem', fontWeight: 'bold' }} />
                              </Typography>
                            </Box>
                          </Stack>
                          {ws.id === activeWorkspaceId && (
                            <Chip label="ACTIVE" size="small" color="primary" variant="filled" sx={{ fontWeight: 'bold', height: 22 }} />
                          )}
                        </Paper>
                      ))}
                    </Stack>

                    <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                    {/* Create Workspace */}
                    <Typography variant="subtitle2" color="white" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                      Create Workspace
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 8 }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="New Workspace Name"
                          placeholder="e.g. Production Cluster Workspace"
                          value={newWsName}
                          onChange={(e) => setNewWsName(e.target.value)}
                          variant="outlined"
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' } }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <Button
                          fullWidth
                          variant="contained"
                          color="secondary"
                          onClick={handleCreateWorkspace}
                          disabled={wsLoading || !newWsName.trim()}
                          sx={{ height: 40, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
                        >
                          {wsLoading ? <CircularProgress size={20} /> : 'Create Workspace'}
                        </Button>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Team Members Directory */}
                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Workspace Collaborators
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Invite SRE peers to collaborate on your clusters and coordinate automated mitigations.
                    </Typography>

                    {/* Invite Collaborator Card */}
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2.5, mb: 3 }}>
                      <Typography variant="subtitle2" color="white" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>
                        Invite SRE Member
                      </Typography>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Email Address"
                            type="email"
                            placeholder="sre-colleague@company.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            variant="outlined"
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' } }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value)}
                              sx={{ borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', color: 'white' }}
                            >
                              <MenuItem value="admin">Admin (Read + Write)</MenuItem>
                              <MenuItem value="member">Member (Read + Write)</MenuItem>
                              <MenuItem value="viewer">Viewer (Read Only)</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                          <Button
                            fullWidth
                            variant="contained"
                            onClick={handleInviteMember}
                            disabled={inviting || !inviteEmail.trim()}
                            sx={{ height: 40, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}
                          >
                            {inviting ? <CircularProgress size={20} /> : 'Send Invite'}
                          </Button>
                        </Grid>
                      </Grid>
                    </Paper>

                    {/* Collaborators List */}
                    <Typography variant="subtitle2" color="white" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>
                      Collaborator Directory
                    </Typography>

                    {membersLoading ? (
                      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={24} color="secondary" />
                      </Box>
                    ) : members.length === 0 ? (
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        No collaborators found for this workspace.
                      </Alert>
                    ) : (
                      <Stack spacing={2}>
                        {members.map((member) => (
                          <Paper
                            key={member.user_id}
                            sx={{
                              p: 2,
                              bgcolor: 'rgba(255,255,255,0.01)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              borderRadius: 2,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <Stack direction="row" spacing={2} alignItems="center">
                              <Avatar sx={{ bgcolor: 'rgba(167, 139, 250, 0.1)', color: '#a78bfa' }}>
                                <User size={18} />
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle2" fontWeight="bold" color="white">
                                  {member.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {member.email}
                                </Typography>
                              </Box>
                            </Stack>
                            <Stack direction="row" spacing={2} alignItems="center">
                              <Chip
                                label={member.role.toUpperCase()}
                                size="small"
                                color={
                                  member.role === 'owner' ? 'secondary' :
                                  member.role === 'admin' ? 'primary' :
                                  'default'
                                }
                                sx={{ fontWeight: 'bold', height: 20, fontSize: '0.65rem' }}
                              />
                              {member.role !== 'owner' && (
                                <Button
                                  variant="text"
                                  color="error"
                                  size="small"
                                  onClick={() => handleRevokeMember(member.user_id)}
                                  sx={{ minWidth: 'auto', p: 0.75, borderRadius: 1.5 }}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              )}
                            </Stack>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </TabPanel>

            {/* Identity & Security */}
            <TabPanel value={tabValue} index={5}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={4}>
                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      SSO Connected Identities
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Connect or disconnect single sign-on profiles linked to your SRE workspace account.
                    </Typography>

                    {linkedLoading ? (
                      <Box sx={{ py: 4, textDecoration: 'center' }}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : linkedAccounts.length === 0 ? (
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        No external SSO providers (GitLab, Google) are currently connected.
                      </Alert>
                    ) : (
                      <Stack spacing={2.5}>
                        {linkedAccounts.map((acct) => (
                          <Paper
                            key={acct.provider}
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
                              <Avatar sx={{ bgcolor: acct.provider === 'gitlab' ? '#e24329' : acct.provider === 'google' ? '#ea4335' : '#1e293b' }}>
                                {acct.provider.charAt(0).toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle2" fontWeight="bold" color="white">
                                  {acct.provider.toUpperCase()} Identity Binding
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Email: {acct.email || 'Linked Account'}
                                </Typography>
                              </Box>
                            </Stack>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => handleUnlinkAccount(acct.provider)}
                              sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 'bold' }}
                            >
                              Disconnect
                            </Button>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  <Box>
                    <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
                      Operator Tokens & Safes
                    </Typography>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                    <Alert severity="warning" sx={{ bgcolor: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderRadius: 2 }}>
                      Keep SRE JWT tokens secure. Regenerating authentication signatures updates active scopes on GKE, GitLab integrations, and Prometheus alert telemetry hooks globally.
                    </Alert>
                  </Box>
                </Stack>
              </CardContent>
            </TabPanel>
          </Card>
        </Grid>
      </Grid>

      <Snackbar 
        open={showSuccess} 
        autoHideDuration={4000} 
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setShowSuccess(false)} 
          severity="success" 
          variant="filled"
          icon={<CheckCircle2 size={20} />}
          sx={{ borderRadius: 2, fontWeight: 'medium' }}
        >
          Configuration updated successfully!
        </Alert>
      </Snackbar>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: '#0f172a',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 3,
            p: 2,
            maxWidth: 450
          }
        }}
      >
        <DialogTitle sx={{ color: 'white', fontWeight: 'bold' }}>
          Delete Account Permanently?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
            Are you absolutely sure you want to delete your account? All workspaces, connection configurations, and SRE credentials will be permanently and irreversibly deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ pt: 2, px: 3 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
            sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAccount}
            disabled={deleting}
            variant="contained"
            color="error"
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 'bold', px: 3 }}
          >
            {deleting ? 'Deleting...' : 'Delete Account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
