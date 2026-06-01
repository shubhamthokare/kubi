'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Terminal, 
  Cpu, 
  Activity, 
  Zap, 
  CheckCircle2, 
  ArrowRight, 
  Lock, 
  Layers, 
  Sparkles, 
  ShieldAlert, 
  Server,
  Play,
  RotateCcw
} from 'lucide-react';

interface LogLine {
  text: string;
  type: 'system' | 'warn' | 'info' | 'success' | 'code' | 'gemini';
}

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<'rca' | 'remediate' | 'multi'>('rca');
  const [consoleStep, setConsoleStep] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  // Animated SRE Console script
  const consoleScript: LogLine[] = [
    { text: '[00:01:04] 🔍 Monitoring namespace "production-api" for incident patterns...', type: 'system' },
    { text: '[00:01:06] ⚠️ WARNING - pod "payment-processor-7fd6c" state changed to CrashLoopBackOff', type: 'warn' },
    { text: '[00:01:08] 📥 Ingested critical pod anomaly hook into Kubi Incident Hub.', type: 'info' },
    { text: '[00:01:10] 🔒 Sanitizing container logs: Stripping sensitive connection strings & database keys...', type: 'info' },
    { text: '[00:01:12] 🤖 Querying Gemini SRE Agent with sanitized context & active kubernetes topology...', type: 'info' },
    { text: '>> [Gemini AI SRE] ANALYSIS COMPLETED:', type: 'gemini' },
    { text: '   Root Cause: Connection timeout to remote Redis server.', type: 'gemini' },
    { text: '   Diagnosis: The redis-host endpoint in ConfigMap was set to "redis-stage" instead of "redis-prod".', type: 'gemini' },
    { text: '   Proposed Action: Hotpatch ConfigMap "payment-configs" and trigger rolling restart.', type: 'gemini' },
    { text: '[00:01:16] 📝 Generated remediation plan ID: Plan-0981a295 (Awaiting execution)', type: 'info' },
    { text: '[00:01:17] 🚀 Executing rolling rollback & hotpatch on payment-processor deployment...', type: 'info' },
    { text: '   $ kubectl patch configmap payment-configs -n production-api --patch \'{"data":{"redis-host":"redis-prod"}}\'', type: 'code' },
    { text: '   $ kubectl rollout restart deployment payment-processor -n production-api', type: 'code' },
    { text: '[00:01:21] 🔄 Verifying pod health status post-remediation...', type: 'system' },
    { text: '[00:01:25] ✅ SUCCESS - pod "payment-processor-8a9bb" status changed to RUNNING and READY 1/1', type: 'success' },
    { text: '[00:01:26] 🎉 Automated incident #Incident-982 resolved successfully! MTTR: 20 seconds.', type: 'success' }
  ];

  useEffect(() => {
    if (!isRunning) return;

    const timer = setTimeout(() => {
      if (consoleStep < consoleScript.length - 1) {
        setConsoleStep(prev => prev + 1);
      } else {
        // Loop back after 6 seconds of completion
        const loopTimer = setTimeout(() => {
          setConsoleStep(0);
        }, 6000);
        return () => clearTimeout(loopTimer);
      }
    }, consoleScript[consoleStep]?.type === 'gemini' ? 2200 : consoleScript[consoleStep]?.type === 'code' ? 1400 : 950);

    return () => clearTimeout(timer);
  }, [consoleStep, isRunning]);

  return (
    <div className="relative min-h-screen text-slate-100 font-sans selection:bg-blue-500/30 selection:text-blue-200 overflow-x-hidden">
      {/* Dynamic Cyber Backdrop mesh & grid */}
      <div className="absolute inset-0 bg-[#020617] -z-20" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] -z-10 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70" />
      
      {/* Top glowing ambient blurs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] -z-10 animate-pulse" />
      <div className="absolute top-10 right-1/4 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[100px] -z-10" />

      {/* HEADER SECTION */}
      <header className="sticky top-0 z-50 w-full glass bg-slate-950/40 backdrop-blur-md border-b border-white/5 px-6 lg:px-16 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Cpu className="w-4.5 h-4.5 text-white animate-pulse" />
            <div className="absolute inset-0 rounded-lg border border-white/20" />
          </div>
          <span className="text-xl font-black tracking-wider text-white flex items-center gap-1.5">
            KUBI <span className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold px-1.5 py-0.5 rounded-md">AI</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-blue-400 transition-colors">Features</a>
          <a href="#landing" className="hover:text-blue-400 transition-colors">How It Works</a>
          <a href="#architecture" className="hover:text-blue-400 transition-colors">Architecture</a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-blue-400 transition-colors">Documentation</a>
        </nav>

        <div className="flex items-center gap-4">
          <Link 
            href="/login" 
            id="nav_sign_in_btn"
            className="text-sm font-semibold hover:text-white text-slate-300 transition-colors px-4 py-2"
          >
            Sign In
          </Link>
          <Link 
            href="/register" 
            id="nav_get_started_btn"
            className="relative inline-flex items-center justify-center p-0.5 mb-2 me-2 overflow-hidden text-xs font-bold rounded-lg group bg-gradient-to-br from-blue-500 to-violet-500 group-hover:from-blue-500 group-hover:to-violet-500 text-white focus:ring-4 focus:outline-none focus:ring-blue-800 transition-all shadow-md shadow-blue-500/15"
          >
            <span className="relative px-4.5 py-2.5 transition-all ease-in duration-75 bg-[#030712] rounded-md group-hover:bg-opacity-0">
              Deploy Free Agent
            </span>
          </Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="max-w-7xl mx-auto px-6 lg:px-16 pt-16 lg:pt-24 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Hero Left Content */}
          <div className="lg:col-span-6 space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full glass border border-blue-500/20 bg-blue-500/5 text-xs font-semibold text-blue-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next-Gen Autonomous SRE Copilot</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Self-Healing <br />
              <span className="text-gradient">Kubernetes Clusters</span> <br />
              Powered by AI
            </h1>

            <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Detect cluster anomalies, perform real-time root-cause analysis, and deploy verified remediation plans automatically. Keep your applications healthy without midnight wakeups.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link 
                href="/register"
                id="hero_cta_register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-bold text-sm px-8 py-4 rounded-xl shadow-lg shadow-blue-500/25 transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a 
                href="#landing"
                id="hero_cta_demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 glass hover:bg-white/5 border border-white/10 text-white font-bold text-sm px-8 py-4 rounded-xl transition-all"
              >
                <span>Watch AI in Action</span>
              </a>
            </div>

            {/* Quick trust metrics */}
            <div className="pt-6 border-t border-white/5 grid grid-cols-3 gap-6 max-w-md mx-auto lg:mx-0">
              <div>
                <p className="text-2xl font-black text-white">99%</p>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">MTTR Reduction</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">&lt; 15s</p>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Anomaly Discovery</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">24/7</p>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Autonomous Guard</p>
              </div>
            </div>
          </div>

          {/* Hero Right: Live Interactive SRE Shell */}
          <div className="lg:col-span-6" id="landing">
            <div className="glass border border-white/10 rounded-2xl overflow-hidden shadow-2xl bg-[#020617]/85 relative">
              {/* Glow accents */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 blur-xl rounded-full" />
              
              {/* Shell header */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/80 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-slate-500 font-mono ml-2">kubi-agent@production-cluster:~</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setConsoleStep(0);
                      setIsRunning(true);
                    }}
                    className="p-1 text-slate-500 hover:text-white transition-colors"
                    title="Restart Simulation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] uppercase font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    LIVE AGENT
                  </span>
                </div>
              </div>

              {/* Console Body */}
              <div className="p-6 h-[400px] overflow-y-auto font-mono text-[11px] sm:text-xs leading-relaxed space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800">
                {consoleScript.slice(0, consoleStep + 1).map((line, idx) => (
                  <div 
                    key={idx} 
                    className={`whitespace-pre-wrap transition-opacity duration-300 animate-fadeIn ${
                      line.type === 'warn' ? 'text-amber-400' :
                      line.type === 'info' ? 'text-slate-300' :
                      line.type === 'system' ? 'text-blue-400' :
                      line.type === 'success' ? 'text-emerald-400 font-bold' :
                      line.type === 'code' ? 'text-indigo-300 pl-4 bg-indigo-500/5 py-1 rounded border-l border-indigo-500/40 my-1' :
                      'text-violet-300 bg-violet-500/5 p-3.5 rounded-lg border border-violet-500/10 my-2 shadow-inner block'
                    }`}
                  >
                    {line.text}
                  </div>
                ))}
                {consoleStep < consoleScript.length - 1 && (
                  <div className="inline-flex items-center gap-1.5 text-blue-400 mt-1">
                    <span className="w-1.5 h-3.5 bg-blue-400 animate-pulse inline-block" />
                    <span className="text-[10px] text-slate-600 uppercase font-semibold">Agent reasoning...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* CORE FEATURES GRID */}
      <section id="features" className="max-w-7xl mx-auto px-6 lg:px-16 py-24 border-t border-white/5">
        <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
          <h2 className="text-xs uppercase font-extrabold text-blue-400 tracking-widest">COMPLETE SRE TOOLKIT</h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Engineered for Fail-Safe Autopilot</h3>
          <p className="text-slate-400 text-sm sm:text-base">
            From log sanitization to automated deployment rollbacks, Kubi implements enterprise-grade multi-tenant controls over your cluster.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Card 1: Autonomous Remediation */}
          <div className="glass-hover glass p-8 space-y-5 bg-[#020617]/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            <h4 className="text-lg font-bold text-white">Self-Healing & Remediation</h4>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Detects OOMKilled, CrashLoopBackOff, or ImagePullBackOff exceptions, analyzes history, generates an execution sequence, and hotpatches resource manifests instantly.
            </p>
          </div>

          {/* Card 2: Gemini RAG Analytics */}
          <div className="glass-hover glass p-8 space-y-5 bg-[#020617]/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-violet-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <h4 className="text-lg font-bold text-white">Gemini-Powered Diagnosis</h4>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Utilizes retrieval-augmented generation (RAG) to query similar past incident aggregates in Elasticsearch, creating contextualized playbooks and diagnoses.
            </p>
          </div>

          {/* Card 3: Secure Logging sanitization */}
          <div className="glass-hover glass p-8 space-y-5 bg-[#020617]/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-emerald-400" />
            </div>
            <h4 className="text-lg font-bold text-white">Enterprise Log Sanitization</h4>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              State-of-the-art security layers scrub passwords, tokens, private keys, database links, and proprietary secrets from logs before exporting context to AI models.
            </p>
          </div>

          {/* Card 4: Command Center Explorer */}
          <div className="glass-hover glass p-8 space-y-5 bg-[#020617]/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Terminal className="w-6 h-6 text-indigo-400" />
            </div>
            <h4 className="text-lg font-bold text-white">Log Explorer & Diagnostics</h4>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Tail live container logs in real-time, describe live pod YAML manifests, and execute targeted diagnostic command scripts securely through standard agents.
            </p>
          </div>

          {/* Card 5: Multi-Tenant RBAC Isolation */}
          <div className="glass-hover glass p-8 space-y-5 bg-[#020617]/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Layers className="w-6 h-6 text-cyan-400" />
            </div>
            <h4 className="text-lg font-bold text-white">Multi-Tenant Isolation</h4>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Hardened multi-tenant organization workspaces ensure absolute data separation, isolated database contexts, and strict role-based SRE authorization settings.
            </p>
          </div>

          {/* Card 6: GitLab Sync Integration */}
          <div className="glass-hover glass p-8 space-y-5 bg-[#020617]/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-rose-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-rose-400" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M23.955 13.587l-1.342-4.135a.697.697 0 0 0-.25-.347.72.72 0 0 0-.414-.112.716.716 0 0 0-.417.114.697.697 0 0 0-.246.345l-1.745 5.372H8.46l-1.745-5.37a.715.715 0 0 0-.246-.346.715.715 0 0 0-.417-.114.717.717 0 0 0-.414.112.697.697 0 0 0-.25.347L3.978 13.59a.723.723 0 0 0 .074.568.705.705 0 0 0 .428.324l9.18 3.123 9.18-3.123a.7.7 0 0 0 .429-.324.723.723 0 0 0 .076-.568z"/>
                <path d="M13.978 8.993l2.846 8.76H7.176l2.846-8.76a.713.713 0 0 1 .253-.339.722.722 0 0 1 .414-.108c.148 0 .292.036.417.108.125.071.213.19.252.339z"/>
              </svg>
            </div>
            <h4 className="text-lg font-bold text-white">GitLab Repo Sync Integration</h4>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Connect and sync git repositories, audit active pipelines, monitor deployment branches, and coordinate secure rollbacks across microservices.
            </p>
          </div>
        </div>
      </section>

      {/* DETAILED INTERACTIVE ARCHITECTURE OVERVIEW */}
      <section id="architecture" className="max-w-7xl mx-auto px-6 lg:px-16 py-24 border-t border-white/5 bg-slate-950/20 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_100%,rgba(99,102,241,0.03)_0%,transparent_70%)]" />
        
        <div className="text-center max-w-2xl mx-auto space-y-4 mb-20">
          <h2 className="text-xs uppercase font-extrabold text-violet-400 tracking-widest font-mono">FLOW ARCHITECTURE</h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Security-First Autonomous Agent</h3>
          <p className="text-slate-400 text-sm sm:text-base">
            How Kubi tracks cluster health, scrubs operational data, makes decisions via Gemini, and rolls out safe remediations.
          </p>
        </div>

        {/* Dynamic Architectural Flow Visual (Pure CSS & SVGs) */}
        <div className="glass border border-white/5 rounded-2xl p-8 lg:p-12 bg-slate-900/10 relative">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative">
            
            {/* Step 1 */}
            <div className="space-y-4 text-center lg:text-left relative z-10">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold font-mono text-sm mx-auto lg:mx-0">
                01
              </div>
              <h5 className="font-bold text-white text-base flex items-center justify-center lg:justify-start gap-2">
                <Activity className="w-4.5 h-4.5 text-blue-400" />
                Cluster Monitor
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kubi-Agent running inside the cluster captures event streams, CrashLoopBackOff states, and alert metrics from Prometheus hook registers.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-4 text-center lg:text-left relative z-10">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold font-mono text-sm mx-auto lg:mx-0">
                02
              </div>
              <h5 className="font-bold text-white text-base flex items-center justify-center lg:justify-start gap-2">
                <Lock className="w-4.5 h-4.5 text-emerald-400" />
                Data Scrubbing
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                Log sanitizers intercept log pipelines, stripping database credentials, JWT strings, passwords, and private domain settings in-memory.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-4 text-center lg:text-left relative z-10">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 font-bold font-mono text-sm mx-auto lg:mx-0">
                03
              </div>
              <h5 className="font-bold text-white text-base flex items-center justify-center lg:justify-start gap-2">
                <Sparkles className="w-4.5 h-4.5 text-violet-400" />
                Gemini Reasoning
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                RAG pipeline scans historical resolutions in Elasticsearch. Sanitized context is analyzed by Gemini to generate structured JSON remediation steps.
              </p>
            </div>

            {/* Step 4 */}
            <div className="space-y-4 text-center lg:text-left relative z-10">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold font-mono text-sm mx-auto lg:mx-0">
                04
              </div>
              <h5 className="font-bold text-white text-base flex items-center justify-center lg:justify-start gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 text-indigo-400" />
                Safe Rollout
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                The agent applies patched configurations safely (rollbacks, manifest updates). Evaluates status over a stabilization time window to ensure resolution success.
              </p>
            </div>

            {/* Background connection paths (only visible on wide screens) */}
            <div className="hidden lg:block absolute top-5 left-10 right-10 h-[1px] bg-gradient-to-r from-blue-500/20 via-emerald-500/20 via-violet-500/20 to-indigo-500/20 -z-0" />
          </div>
        </div>
      </section>

      {/* CTA BOTTOM BANNER */}
      <section className="max-w-7xl mx-auto px-6 lg:px-16 py-20 relative">
        <div className="glass border border-white/10 rounded-3xl p-8 lg:p-16 bg-gradient-to-br from-slate-900/60 to-blue-950/10 relative overflow-hidden text-center space-y-6">
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/10 rounded-full blur-[100px] -z-10" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-violet-600/10 rounded-full blur-[100px] -z-10" />

          <h3 className="text-3xl sm:text-4xl font-extrabold text-white">
            Secure Your Clusters Today
          </h3>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            Experience self-healing platform operations. Deploy the autonomous agent in under 2 minutes with standard helm credentials.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              id="footer_cta_register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-bold text-sm px-8 py-4 rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              <span>Deploy Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              id="footer_cta_login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 glass hover:bg-white/5 border border-white/10 text-white font-bold text-sm px-8 py-4 rounded-xl transition-all"
            >
              <span>Access Console</span>
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-12 px-6 lg:px-16 text-center md:text-left">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-wider text-slate-400">KUBI AI</span>
            <span>•</span>
            <span>Autonomous Kubernetes SRE Agent</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-slate-300 transition-colors">Features</a>
            <a href="#landing" className="hover:text-slate-300 transition-colors">How It Works</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-slate-300 transition-colors">Documentation</a>
          </div>
          <div>
            &copy; {new Date().getFullYear()} Kubi AI Platform. Built with Antigravity.
          </div>
        </div>
      </footer>
    </div>
  );
}
