'use client';

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  Divider, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemText,
  CircularProgress,
  Chip,
  IconButton,
  Paper
} from '@mui/material';
import { 
  FileText, 
  Calendar, 
  Clock, 
  ChevronRight, 
  Download, 
  Share2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { kubiApi } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const data = await kubiApi.getReports();
      setReports(data.reports || []);
      if (data.reports && data.reports.length > 0) {
        setSelectedReport(data.reports[0]);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress sx={{ color: '#60a5fa' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 120px)' }}>
      {/* Sidebar: List of Reports */}
      <Box sx={{ width: 320, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'white', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <FileText size={24} className="text-blue-400" />
          Postmortems
        </Typography>
        
        <Card sx={{ 
          flex: 1, 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column',
          background: 'rgba(30, 41, 59, 0.5)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 3
        }}>
          <List sx={{ p: 0, overflowY: 'auto' }}>
            {reports.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>No reports generated yet.</Typography>
              </Box>
            ) : (
              reports.map((report) => (
                <React.Fragment key={report._id}>
                  <ListItem disablePadding>
                    <ListItemButton 
                      selected={selectedReport?._id === report._id}
                      onClick={() => setSelectedReport(report)}
                      sx={{
                        py: 2,
                        '&.Mui-selected': {
                          background: 'rgba(96, 165, 250, 0.1)',
                          borderLeft: '4px solid #60a5fa',
                        },
                        '&:hover': {
                          background: 'rgba(255, 255, 255, 0.05)',
                        }
                      }}
                    >
                      <ListItemText 
                        primary={
                          <Typography sx={{ fontWeight: 600, color: selectedReport?._id === report._id ? '#60a5fa' : 'white', fontSize: '0.9rem' }}>
                            {report.incident_id}
                          </Typography>
                        }
                        secondary={
                          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Calendar size={12} className="text-slate-400" />
                            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                              {new Date(report.created_at).toLocaleDateString()}
                            </Typography>
                          </Box>
                        }
                      />
                      <ChevronRight size={16} className="text-slate-500" />
                    </ListItemButton>
                  </ListItem>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                </React.Fragment>
              ))
            )}
          </List>
        </Card>
      </Box>

      {/* Main Content: Report Detail */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <AnimatePresence mode="wait">
          {selectedReport ? (
            <motion.div
              key={selectedReport._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: 'white', mb: 0.5 }}>
                    Incident Postmortem
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Chip 
                      icon={<CheckCircle2 size={14} />} 
                      label="REMEDIATED" 
                      size="small" 
                      sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontWeight: 600, border: '1px solid rgba(34, 197, 94, 0.2)' }} 
                    />
                    <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Clock size={14} />
                      Generated at: {new Date(selectedReport.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <IconButton sx={{ color: 'rgba(255,255,255,0.6)', bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <Share2 size={18} />
                  </IconButton>
                  <IconButton sx={{ color: 'rgba(255,255,255,0.6)', bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <Download size={18} />
                  </IconButton>
                </Box>
              </Box>

              <Card sx={{ 
                flex: 1, 
                p: 4, 
                overflowY: 'auto',
                background: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                '& .prose': {
                  color: 'rgba(255, 255, 255, 0.9)',
                  '& h1, h2, h3, h4': { color: '#60a5fa', fontWeight: 700, mt: 3, mb: 2 },
                  '& p': { mb: 2, lineHeight: 1.7 },
                  '& code': { bgcolor: 'rgba(255,255,255,0.1)', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.9em' },
                  '& ul, ol': { pl: 3, mb: 2 },
                  '& li': { mb: 1 }
                }
              }}>
                <div className="prose">
                  <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
                </div>
              </Card>
            </motion.div>
          ) : (
            <Box sx={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center', 
              alignItems: 'center',
              background: 'rgba(30, 41, 59, 0.3)',
              borderRadius: 4,
              border: '2px dashed rgba(255,255,255,0.1)'
            }}>
              <AlertCircle size={48} className="text-slate-600 mb-4" />
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                Select a report to view details
              </Typography>
            </Box>
          )}
        </AnimatePresence>
      </Box>
    </Box>
  );
}
