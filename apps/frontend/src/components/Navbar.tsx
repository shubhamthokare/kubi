"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Briefcase,
  ChevronDown,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  Server,
  Settings,
  ShieldAlert,
  Terminal,
  Wrench,
} from "lucide-react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Typography,
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

function TickerItem({
  name,
  value,
  detail,
  healthy,
}: {
  name: string;
  value: string;
  detail: string;
  healthy: boolean;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      sx={{
        minWidth: 0,
        px: { xs: 1, md: 1.35 },
        py: 0.75,
        borderRight: "1px solid rgba(148, 163, 184, 0.12)",
        "&:last-of-type": { borderRight: 0 },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: "rgba(148, 163, 184, 0.9)",
          fontSize: "0.64rem",
          fontWeight: 800,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: "#f8fafc", fontSize: "0.72rem", fontWeight: 800, whiteSpace: "nowrap" }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: healthy ? "#34d399" : "#fb7185",
          fontSize: "0.68rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </Typography>
    </Stack>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [clusters, setClusters] = React.useState<any[]>([]);
  const [activeCluster, setActiveCluster] = React.useState("");
  const [workspaces, setWorkspaces] = React.useState<any[]>([]);
  const [activeWorkspace, setActiveWorkspace] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [autoRemediation, setAutoRemediation] = React.useState(false);
  const [stats, setStats] = React.useState<any>({
    nodes: { total: 0, ready: 0 },
    pods: { total: 0, running: 0, pending: 0, failed: 0 },
    namespaces: 0,
    uptime: "N/A",
    avg_resolution_time: "N/A",
  });

  React.useEffect(() => {
    async function loadStats() {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!token) return;
        const res = await kubiApi.getStats();
        if (res) setStats(res);
      } catch (err) {
        console.error("Failed to load live stats for navbar:", err);
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    async function loadWorkspaces() {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!token) return;

        const list = await kubiApi.getWorkspaces();
        setWorkspaces(list || []);

        let activeWsId = localStorage.getItem("active_workspace_id");
        if (!activeWsId) {
          try {
            const decoded = JSON.parse(atob(token.split(".")[1]));
            activeWsId = decoded.workspace_id || "";
            if (activeWsId) localStorage.setItem("active_workspace_id", activeWsId);
          } catch (e) {
            console.error("JWT decoding failed:", e);
          }
        }

        if (!activeWsId && list?.length > 0) {
          activeWsId = list[0].id;
          localStorage.setItem("active_workspace_id", activeWsId);
        }
        setActiveWorkspace(activeWsId || "");
      } catch (err) {
        console.error("Failed to load workspaces for navbar:", err);
      }
    }
    loadWorkspaces();
  }, []);

  React.useEffect(() => {
    async function loadClusters() {
      try {
        const settings = await kubiApi.getSettings();
        if (!settings) return;

        setAutoRemediation(settings.auto_remediation || false);
        const configClusters = settings.clusters || [];
        setClusters(configClusters);

        if (configClusters.length === 0) {
          localStorage.removeItem("active_cluster_id");
          setActiveCluster("");
          return;
        }

        let stored = localStorage.getItem("active_cluster_id");
        if (!stored || !configClusters.some((c: any) => c.id === stored)) {
          stored = settings.active_cluster_id || configClusters[0]?.id || "";
          if (stored) localStorage.setItem("active_cluster_id", stored);
        }
        setActiveCluster(stored || "");
      } catch (err) {
        console.error("Failed to load clusters for navbar selector:", err);
      }
    }
    loadClusters();
  }, []);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setUsername(localStorage.getItem("username") || "Dev SRE");
    }
  }, []);

  const handleWorkspaceChange = async (event: any) => {
    const nextWorkspaceId = event.target.value;
    try {
      const res = await kubiApi.switchWorkspace(nextWorkspaceId);
      if (res?.access_token) {
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

  const handleClusterChange = (event: any) => {
    const nextClusterId = event.target.value;
    localStorage.setItem("active_cluster_id", nextClusterId);
    setActiveCluster(nextClusterId);
    window.location.reload();
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    localStorage.removeItem("user_scopes");
    localStorage.removeItem("auth_provider");
    window.location.href = "/login";
  };

  const getInitials = (name: string) => {
    if (!name) return "SRE";
    const clean = name.split("@")[0].replace("dev-sre-", "").replace("dev-", "");
    return clean.length >= 2 ? clean.substring(0, 2).toUpperCase() : clean.toUpperCase();
  };

  const nodeTotal = stats?.nodes?.total || 0;
  const nodeReady = stats?.nodes?.ready || 0;
  const nodePercent = nodeTotal > 0 ? Math.round((nodeReady / nodeTotal) * 100) : 0;
  const podTotal = stats?.pods?.total || 0;
  const podRunning = stats?.pods?.running || 0;
  const podPercent = podTotal > 0 ? Math.round((podRunning / podTotal) * 100) : 0;
  const failedPods = stats?.pods?.failed || 0;
  const pendingPods = stats?.pods?.pending || 0;
  const stabilityIndex = podTotal > 0 ? 100 - Math.round(((failedPods + pendingPods) / podTotal) * 100) : 85;

  const selectSx = {
    color: "white",
    fontWeight: 700,
    fontSize: "0.8rem",
    bgcolor: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: 1,
    height: 36,
    "& .MuiSelect-select": {
      display: "flex",
      alignItems: "center",
      gap: 1,
      py: 1,
      pl: 1.5,
      pr: "28px !important",
    },
    "& .MuiOutlinedInput-notchedOutline": { border: "none" },
    "&:hover": {
      bgcolor: "rgba(30, 41, 59, 0.78)",
      borderColor: "rgba(96, 165, 250, 0.35)",
    },
  };

  const menuProps = {
    PaperProps: {
      sx: {
        bgcolor: "rgba(9, 13, 22, 0.98)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
        borderRadius: 1.5,
        mt: 1,
        "& .MuiMenuItem-root": {
          color: "rgba(226, 232, 240, 0.78)",
          fontSize: "0.8rem",
          fontWeight: 600,
          py: 1,
          gap: 1,
          "&.Mui-selected": {
            bgcolor: "rgba(96, 165, 250, 0.14)",
            color: "#93c5fd",
          },
          "&:hover": {
            bgcolor: "rgba(255, 255, 255, 0.05)",
            color: "white",
          },
        },
      },
    },
  };

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: "rgba(8, 13, 24, 0.98)",
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
      }}
    >
      <Box
        sx={{
          px: { xs: 1, md: 3 },
          bgcolor: "rgba(2, 6, 23, 0.88)",
          borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack direction="row" spacing={0} alignItems="center" sx={{ minWidth: 0 }}>
          <TickerItem name="Autonomy" value={autoRemediation ? "Active" : "Inactive"} detail={`Recovery ${stats?.avg_resolution_time || "N/A"}`} healthy={autoRemediation} />
          <TickerItem name="Uptime" value={stats?.uptime || "N/A"} detail={`${stats?.namespaces || 0} namespaces`} healthy={stats?.uptime !== "N/A"} />
          <TickerItem name="Nodes" value={`${nodePercent}%`} detail={`${nodeReady}/${nodeTotal} ready`} healthy={nodeTotal > 0 && nodeReady === nodeTotal} />
          <TickerItem name="Pods" value={`${podPercent}%`} detail={`${podRunning}/${podTotal} running`} healthy={podTotal > 0 && podPercent >= 90} />
          <TickerItem name="Stability" value={`${stabilityIndex}%`} detail={`${failedPods} failed, ${pendingPods} pending`} healthy={stabilityIndex >= 90} />
        </Stack>
        <IconButton
          size="small"
          sx={{
            ml: 1,
            color: "rgba(203, 213, 225, 0.75)",
            border: "1px solid rgba(148, 163, 184, 0.14)",
            bgcolor: "rgba(255, 255, 255, 0.03)",
          }}
        >
          <Globe2 size={15} />
        </IconButton>
      </Box>

      <Box sx={{ px: { xs: 1.5, md: 3 } }}>
        <Toolbar disableGutters sx={{ minHeight: "64px !important", gap: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.2}
            component={Link}
            href="/dashboard"
            sx={{ textDecoration: "none", flexShrink: 0 }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                bgcolor: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
              }}
            >
              <Activity color="white" size={20} />
            </Box>
            <Typography
              variant="h6"
              fontWeight={900}
              sx={{ color: "white", fontSize: "1rem", whiteSpace: "nowrap", display: { xs: "none", md: "block" } }}
            >
              Kubi AI
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.25} sx={{ flexGrow: 1, minWidth: 0, overflowX: "auto", "&::-webkit-scrollbar": { display: "none" } }}>
            {navItems.map((item) => {
              const isActive = pathname === item.path || pathname?.startsWith(`${item.path}/`);
              return (
                <Button
                  key={item.path}
                  component={Link}
                  href={item.path}
                  startIcon={<item.icon size={16} />}
                  sx={{
                    px: 1.4,
                    py: 0.75,
                    borderRadius: 1,
                    textTransform: "none",
                    fontWeight: isActive ? 800 : 650,
                    fontSize: "0.83rem",
                    color: isActive ? "#93c5fd" : "rgba(203, 213, 225, 0.68)",
                    bgcolor: isActive ? "rgba(96, 165, 250, 0.12)" : "transparent",
                    border: isActive ? "1px solid rgba(96, 165, 250, 0.28)" : "1px solid transparent",
                    whiteSpace: "nowrap",
                    "&:hover": {
                      bgcolor: isActive ? "rgba(96, 165, 250, 0.16)" : "rgba(255, 255, 255, 0.04)",
                      color: "white",
                    },
                  }}
                >
                  {item.name}
                </Button>
              );
            })}
          </Stack>

          {workspaces.length > 0 && (
            <Box sx={{ width: { xs: 150, lg: 190 }, flexShrink: 0 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={activeWorkspace}
                  onChange={handleWorkspaceChange}
                  displayEmpty
                  IconComponent={() => <ChevronDown size={14} style={{ marginRight: 8, opacity: 0.65, color: "white" }} />}
                  sx={selectSx}
                  MenuProps={menuProps}
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

          {clusters.length > 0 && (
            <Box sx={{ width: { xs: 140, lg: 180 }, flexShrink: 0 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={activeCluster}
                  onChange={handleClusterChange}
                  displayEmpty
                  IconComponent={() => <ChevronDown size={14} style={{ marginRight: 8, opacity: 0.65, color: "white" }} />}
                  sx={selectSx}
                  MenuProps={menuProps}
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

          <Stack direction="row" spacing={0.5} alignItems="center" flexShrink={0}>
            <IconButton sx={{ color: "rgba(203, 213, 225, 0.72)" }}>
              <Badge badgeContent={3} color="error">
                <Bell size={19} />
              </Badge>
            </IconButton>
            <IconButton
              component={Link}
              href="/settings"
              sx={{
                color: pathname === "/settings" ? "#93c5fd" : "rgba(203, 213, 225, 0.72)",
                bgcolor: pathname === "/settings" ? "rgba(96, 165, 250, 0.12)" : "transparent",
              }}
            >
              <Settings size={19} />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: "rgba(148, 163, 184, 0.14)" }} />
            <Avatar sx={{ width: 32, height: 32, bgcolor: "#8b5cf6", fontSize: "0.8rem", fontWeight: 900 }}>
              {getInitials(username)}
            </Avatar>
            <Typography variant="body2" fontWeight={700} color="white" sx={{ display: { xs: "none", xl: "block" }, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
              {username.split("@")[0]}
            </Typography>
            <IconButton onClick={handleLogout} title="Logout" sx={{ color: "#fb7185", "&:hover": { bgcolor: "rgba(248, 113, 113, 0.1)" } }}>
              <LogOut size={18} />
            </IconButton>
          </Stack>
        </Toolbar>
      </Box>
    </AppBar>
  );
}
