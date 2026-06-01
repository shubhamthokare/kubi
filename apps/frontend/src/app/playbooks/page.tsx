'use client';

import React, { useState, useEffect } from 'react';
import { Play, Trash2, Plus, Terminal, Code, Cpu, Info, CheckCircle, AlertTriangle, FileCode } from 'lucide-react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import { kubiApi } from '@/lib/api';
import { SreCard, SreConsole } from '@/components/ui/sre-layout';

interface Playbook {
  playbook_id: string;
  name: string;
  description: string;
  script_type: 'yaml_manifest' | 'python_script';
  content: string;
  created_at?: string;
  updated_at?: string;
}

const TEMPLATES = {
  python_script: `# Sandboxed Python Playbook
# Access the active kubernetes service interface using 'k8s'
try:
    resources = k8s.get_all_resources()
    pods = resources.get("pods", [])
    namespaces = resources.get("namespaces", [])
    
    print("==================================================")
    print("🚨 KUBI AUTONOMOUS SRE: DIAGNOSTIC AUDIT REPORT")
    print("==================================================")
    print(f"Total Namespaces Monitored: {len(namespaces)}")
    print(f"Total Workload Pods Active: {len(pods)}")
    print("--------------------------------------------------")
    
    unhealthy_pods = [p for p in pods if p.get("status") != "Running"]
    if unhealthy_pods:
        print(f"⚠️ FOUND {len(unhealthy_pods)} UNHEALTHY WORKLOADS:")
        for idx, p in enumerate(unhealthy_pods, 1):
            print(f"  {idx}. Pod: {p['namespace']}/{p['name']} | Status: {p['status']}")
    else:
        print("✅ ALL WORKLOAD PODS RUNNING EXCELLENTLY!")
        
    print("==================================================")
except Exception as e:
    print(f"❌ Playbook execution failed: {str(e)}")
`,
  yaml_manifest: `apiVersion: v1
kind: ConfigMap
metadata:
  name: kubi-sre-diagnostic-config
  namespace: default
data:
  operator: "kubi-autonomous-sre"
  environment: "staging-cluster-1"
  monitored_namespaces: "default,kubi"
  scan_frequency_seconds: "15"
  remediation_mode: "safe-approval"
`,
};

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Execution Console State
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string>('');
  const [consoleTitle, setConsoleTitle] = useState<string>('');
  
  // Creation Dialog State
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'yaml_manifest' | 'python_script'>('python_script');
  const [newContent, setNewContent] = useState(TEMPLATES.python_script);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // View Spec Dialog State
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);

  const fetchPlaybooks = async () => {
    try {
      const res = await kubiApi.listPlaybooks();
      setPlaybooks(res.playbooks || []);
    } catch (err: any) {
      console.error('Failed to load playbooks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  const handleTypeChange = (type: 'yaml_manifest' | 'python_script') => {
    setNewType(type);
    setNewContent(TEMPLATES[type]);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) {
      setFormError('Please fill in both the Playbook Name and script specifications.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await kubiApi.createPlaybook({
        name: newName,
        description: newDesc,
        script_type: newType,
        content: newContent,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setNewType('python_script');
      setNewContent(TEMPLATES.python_script);
      fetchPlaybooks();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record the playbook spec.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you absolutely sure you want to delete this Operator Playbook?')) return;
    try {
      await kubiApi.deletePlaybook(id);
      fetchPlaybooks();
    } catch (err: any) {
      alert(`Delete operation failed: ${err.message}`);
    }
  };

  const handleExecute = async (playbook: Playbook, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutingId(playbook.playbook_id);
    setConsoleLogs(`[System] Initializing context on cluster connection...\n[System] Dispatching sandboxed execution request for playbook "${playbook.name}"...\n\n`);
    setConsoleTitle(playbook.name);
    setConsoleOpen(true);
    
    try {
      const res = await kubiApi.executePlaybook(playbook.playbook_id);
      setConsoleLogs(prev => prev + (res.message || 'Playbook executed successfully. (No output returned)'));
    } catch (err: any) {
      setConsoleLogs(prev => prev + `❌ EXECUTION ERROR:\n${err.message || 'Failed to complete playbook run.'}`);
    } finally {
      setExecutingId(null);
    }
  };

  const handleViewSpec = (playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setViewOpen(true);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 6 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4" fontWeight="bold" color="white" gutterBottom>
              Operator Playbooks
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure and dispatch direct Python scripts and Kubernetes manifests to automate SRE cluster remediation
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
            sx={{ px: 3, py: 1.2, borderRadius: 2.5, fontWeight: 'bold' }}
          >
            Create Playbook
          </Button>
        </Stack>
      </Box>

      {loading ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <CircularProgress color="primary" size={48} />
        </Box>
      ) : playbooks.length === 0 ? (
        <Paper
          sx={{
            py: 8,
            px: 4,
            bgcolor: 'background.paper',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.05)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Code size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
          <Typography variant="h6" fontWeight="bold" color="white" gutterBottom>
            No Operator Playbooks Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxW: 450, mb: 3 }}>
            Operator playbooks allow you to save automation and diagnostics tasks. Create one using our sandboxed Python wrapper or simple YAML specs to get started.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setCreateOpen(true)}
            sx={{ borderRadius: 2 }}
          >
            Configure First Playbook
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {playbooks.map((p) => (
            <Grid item xs={12} md={6} lg={4} key={p.playbook_id}>
              <SreCard
                onClick={() => handleViewSpec(p)}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    borderColor: 'rgba(96, 165, 250, 0.2)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                  },
                }}
              >
                <CardContent sx={{ p: 3, flexGrow: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                    <Typography variant="h6" fontWeight="bold" color="white" sx={{ lineClamp: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </Typography>
                    <Chip
                      icon={p.script_type === 'python_script' ? <FileCode size={12} /> : <Code size={12} />}
                      label={p.script_type === 'python_script' ? 'Python Script' : 'YAML Spec'}
                      size="small"
                      variant="outlined"
                      color={p.script_type === 'python_script' ? 'secondary' : 'primary'}
                      sx={{ fontSize: '0.7rem', fontWeight: 'bold' }}
                    />
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 3,
                      height: 40,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {p.description || 'No script metadata provided.'}
                  </Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', my: 2 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    ID: {p.playbook_id.substring(0, 8)}...
                  </Typography>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.01)' }}>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<Trash2 size={14} />}
                    onClick={(e) => handleDelete(p.playbook_id, e)}
                    sx={{ textTransform: 'none' }}
                  >
                    Delete
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color={executingId === p.playbook_id ? 'warning' : 'success'}
                    startIcon={executingId === p.playbook_id ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
                    disabled={executingId !== null}
                    onClick={(e) => handleExecute(p, e)}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 'bold' }}
                  >
                    {executingId === p.playbook_id ? 'Running...' : 'Execute'}
                  </Button>
                </CardActions>
              </SreCard>
            </Grid>
          ))}
        </Grid>
      )}

      {/* CREATION DIALOG */}
      <Dialog
        open={createOpen}
        onClose={() => !submitting && setCreateOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.08)',
          },
        }}
      >
        <DialogTitle sx={{ color: 'white', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          Create Operator Playbook
        </DialogTitle>
        <DialogContent sx={{ p: 3, mt: 1 }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={3}>
            <TextField
              label="Playbook Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="e.g. Audit Stale PVC Storage"
              disabled={submitting}
            />
            <TextField
              label="Description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="SRE automated audit checking storage claims status..."
              disabled={submitting}
              multiline
              rows={2}
            />
            <FormControl fullWidth>
              <InputLabel id="script-type-label">Automation Sandbox Type</InputLabel>
              <Select
                labelId="script-type-label"
                value={newType}
                label="Automation Sandbox Type"
                onChange={(e) => handleTypeChange(e.target.value as any)}
                disabled={submitting}
              >
                <MenuItem value="python_script">Python Sandboxed Script (with k8s client context)</MenuItem>
                <MenuItem value="yaml_manifest">Kubernetes Spec YAML Manifest</MenuItem>
              </Select>
            </FormControl>

            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Terminal size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
                  Playbook Source Specifications
                </Typography>
              </Stack>
              <TextField
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                fullWidth
                multiline
                rows={10}
                placeholder={newType === 'python_script' ? 'print("Ready...")' : 'apiVersion: v1'}
                disabled={submitting}
                inputProps={{
                  style: {
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    color: '#38bdf8',
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#020617',
                    border: '1px solid rgba(255,255,255,0.05)',
                  },
                }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setCreateOpen(false)} disabled={submitting} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={submitting}
            sx={{ px: 3, borderRadius: 2, fontWeight: 'bold' }}
          >
            {submitting ? 'Recording Spec...' : 'Record Spec'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* VIEW SPEC DIALOG */}
      <Dialog
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.08)',
          },
        }}
      >
        <DialogTitle sx={{ color: 'white', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight="bold" color="white" sx={{ mb: 0.5 }}>
              {selectedPlaybook?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Playbook ID: {selectedPlaybook?.playbook_id}
            </Typography>
          </Box>
          {selectedPlaybook && (
            <Chip
              label={selectedPlaybook.script_type === 'python_script' ? 'Python Sandboxed' : 'YAML Spec'}
              size="small"
              variant="outlined"
              color={selectedPlaybook.script_type === 'python_script' ? 'secondary' : 'primary'}
            />
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 3, mt: 1 }}>
          <Stack spacing={3}>
            {selectedPlaybook?.description && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Info size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
                  <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
                    Description
                  </Typography>
                </Stack>
                <Typography variant="body2" color="white" sx={{ px: 1 }}>
                  {selectedPlaybook.description}
                </Typography>
              </Box>
            )}

            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Terminal size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
                <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
                  Script Content
                </Typography>
              </Stack>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: '#020617',
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: '#38bdf8',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '40vh',
                  overflowY: 'auto',
                }}
              >
                {selectedPlaybook?.content}
              </Paper>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setViewOpen(false)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={executingId === selectedPlaybook?.playbook_id ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
            disabled={executingId !== null || !selectedPlaybook}
            onClick={(e) => {
              if (selectedPlaybook) {
                setViewOpen(false);
                handleExecute(selectedPlaybook, e);
              }
            }}
            sx={{ px: 3, borderRadius: 2, fontWeight: 'bold' }}
          >
            {executingId === selectedPlaybook?.playbook_id ? 'Running...' : 'Execute'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* EXECUTION CONSOLE DIALOG */}
      <Dialog
        open={consoleOpen}
        onClose={() => executingId === null && setConsoleOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#020617',
            backgroundImage: 'none',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      >
        <DialogTitle sx={{ color: 'white', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Terminal size={20} className="text-emerald-400" />
            <Typography variant="h6" fontWeight="bold" color="white">
              Playbook Run: {consoleTitle}
            </Typography>
          </Stack>
          <Chip
            label={executingId !== null ? 'RUNNING' : 'COMPLETED'}
            color={executingId !== null ? 'warning' : 'success'}
            size="small"
            sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
          />
        </DialogTitle>
        <DialogContent sx={{ p: 3, mt: 1, minHeight: '30vh', display: 'flex', flexDirection: 'column' }}>
          <SreConsole
            sx={{
              flexGrow: 1,
              whiteSpace: 'pre-wrap',
              maxHeight: '50vh',
            }}
          >
            {consoleLogs}
          </SreConsole>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Button
            onClick={() => setConsoleOpen(false)}
            disabled={executingId !== null}
            sx={{
              color: 'white',
              borderColor: 'rgba(255,255,255,0.1)',
              '&:disabled': {
                color: 'rgba(255,255,255,0.3)',
              },
            }}
          >
            Close Console
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
