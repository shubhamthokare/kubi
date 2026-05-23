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
  { name: "Incidents", path: "/incidents", icon: ShieldAlert },
  { name: "Remediation", path: "/remediation", icon: Wrench },
  { name: "Settings", path: "/settings", icon: Settings },
];

export default function Navbar() {
  const pathname = usePathname();
  const [clusters, setClusters] = React.useState<any[]>([]);
  const [activeCluster, setActiveCluster] = React.useState<string>("");

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
            sx={{ textDecoration: "none", mr: 8 }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
              }}
            >
              <Activity color="white" size={24} />
            </Box>
            <Typography
              variant="h6"
              fontWeight="800"
              sx={{
                color: "white",
                letterSpacing: "-0.5px",
                display: { xs: "none", md: "block" },
              }}
            >
              Kubi AI
            </Typography>
          </Stack>

          {/* Navigation Links */}
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            {navItems.map((item) => {
              const isActive =
                pathname === item.path || pathname?.startsWith(item.path + "/");
              return (
                <Button
                  key={item.path}
                  component={Link}
                  href={item.path}
                  startIcon={<item.icon size={18} />}
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: isActive ? "primary.main" : "text.secondary",
                    bgcolor: isActive
                      ? "rgba(96, 165, 250, 0.1)"
                      : "transparent",
                    "&:hover": {
                      bgcolor: isActive
                        ? "rgba(96, 165, 250, 0.15)"
                        : "rgba(255, 255, 255, 0.05)",
                      color: isActive ? "primary.main" : "white",
                    },
                  }}
                >
                  {item.name}
                </Button>
              );
            })}
          </Stack>

          {/* Cluster Selector */}
          {clusters.length > 0 && (
            <Box sx={{ minWidth: 180, mr: 2 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={activeCluster}
                  onChange={handleClusterChange}
                  displayEmpty
                  IconComponent={() => <ChevronDown size={16} style={{ marginRight: 8, opacity: 0.7 }} />}
                  sx={{
                    color: "white",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    bgcolor: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 2,
                    height: 38,
                    "& .MuiSelect-select": {
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1,
                      pl: 1.5,
                      pr: "32px !important",
                    },
                    "& .MuiOutlinedInput-notchedOutline": {
                      border: "none",
                    },
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                    },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: "#0f172a",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        boxShadow: "0 12px 24px -4px rgba(0,0,0,0.5)",
                        borderRadius: 2,
                        mt: 1,
                        "& .MuiMenuItem-root": {
                          color: "rgba(255, 255, 255, 0.7)",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          py: 1,
                          px: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          "&.Mui-selected": {
                            bgcolor: "rgba(96, 165, 250, 0.15)",
                            color: "#60a5fa",
                            fontWeight: 600,
                            "&:hover": {
                              bgcolor: "rgba(96, 165, 250, 0.2)",
                            }
                          },
                          "&:hover": {
                            bgcolor: "rgba(255, 255, 255, 0.05)",
                            color: "white",
                          }
                        }
                      }
                    }
                  }}
                >
                  {clusters.map((cluster) => (
                    <MenuItem key={cluster.id} value={cluster.id}>
                      <Server size={14} style={{ color: "#60a5fa" }} />
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

