"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldAlert,
  Wrench,
  Activity,
  Settings,
  Bell,
  Server,
  ChevronDown,
  LogOut,
  Terminal,
  FileText,
  Briefcase,
} from "lucide-react";
import {
  AppBar,
  Toolbar,
  Typography,
  Stack,
  Box,
  Button,
  IconButton,
  Badge,
  Container,
  Avatar,
  Select,
  MenuItem,
  FormControl,
  Divider,
} from "@mui/material";
import { kubiApi } from "@/lib/api";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Analyzer", path: "/analyzer", icon: Activity },
  { name: "Logs", path: "/logs", icon: Terminal },
  { name: "Incidents", path: "/incidents", icon: ShieldAlert },
  { name: "Remediation", path: "/remediation", icon: Wrench },
  { name: "Playbooks", path: "/playbooks", icon: FileText },
  { name: "Settings", path: "/settings", icon: Settings },
];

export default function Navbar() {
  const pathname = usePathname();
  const [clusters, setClusters] = React.useState<any[]>([]);
  const [activeCluster, setActiveCluster] = React.useState<string>("");
  const [workspaces, setWorkspaces] = React.useState<any[]>([]);
  const [activeWorkspace, setActiveWorkspace] = React.useState<string>("");

  React.useEffect(() => {
    async function loadWorkspaces() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        if (!token) return;
        
        const list = await kubiApi.getWorkspaces();
        setWorkspaces(list || []);

        let activeWsId = localStorage.getItem('active_workspace_id');
        if (!activeWsId) {
          try {
            const decoded = JSON.parse(atob(token.split('.')[1]));
            activeWsId = decoded.workspace_id || '';
            if (activeWsId) {
              localStorage.setItem('active_workspace_id', activeWsId);
            }
          } catch (e) {
            console.error("JWT decoding failed:", e);
          }
        }
        
        if (!activeWsId && list && list.length > 0) {
          activeWsId = list[0].id;
          localStorage.setItem('active_workspace_id', activeWsId);
        }
        
        setActiveWorkspace(activeWsId || "");
      } catch (err) {
        console.error("Failed to load workspaces for navbar:", err);
      }
    }
    loadWorkspaces();
  }, []);

  const handleWorkspaceChange = async (event: any) => {
    const nextWorkspaceId = event.target.value;
    try {
      const res = await kubiApi.switchWorkspace(nextWorkspaceId);
      if (res && res.access_token) {
        localStorage.setItem("access_token", res.access_token);
        localStorage.setItem("active_workspace_id", res.workspace_id);
        localStorage.removeItem("active_cluster_id");
        window.location.reload();
      }
    } catch (err) {
      console.error("Failed to switch workspace:", err);
      alert("Failed to switch workspace. Please try again.");
    }
  };

  React.useEffect(() => {
    async function loadClusters() {
      try {
        const settings = await kubiApi.getSettings();
        if (settings) {
          const configClusters = settings.clusters || [];
          setClusters(configClusters);
          
          if (configClusters.length === 0) {
            localStorage.removeItem("active_cluster_id");
            setActiveCluster("");
          } else {
            let stored = localStorage.getItem("active_cluster_id");
            if (!stored || !configClusters.some((c: any) => c.id === stored)) {
              stored = settings.active_cluster_id || configClusters[0]?.id || "";
              if (stored) {
                localStorage.setItem("active_cluster_id", stored);
              } else {
                localStorage.removeItem("active_cluster_id");
              }
            }
            setActiveCluster(stored || "");
          }
        }
      } catch (err) {
        console.error("Failed to load clusters for navbar selector:", err);
      }
    }
    loadClusters();
  }, []);

  const handleClusterChange = (event: any) => {
    const nextClusterId = event.target.value;
    localStorage.setItem("active_cluster_id", nextClusterId);
    setActiveCluster(nextClusterId);
    window.location.reload();
  };

  const [username, setUsername] = React.useState<string>("");
  
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("username") || "Dev SRE";
      setUsername(storedUser);
    }
  }, []);

  const getInitials = (name: string) => {
    if (!name) return "SRE";
    const clean = name.split("@")[0].replace("dev-sre-", "").replace("dev-", "");
    if (clean.length >= 2) {
      return clean.substring(0, 2).toUpperCase();
    }
    return clean.toUpperCase();
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    localStorage.removeItem("user_scopes");
    localStorage.removeItem("auth_provider");
    window.location.href = "/login";
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ height: 72 }}>
          {/* Brand */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            component={Link}
            href="/dashboard"
            sx={{ textDecoration: "none", mr: 5, flexShrink: 0 }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                bgcolor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
                boxShadow: "0 4px 12px rgba(96, 165, 250, 0.3)",
              }}
            >
              <Activity color="white" size={20} />
            </Box>
            <Typography
              variant="h6"
              fontWeight="900"
              sx={{
                color: "white",
                letterSpacing: "-0.5px",
                whiteSpace: "nowrap",
                display: { xs: "none", md: "block" },
              }}
            >
              Kubi AI
            </Typography>
          </Stack>

          {/* Navigation Links */}
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, overflowX: "auto", pr: 2, "&::-webkit-scrollbar": { display: "none" } }}>
            {navItems.map((item) => {
              const isActive =
                pathname === item.path || pathname?.startsWith(item.path + "/");
              return (
                <Button
                  key={item.path}
                  component={Link}
                  href={item.path}
                  startIcon={<item.icon size={16} />}
                  sx={{
                    px: 2,
                    py: 0.75,
                    borderRadius: 2.5,
                    textTransform: "none",
                    fontWeight: isActive ? 700 : 600,
                    fontSize: "0.85rem",
                    color: isActive ? "#60a5fa" : "rgba(255, 255, 255, 0.6)",
                    bgcolor: isActive
                      ? "rgba(96, 165, 250, 0.08)"
                      : "transparent",
                    border: isActive
                      ? "1px solid rgba(96, 165, 250, 0.15)"
                      : "1px solid transparent",
                    boxShadow: isActive ? "0 4px 12px rgba(96, 165, 250, 0.05)" : "none",
                    "&:hover": {
                      bgcolor: isActive
                        ? "rgba(96, 165, 250, 0.12)"
                        : "rgba(255, 255, 255, 0.04)",
                      color: "white",
                      transform: "translateY(-1px)",
                    },
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {item.name}
                </Button>
              );
            })}
          </Stack>

          {/* Workspace Selector */}
          {workspaces.length > 0 && (
            <Box sx={{ minWidth: 180, mr: 2 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={activeWorkspace}
                  onChange={handleWorkspaceChange}
                  displayEmpty
                  IconComponent={() => <ChevronDown size={14} style={{ marginRight: 8, opacity: 0.6, color: "white" }} />}
                  sx={{
                    color: "white",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    bgcolor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 2.5,
                    height: 36,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    "& .MuiSelect-select": {
                      display: "flex",
                      alignItems: "center",
                      gap: 1.2,
                      py: 1,
                      pl: 1.5,
                      pr: "28px !important",
                    },
                    "& .MuiOutlinedInput-notchedOutline": {
                      border: "none",
                    },
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(167, 139, 250, 0.35)",
                      boxShadow: "0 0 12px rgba(167, 139, 250, 0.15)",
                    },
                    transition: "all 0.2s ease",
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: "rgba(9, 13, 22, 0.95)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                        borderRadius: 2.5,
                        mt: 1,
                        "& .MuiMenuItem-root": {
                          color: "rgba(255, 255, 255, 0.65)",
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          py: 1,
                          px: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          "&.Mui-selected": {
                            bgcolor: "rgba(167, 139, 250, 0.12)",
                            color: "#a78bfa",
                            fontWeight: 600,
                            "&:hover": {
                              bgcolor: "rgba(167, 139, 250, 0.18)",
                            }
                          },
                          "&:hover": {
                            bgcolor: "rgba(255, 255, 255, 0.04)",
                            color: "white",
                          }
                        }
                      }
                    }
                  }}
                >
                  {workspaces.map((ws) => (
                    <MenuItem key={ws.id} value={ws.id}>
                      <Briefcase size={13} style={{ color: "#a78bfa" }} />
                      <span>{ws.name}</span>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Cluster Selector */}
          {clusters.length > 0 && (
            <Box sx={{ minWidth: 180, mr: 2 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={activeCluster}
                  onChange={handleClusterChange}
                  displayEmpty
                  IconComponent={() => <ChevronDown size={14} style={{ marginRight: 8, opacity: 0.6, color: "white" }} />}
                  sx={{
                    color: "white",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    bgcolor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 2.5,
                    height: 36,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    "& .MuiSelect-select": {
                      display: "flex",
                      alignItems: "center",
                      gap: 1.2,
                      py: 1,
                      pl: 1.5,
                      pr: "28px !important",
                    },
                    "& .MuiOutlinedInput-notchedOutline": {
                      border: "none",
                    },
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(96, 165, 250, 0.35)",
                      boxShadow: "0 0 12px rgba(96, 165, 250, 0.15)",
                    },
                    transition: "all 0.2s ease",
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: "rgba(9, 13, 22, 0.95)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                        borderRadius: 2.5,
                        mt: 1,
                        "& .MuiMenuItem-root": {
                          color: "rgba(255, 255, 255, 0.65)",
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          py: 1,
                          px: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          "&.Mui-selected": {
                            bgcolor: "rgba(96, 165, 250, 0.12)",
                            color: "#60a5fa",
                            fontWeight: 600,
                            "&:hover": {
                              bgcolor: "rgba(96, 165, 250, 0.18)",
                            }
                          },
                          "&:hover": {
                            bgcolor: "rgba(255, 255, 255, 0.04)",
                            color: "white",
                          }
                        }
                      }
                    }
                  }}
                >
                  {clusters.map((cluster) => (
                    <MenuItem key={cluster.id} value={cluster.id}>
                      <Server size={13} style={{ color: "#60a5fa" }} />
                      <span>{cluster.name}</span>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Right Actions */}
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton sx={{ color: "text.secondary" }}>
              <Badge badgeContent={3} color="error">
                <Bell size={20} />
              </Badge>
            </IconButton>
            <IconButton
              component={Link}
              href="/settings"
              sx={{
                color:
                  pathname === "/settings" ? "primary.main" : "text.secondary",
                bgcolor:
                  pathname === "/settings"
                    ? "rgba(96, 165, 250, 0.1)"
                    : "transparent",
              }}
            >
              <Settings size={20} />
            </IconButton>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 1, borderColor: "rgba(255,255,255,0.1)" }}
            />
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "secondary.main",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                }}
              >
                {getInitials(username)}
              </Avatar>
              <Typography variant="body2" fontWeight="600" color="white" sx={{ display: { xs: "none", lg: "block" } }}>
                {username.split("@")[0]}
              </Typography>
              <IconButton 
                onClick={handleLogout} 
                sx={{ 
                  color: "error.main",
                  "&:hover": { bgcolor: "rgba(248, 113, 113, 0.1)" }
                }}
                title="Logout"
              >
                <LogOut size={18} />
              </IconButton>
            </Stack>
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

