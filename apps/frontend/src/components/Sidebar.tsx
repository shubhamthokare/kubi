'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Wrench, 
  Settings, 
  Terminal,
  Activity,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Analyzer', icon: Activity, path: '/analyzer' },
  { name: 'Incidents', icon: ShieldAlert, path: '/incidents' },
  { name: 'Remediation', icon: Wrench, path: '/remediation' },
  { name: 'Reports', icon: FileText, path: '/reports' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar glass">
      <div className="flex items-center gap-3 mb-12 px-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Activity className="text-white" size={24} />
        </div>
        <span className="text-xl font-bold tracking-tight">Kubi AI</span>
      </div>

      <nav className="space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <motion.div
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-gradient-to-r from-purple-600/20 to-cyan-500/10 text-white border border-purple-500/20' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={20} className={isActive ? 'text-purple-400' : 'group-hover:text-white'} />
                  <span className="font-medium">{item.name}</span>
                </div>
                {isActive && (
                  <motion.div layoutId="active" className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-glow" />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-8 left-6 right-6">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <div className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-2">System Status</div>
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Operational
          </div>
        </div>
      </div>
    </aside>
  );
}
