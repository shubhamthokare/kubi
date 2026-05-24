'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Shield, Database, Zap, Mail, Webhook, Clock, User, Lock, Globe, Eye, Terminal, Save, Loader2, CheckCircle2 } from 'lucide-react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  Container,
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
  CircularProgress
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
  
  // Real Settings State
  const [settings, setSettings] = useState({
    namespaces: ['default'],
    scan_interval: 30,
    gemini_model: 'models/gemini-2.5-pro',
    gitlab_enabled: false,
    kubeconfig: '',
    gemini_api_key: '',
    gitlab_api_url: '',
    gitlab_private_token: '',
    chatops_enabled: false,
    chatops_provider: 'slack',
    chatops_webhook_url: ''
  });

  // Connection Test States
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ status: 'success' | 'error' | 'blocked' | 'invalid' | null; message: string }>({ status: null, message: '' });
  
  const [testingGitLab, setTestingGitLab] = useState(false);
  const [gitlabTestResult, setGitlabTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });

  const [testingChatOps, setTestingChatOps] = useState(false);
  const [chatopsTestResult, setChatopsTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });

  // Mockup States (kept for UI completeness)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);

  useEffect(() => {
    fetchSettings();
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
        gitlab_enabled: !!data.gitlab_enabled,
        kubeconfig: data.kubeconfig || '',
        gemini_api_key: data.gemini_api_key || '',
        gitlab_api_url: data.gitlab_api_url || '',
        gitlab_private_token: data.gitlab_private_token || '',
        chatops_enabled: !!data.chatops_enabled,
        chatops_provider: data.chatops_provider || 'slack',
        chatops_webhook_url: data.chatops_webhook_url || ''
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
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="white" gutterBottom>
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
            borderRadius: 2,
            px: 4,
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
          <Card elevation={0} sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                      <Grid size={{ xs: 12, md: 6 }}>
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
                      <Grid size={{ xs: 12, md: 6 }}>
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
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', opacity: 0.6 }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Avatar sx={{ bgcolor: '#0055ff' }}>E</Avatar>
                                <Box>
                                  <Typography variant="body1" color="white" fontWeight="medium">Elastic Stack</Typography>
                                  <Typography variant="caption" color="text.secondary">Coming Soon</Typography>
                                </Box>
                              </Stack>
                              <Button disabled variant="outlined" size="small" sx={{ borderRadius: 2 }}>Connect</Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
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
    </Container>
  );
}
