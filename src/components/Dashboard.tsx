import React, { useState, useEffect } from "react";
import { 
  AlertTriangle, 
  Bell, 
  Settings, 
  User, 
  Wifi, 
  Plug, 
  Map as MapIcon, 
  HardHat, 
  Monitor, 
  LogOut,
  Activity,
  Radio,
  MapPin,
  Volume2,
  Zap,
  Gauge,
  Users,
  Shield,
  FileCheck2,
  Crown,
  Building2,
  Eye,
  Database,
  Menu,
  X as MenuCloseIcon,
  Cookie,
  ShieldCheck,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { Employee, SystemStats, RecentActivity, UserProfile, UserRole } from "../types";
import { isSupabaseConfigured } from "../services/supabaseClient";
import { dataService } from "../services/dataService";
import { motion, AnimatePresence } from "motion/react";
import ProfileModal from "./ProfileModal";

interface DashboardProps {
  username: string;
  userRole: UserRole;
  employees: Employee[];
  stats: SystemStats;
  activities: RecentActivity[];
  currentUser: UserProfile;
  onNavigateToMap: () => void;
  onLogout: () => void;
  onUpdateUser: (updated: UserProfile) => Promise<boolean | { success: boolean; message?: string }>;
  onOpenHelmetModal: () => void;
  onOpenEmployeeModal: () => void;
  onOpenUserModal: () => void;
  onOpenAnalyticsModal: () => void;
  onOpenPrivacyPolicy?: () => void;
}

export default function Dashboard({ 
  username, 
  userRole,
  employees, 
  stats, 
  activities, 
  currentUser, 
  onNavigateToMap, 
  onLogout,
  onUpdateUser,
  onOpenHelmetModal,
  onOpenEmployeeModal,
  onOpenUserModal,
  onOpenAnalyticsModal,
  onOpenPrivacyPolicy
}: DashboardProps) {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [faqFormsUrl, setFaqFormsUrl] = useState<string>("");

  useEffect(() => {
    // Carrega a URL inicial do formulário de FAQ
    dataService.getAppSetting("faq_forms_url").then((url) => {
      if (url) setFaqFormsUrl(url);
    });

    // Escuta atualizações bidirecionais em tempo real (Supabase Realtime)
    const unsubscribe = dataService.subscribeToRealtime((table, _event, record) => {
      if (table === "app_settings" && record?.key === "faq_forms_url") {
        setFaqFormsUrl(record.value || "");
      }
    });

    return () => unsubscribe();
  }, []);

  // Capacete conectado principal (EMP001 vinculado ao ESP32)
  const connectedHelmet = employees.find(e => e.id === "EMP001" && e.status !== "OFFLINE") || employees.find(e => e.status !== "OFFLINE") || null;
  const telemetry = connectedHelmet?.telemetry;

  const isSupabase = isSupabaseConfigured();
  const effectiveRole = currentUser.role || userRole;

  const formatDate = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    };
    return now.toLocaleDateString('pt-BR', options).toUpperCase();
  };

  const isEmergency = stats.systemStatus === "EMERGENCY" || stats.emergenciesToday > 0;

  const getRoleBadge = () => {
    switch (effectiveRole) {
      case "MASTER":
        return (
          <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
            <Crown className="w-3.5 h-3.5 text-yellow-500" />
            Admin Master
          </span>
        );
      case "COMPANY_ADMIN":
        return (
          <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            Admin Empresa
          </span>
        );
      case "VIEWER":
      default:
        return (
          <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Eye className="w-3.5 h-3.5 text-zinc-400" />
            Visualizador
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      {/* Top Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <span className="text-lg font-bold tracking-tight">Safety Monitor</span>
          </div>

          {/* Role Badge */}
          {getRoleBadge()}

          {/* Supabase Status Indicator (Exclusivo para Admin Master) */}
          {effectiveRole === "MASTER" && (
            <span 
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                isSupabase 
                  ? "bg-green-500/10 text-green-400 border-green-500/30" 
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}
              title={isSupabase ? "Conectado ao Supabase PostgreSQL Cloud" : "Operando em modo de Armazenamento Local Inteligente (LocalStorage)"}
            >
              <Database className="w-3 h-3" />
              {isSupabase ? "Supabase Nuvem" : "Modo Local Resiliente"}
            </span>
          )}
        </div>

        {/* Central Navigation Action Shortcuts - Desktop */}
        <nav aria-label="Navegação Principal" className="hidden md:flex items-center gap-1.5">
          <button
            onClick={onOpenHelmetModal}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-yellow-500/30 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
            aria-label="Abrir gestão de capacetes"
          >
            <HardHat className="w-3.5 h-3.5 text-yellow-500" />
            <span>Capacetes</span>
          </button>

          <button
            onClick={onOpenEmployeeModal}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-yellow-500/30 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
            aria-label="Abrir gestão de funcionários"
          >
            <Users className="w-3.5 h-3.5 text-yellow-500" />
            <span>Funcionários</span>
          </button>

          {effectiveRole !== "VIEWER" && (
            <button
              onClick={onOpenUserModal}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-yellow-500/30 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              aria-label="Abrir controle de usuários RBAC"
            >
              <Shield className="w-3.5 h-3.5 text-yellow-500" />
              <span>Usuários RBAC</span>
            </button>
          )}

          <button
            onClick={onOpenAnalyticsModal}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-yellow-500/30 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
            aria-label="Abrir normas regulamentadoras e laudos"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-yellow-500" />
            <span>Normas & Laudos</span>
          </button>

          <button
            onClick={onNavigateToMap}
            className="px-3.5 py-1.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
            aria-label="Navegar para o mapa de operações ao vivo"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Mapa ao Vivo</span>
          </button>
        </nav>
        
        <div className="flex items-center gap-3 md:gap-5">
          {/* Botão de Menu Mobile */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="flex md:hidden p-2 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white"
            aria-label="Abrir menu de navegação móvel"
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <MenuCloseIcon className="w-5 h-5 text-yellow-500" /> : <Menu className="w-5 h-5" />}
          </button>

          <div 
            className="relative cursor-pointer p-1" 
            onClick={onOpenAnalyticsModal} 
            title="Visualizar Alertas e Normas"
            aria-label="Alertas e emergências do dia"
            role="button"
            tabIndex={0}
          >
            <Bell className="w-5 h-5 text-zinc-400 hover:text-white transition-colors" />
            {stats.emergenciesToday > 0 && (
              <span 
                role="alert"
                aria-live="assertive"
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-[10px] flex items-center justify-center rounded-full font-bold animate-pulse"
              >
                {stats.emergenciesToday}
              </span>
            )}
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 cursor-pointer group"
              aria-label="Menu do usuário"
              aria-expanded={showDropdown}
            >
              <div className="w-8 h-8 rounded-full border-2 border-yellow-500/50 flex items-center justify-center bg-zinc-900 text-yellow-500 font-bold text-sm group-hover:border-yellow-500 transition-all">
                {(currentUser.firstName || username).charAt(0).toUpperCase()}
              </div>
            </button>

            <AnimatePresence>
              {showDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowDropdown(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden"
                  >
                    <div className="p-4 border-b border-white/5 bg-zinc-950/40">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sessão Ativa</p>
                        {getRoleBadge()}
                      </div>
                      <p className="text-sm font-bold text-white truncate">{currentUser.firstName} {currentUser.lastName}</p>
                      <p className="text-xs text-zinc-400 font-mono">@{currentUser.username}</p>
                    </div>

                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          setShowProfileModal(true);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <User className="w-4 h-4 text-yellow-500" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Meu Perfil</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          onOpenHelmetModal();
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <HardHat className="w-4 h-4 text-yellow-500" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Gestão de Capacetes</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          onOpenEmployeeModal();
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <Users className="w-4 h-4 text-yellow-500" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Gestão de Operadores</span>
                      </button>

                      {effectiveRole !== "VIEWER" && (
                        <button
                          onClick={() => {
                            setShowDropdown(false);
                            onOpenUserModal();
                          }}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                        >
                          <Shield className="w-4 h-4 text-yellow-500" />
                          <span className="font-bold uppercase tracking-wider text-[10px]">Controle de Usuários</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          onOpenAnalyticsModal();
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <FileCheck2 className="w-4 h-4 text-yellow-500" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">
                          {effectiveRole === "MASTER" ? "Normas & Laudos TCC" : "Normas & Laudos Técnicos"}
                        </span>
                      </button>
                    </div>

                    <div className="p-2 border-t border-white/5">
                      <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Desconectar</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Welcome Banner */}
        <div className="relative h-[260px] flex flex-col justify-end p-8 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url('https://images.unsplash.com/photo-1516937941344-00b4e0337589?q=80&w=2070&auto=format&fit=crop')`,
              filter: 'brightness(0.35)'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-end gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Painel de Operações •</p>
                <span className="text-yellow-500 text-xs font-bold uppercase tracking-widest">
                  {effectiveRole === "MASTER" ? "👑 Admin Master" : effectiveRole === "COMPANY_ADMIN" ? "🏢 Admin Empresa" : "👁️ Modo Visualizador"}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-yellow-500 mb-2">
                {currentUser.firstName ? `${currentUser.firstName} (${username})` : username}
              </h1>
              <p className="text-zinc-500 text-xs font-bold tracking-[0.2em]">{formatDate()}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenAnalyticsModal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white transition-all backdrop-blur-md"
              >
                <FileCheck2 className="w-4 h-4 text-yellow-500" />
                <span>Normas NR-06 & NR-12</span>
              </button>
              <button
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white transition-all backdrop-blur-md"
              >
                <User className="w-4 h-4 text-yellow-500" />
                <span>Meu Perfil</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid - DADOS REAIS */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 -mt-10 relative z-20">
          {/* Active Helmets */}
          <div 
            onClick={onOpenHelmetModal}
            className="bg-zinc-900/90 backdrop-blur-xl p-6 rounded-2xl border border-white/5 flex justify-between items-center shadow-lg hover:border-white/20 transition-all cursor-pointer group"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${isEmergency ? "bg-red-500 animate-pulse" : "bg-green-500"}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isEmergency ? "text-red-400" : "text-yellow-500"}`}>
                  {isEmergency ? "Alerta Ativo" : "Sistema Nominal"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider group-hover:text-white transition-colors">
                Capacetes Ativos
              </h3>
            </div>
            <div className="text-4xl font-bold text-white">
              <span className="text-green-500 mr-1">+</span>{stats.activeHelmets}
            </div>
          </div>

          {/* Emergencies */}
          <div 
            onClick={onOpenAnalyticsModal}
            className="bg-zinc-900/90 backdrop-blur-xl p-6 rounded-2xl border border-white/5 flex justify-between items-center shadow-lg hover:border-white/20 transition-all cursor-pointer group"
          >
            <div>
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Emergências Hoje</span>
              <div className="mt-3 w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-bold ${stats.emergenciesToday > 0 ? "text-red-500 animate-pulse" : "text-white"}`}>
                {stats.emergenciesToday}
              </div>
              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Incidentes</span>
            </div>
          </div>

          {/* Signals Received Today - CONTADOR REAL */}
          <div className="bg-zinc-900/90 backdrop-blur-xl p-6 rounded-2xl border border-white/5 flex justify-between items-center shadow-lg">
            <div>
              <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">Sinais Recebidos Hoje</span>
              <div className="mt-3">
                <Wifi className="w-8 h-8 text-yellow-500" />
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-white font-mono">{stats.signalsToday}</div>
              <span className="text-[8px] font-bold text-green-400 uppercase tracking-widest flex items-center justify-end gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Pacotes API
              </span>
            </div>
          </div>

          {/* Disconnected Helmets */}
          <div 
            onClick={onOpenHelmetModal}
            className="bg-zinc-900/90 backdrop-blur-xl p-6 rounded-2xl border border-white/5 flex justify-between items-center shadow-lg hover:border-white/20 transition-all cursor-pointer group"
          >
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Capacetes em Espera</span>
              <div className="mt-3">
                <Plug className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-white font-mono">{stats.disconnectedHelmets}</div>
              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Almoxarifado</span>
            </div>
          </div>
        </div>

        {/* Telemetria ao Vivo do ESP32 na Tela Principal */}
        <div className="px-8 pb-8">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-6 border-b border-white/5 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-wide">
                    Telemetria ao Vivo do Dispositivo ESP32 (Hardware IoT)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Operador Vinculado: <span className="text-yellow-400 font-semibold">{connectedHelmet?.name || "Gabriel Araújo (EMP001)"}</span> • IP Local: <span className="font-mono text-zinc-300">{telemetry?.ip || "192.168.0.122"}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Transmissão Contínua (1 Hz)
                </span>
                <button
                  onClick={onNavigateToMap}
                  className="px-4 py-1.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  Ver no Mapa
                </button>
              </div>
            </div>

            {/* Grid de Sensores */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Força G Atual */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {effectiveRole === "MASTER" ? "Aceleração (MPU6050)" : "Aceleração Cinemática"}
                  </span>
                  <Gauge className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="text-3xl font-bold text-white font-mono">
                  {telemetry?.aceleracaoG !== undefined ? telemetry.aceleracaoG.toFixed(2) : "1.00"} <span className="text-sm font-bold text-yellow-500 font-sans">G</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-2">
                  Pico Máximo Registrado: <strong className="text-zinc-300">
                    {telemetry?.picoAceleracaoG !== undefined && telemetry.picoAceleracaoG > 0
                      ? telemetry.picoAceleracaoG.toFixed(2)
                      : (telemetry?.picoG !== undefined && telemetry.picoG > 0
                          ? telemetry.picoG.toFixed(2)
                          : (telemetry?.aceleracaoG !== undefined && telemetry.aceleracaoG > 0 
                              ? telemetry.aceleracaoG.toFixed(2) 
                              : "1.00"))} G
                  </strong>
                </p>
              </div>

              {/* Pontuação de Risco / Impacto */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pontuação de Impacto</span>
                  <Zap className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-bold font-mono ${(telemetry?.pontuacao ?? 0) >= 60 ? "text-red-500" : "text-green-400"}`}>
                    {telemetry?.pontuacao ?? 10}
                  </span>
                  <span className="text-sm font-bold text-zinc-500 font-mono">/100</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mt-3">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      (telemetry?.pontuacao ?? 0) >= 60 ? "bg-red-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(Math.max((telemetry?.pontuacao ?? 10), 5), 100)}%` }}
                  />
                </div>
              </div>

              {/* Sensores SW-420 e FC-04 */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-white/5 space-y-2.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  {effectiveRole === "MASTER" ? "Módulos de Detecção (Hardware)" : "Sensores de Proteção"}
                </span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">
                    {effectiveRole === "MASTER" ? "Vibração (SW-420):" : "Sensor de Vibração:"}
                  </span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                    telemetry?.vibracao ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {telemetry?.vibracao ? "Detectada" : "Estável"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">
                    {effectiveRole === "MASTER" ? "Ruído/Som (FC-04):" : "Sensor Acústico:"}
                  </span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                    telemetry?.som ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {telemetry?.som ? "Som Ativo" : "Normal"}
                  </span>
                </div>
              </div>

              {/* GPS NEO-6M & Satélites */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {effectiveRole === "MASTER" ? "GPS (NEO-6M)" : "Geolocalização / GPS"}
                  </span>
                  <MapPin className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="text-xs space-y-1 mt-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Sinal Satélite:</span>
                    <strong className={telemetry?.gpsValido ? "text-green-400" : "text-yellow-500"}>
                      {telemetry?.gpsValido ? "Sinal Válido" : "Aguardando Visada"}
                    </strong>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Coordenadas:</span>
                    <span className="font-mono text-[11px] text-zinc-200">
                      {connectedHelmet != null ? `${connectedHelmet.lat.toFixed(4)}, ${connectedHelmet.lng.toFixed(4)}` : "-- , --"}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Altitude:</span>
                    <span className="text-zinc-200">{telemetry?.altitude ?? 0} m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Sections: Atividades & Atalhos de Controle */}
        <div className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Atividades Recentes */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Bell className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Atividades & Histórico</h2>
            </div>
            <div className="space-y-3">
              {activities.length > 0 ? activities.slice(0, 5).map(act => (
                <div key={act.id} className="bg-zinc-900/40 p-4 rounded-xl border border-white/5 flex items-start gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 ${
                    act.type === "EMERGENCY" ? "bg-red-500 animate-pulse" :
                    act.type === "CONNECT" ? "bg-green-500" : "bg-yellow-500"
                  }`} />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="text-sm font-bold text-zinc-200">{act.title}</h4>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(act.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{act.description}</p>
                    {act.employeeName && (
                      <p className="text-[10px] text-yellow-500/80 mt-1">{act.employeeName}</p>
                    )}
                  </div>
                </div>
              )) : (
                <div className="text-zinc-600 text-xs italic p-4 bg-zinc-900/20 rounded-xl">
                  Nenhuma atividade crítica recente.
                </div>
              )}
            </div>
          </section>

          {/* Módulos do Sistema */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Monitor className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Módulos Administrativos</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Capacetes */}
              <button 
                onClick={onOpenHelmetModal}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 rounded-xl border border-white/5 flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
                  <HardHat className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider block group-hover:text-yellow-400 transition-colors">
                    Capacetes
                  </span>
                  <span className="text-[10px] text-zinc-500">Firmware & Inspeção</span>
                </div>
              </button>

              {/* Funcionários */}
              <button 
                onClick={onOpenEmployeeModal}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 rounded-xl border border-white/5 flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider block group-hover:text-blue-300 transition-colors">
                    Operadores
                  </span>
                  <span className="text-[10px] text-zinc-500">RH & Turnos</span>
                </div>
              </button>

              {/* Usuários RBAC */}
              {effectiveRole !== "VIEWER" && (
                <button 
                  onClick={onOpenUserModal}
                  className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 rounded-xl border border-white/5 flex items-center gap-4 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider block group-hover:text-purple-300 transition-colors">
                      Acessos RBAC
                    </span>
                    <span className="text-[10px] text-zinc-500">Master & Permissões</span>
                  </div>
                </button>
              )}

              {/* Normas & Laudos */}
              <button 
                onClick={onOpenAnalyticsModal}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 rounded-xl border border-white/5 flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                  <FileCheck2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider block group-hover:text-green-300 transition-colors">
                    Normas & Laudos
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {effectiveRole === "MASTER" ? "NR-06, NR-12 & TCC" : "NR-06 & NR-12"}
                  </span>
                </div>
              </button>
            </div>
          </section>
        </div>

        {/* Footer com Políticas LGPD, Cookies e Acessibilidade */}
        <footer className="p-8 border-t border-white/5 mt-auto bg-zinc-950/60">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <div>
              <p className="text-xs font-semibold text-zinc-300">
                Industrial Safety Monitor • Sistema de Monitoramento IoT com ESP32
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Em conformidade com NR-06 (EPI), NR-12 (Segurança em Máquinas) e LGPD (Lei nº 13.709/2018)
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-400">
              {onOpenPrivacyPolicy && (
                <button
                  onClick={onOpenPrivacyPolicy}
                  className="hover:text-yellow-400 underline underline-offset-4 transition-colors flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-yellow-500" />
                  <span>Política de Privacidade (LGPD)</span>
                </button>
              )}
              <button
                onClick={onOpenAnalyticsModal}
                className="hover:text-yellow-400 underline underline-offset-4 transition-colors flex items-center gap-1"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-green-400" />
                <span>Normas NR-06 & NR-12</span>
              </button>

              {faqFormsUrl ? (
                <a
                  href={faqFormsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-yellow-400 underline underline-offset-4 transition-colors flex items-center gap-1 text-zinc-300 hover:text-white"
                  title="Central de Ajuda e Formulário de FAQ"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Ajuda / FAQ</span>
                  <ExternalLink className="w-3 h-3 text-zinc-400" />
                </a>
              ) : effectiveRole === "MASTER" ? (
                <button
                  onClick={onOpenUserModal}
                  className="hover:text-yellow-400 underline underline-offset-4 transition-colors flex items-center gap-1 text-amber-400/90 group"
                  title="Configure a URL do Google Forms nas configurações do sistema"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ajuda / FAQ</span>
                  <Settings className="w-3 h-3 text-amber-400/70 group-hover:rotate-45 transition-transform" />
                </button>
              ) : null}
            </div>
          </div>
        </footer>
      </main>

      {/* Menu Mobile Drawer */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <div 
              className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm"
              onClick={() => setShowMobileMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-16 left-0 right-0 z-50 bg-zinc-900 border-b border-white/10 p-4 space-y-2 shadow-2xl md:hidden"
            >
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 mb-1">Menu Rápido Mobile</p>
              
              <button
                onClick={() => { setShowMobileMenu(false); onOpenHelmetModal(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-white/5 text-xs text-white font-semibold"
              >
                <HardHat className="w-4 h-4 text-yellow-500" />
                <span>Capacetes Inteligentes</span>
              </button>

              <button
                onClick={() => { setShowMobileMenu(false); onOpenEmployeeModal(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-white/5 text-xs text-white font-semibold"
              >
                <Users className="w-4 h-4 text-yellow-500" />
                <span>Operadores de Campo</span>
              </button>

              {effectiveRole !== "VIEWER" && (
                <button
                  onClick={() => { setShowMobileMenu(false); onOpenUserModal(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-white/5 text-xs text-white font-semibold"
                >
                  <Shield className="w-4 h-4 text-yellow-500" />
                  <span>Controle de Usuários RBAC</span>
                </button>
              )}

              <button
                onClick={() => { setShowMobileMenu(false); onOpenAnalyticsModal(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-white/5 text-xs text-white font-semibold"
              >
                <FileCheck2 className="w-4 h-4 text-yellow-500" />
                <span>Normas NR-06 & NR-12</span>
              </button>

              {faqFormsUrl ? (
                <a
                  href={faqFormsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowMobileMenu(false)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-white/5 text-xs text-white font-semibold"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-4 h-4 text-yellow-500" />
                    <span>Ajuda / FAQ</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                </a>
              ) : effectiveRole === "MASTER" ? (
                <button
                  onClick={() => { setShowMobileMenu(false); onOpenUserModal(); }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-white/5 text-xs text-amber-400 font-semibold"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <span>Ajuda / FAQ (Configurar URL)</span>
                  </div>
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                </button>
              ) : null}

              <button
                onClick={() => { setShowMobileMenu(false); onNavigateToMap(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-yellow-500 text-black text-xs font-bold uppercase tracking-wider"
              >
                <MapIcon className="w-4 h-4" />
                <span>Ver Mapa ao Vivo</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal de Perfil do Usuário */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={currentUser}
        onUpdateUser={onUpdateUser}
      />
    </div>
  );
}
