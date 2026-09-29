import { useEffect, useState, useRef } from "react";
import { Employee, WebSocketMessage, SystemStats, RecentActivity, UserProfile, UserRole } from "./types";
import Sidebar from "./components/Sidebar";
import Map from "./components/Map";
import VideoPlayer from "./components/VideoPlayer";
import Login from "./components/Login";
import Register from "./components/Register";
import Dashboard from "./components/Dashboard";
import HelmetManagementModal from "./components/HelmetManagementModal";
import EmployeeManagementModal from "./components/EmployeeManagementModal";
import UserManagementModal from "./components/UserManagementModal";
import SafetyAnalyticsModal from "./components/SafetyAnalyticsModal";
import CookieConsentBanner from "./components/CookieConsentBanner";
import PrivacyPolicyModal from "./components/PrivacyPolicyModal";
import ForgotPasswordModal from "./components/ForgotPasswordModal";
import { dataService } from "./services/dataService";
import { AlertCircle, Bell, X, ArrowLeft, Users as UsersIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>("EMP001");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [username, setUsername] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("COMPANY_ADMIN");
  const [view, setView] = useState<"HOME" | "MAP">("HOME");
  const [loginError, setLoginError] = useState("");
  const [loginSuccessMessage, setLoginSuccessMessage] = useState("");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Estados dos Modais do Sistema & LGPD
  const [showHelmetModal, setShowHelmetModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  const [stats, setStats] = useState<SystemStats>({
    signalsToday: 0,
    emergenciesToday: 0,
    activeHelmets: 1,
    disconnectedHelmets: 3,
    systemStatus: "NOMINAL"
  });

  const [activities, setActivities] = useState<RecentActivity[]>([]);

  const [currentUser, setCurrentUser] = useState<UserProfile>({
    firstName: "Admin",
    lastName: "Empresa",
    username: "Gbxm",
    role: "COMPANY_ADMIN",
    cpf: "123.456.789-00",
    position: "Engenheiro de Segurança / Admin",
    department: "Centro de Operações Industriais (COI)",
    email: "gbxm.seguranca@industrial.com",
    phone: "(11) 98765-4321"
  });

  const ws = useRef<WebSocket | null>(null);

  // Carrega lista inicial de funcionários do dataService (Supabase ou Local)
  useEffect(() => {
    const initData = async () => {
      const initialEmps = await dataService.getEmployees();
      if (initialEmps && initialEmps.length > 0) {
        setEmployees(initialEmps);
        const activeCount = initialEmps.filter(e => e.status !== "OFFLINE").length;
        const disconnectedCount = initialEmps.filter(e => e.status === "OFFLINE").length;
        setStats(prev => ({
          ...prev,
          activeHelmets: activeCount,
          disconnectedHelmets: disconnectedCount
        }));
      }
    };
    initData();
  }, []);

  // Sincronização Bidirecional em Tempo Real com Supabase
  // (Atualizações feitas na raiz do Supabase refletem instantaneamente no Safety Monitor)
  useEffect(() => {
    const unsubscribe = dataService.subscribeToRealtime((table, event, record) => {
      console.log(`[Supabase Realtime Sync] Tabela: ${table}, Evento: ${event}`, record);

      if (table === "employees") {
        setEmployees((prev) => {
          if (event === "INSERT") {
            return prev.some(e => e.id === record.id) ? prev : [...prev, record];
          } else if (event === "UPDATE") {
            return prev.map(e => e.id === record.id ? { ...e, ...record } : e);
          } else if (event === "DELETE") {
            return prev.filter(e => e.id !== record.id);
          }
          return prev;
        });
      } else if (table === "users") {
        // Se for atualização do usuário atual, sincronizar permissões RBAC e dados de perfil ao vivo
        if (record && record.username === username) {
          if (record.role && record.role !== userRole) {
            setUserRole(record.role);
          }
          setCurrentUser(prev => ({
            ...prev,
            firstName: record.firstName !== undefined ? record.firstName : prev.firstName,
            lastName: record.lastName !== undefined ? record.lastName : prev.lastName,
            role: record.role || prev.role,
            cpf: record.cpf !== undefined ? record.cpf : prev.cpf,
            position: record.position !== undefined ? record.position : prev.position,
            department: record.department !== undefined ? record.department : prev.department,
            email: record.email !== undefined ? record.email : prev.email,
            phone: record.phone !== undefined ? record.phone : prev.phone
          }));
        }
      } else if (table === "accident_events" && event === "INSERT") {
        setStats(prev => ({
          ...prev,
          emergenciesToday: prev.emergenciesToday + 1,
          systemStatus: "EMERGENCY"
        }));
        setActivities(prev => [
          {
            id: `realtime-acc-${Date.now()}`,
            title: "Alerta de Impacto (Supabase Cloud)",
            description: `Impacto detectado em ${record.employeeName || "Operador"} (${record.aceleracaoG}g)`,
            timestamp: Date.now(),
            type: "EMERGENCY",
            employeeName: record.employeeName,
            employeeId: record.employeeId
          },
          ...prev.slice(0, 19)
        ]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [username, userRole]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Obter localização do usuário
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: "SET_BASE_LOCATION", lat: latitude, lng: longitude }));
          }
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }

    let isSubscribed = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    // Suporte a VITE_API_URL para deploy no Vercel e túnel ngrok
    const apiBaseUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
    let wsUrl: string;
    if (apiBaseUrl) {
      const baseWs = apiBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
      wsUrl = baseWs.includes("ngrok")
        ? `${baseWs}?ngrok-skip-browser-warning=true`
        : baseWs;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      wsUrl = `${protocol}//${host}`;
    }

    const connectWebSocket = () => {
      if (!isSubscribed) return;
      try {
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          if (userLocation) {
            ws.current?.send(JSON.stringify({ type: "SET_BASE_LOCATION", lat: userLocation[0], lng: userLocation[1] }));
          }
        };

        ws.current.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            if (message.type === "INITIAL_STATE" || message.type === "UPDATE") {
              setEmployees(message.data);
              if (message.stats) {
                setStats(message.stats);
              }
              if (message.activities) {
                setActivities(message.activities);
              }
            }
          } catch (err) {
            console.error("Erro ao processar mensagem do WebSocket", err);
          }
        };

        ws.current.onclose = () => {
          if (isSubscribed) {
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
          }
        };

        ws.current.onerror = () => {
          ws.current?.close();
        };
      } catch {
        console.info("WebSocket não disponível no momento. Operando via polling HTTP contínuo.");
      }
    };

    connectWebSocket();

    // Fallback de polling HTTP para garantir telemetria contínua do ESP32 mesmo se o WebSocket oscilar no Vercel / ngrok
    const pollingInterval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const targetUrl = apiBaseUrl || "";
        const [dadosRes, statsRes] = await Promise.all([
          fetch(`${targetUrl}/api/dados`, {
            headers: { "ngrok-skip-browser-warning": "true" },
            signal: AbortSignal.timeout(2000)
          }).catch(() => null),
          fetch(`${targetUrl}/api/stats`, {
            headers: { "ngrok-skip-browser-warning": "true" },
            signal: AbortSignal.timeout(2000)
          }).catch(() => null)
        ]);

        if (dadosRes && dadosRes.ok) {
          const dados = await dadosRes.json();
          if (dados && (dados.aceleracaoG !== undefined || dados.wifi)) {
            setEmployees(prev => prev.map(emp => {
              if (emp.id === "EMP001") {
                const isImpact = dados.impacto === true || dados.impacto === "true" || (Number(dados.pontuacao) >= 60);
                const latVal = typeof dados.latitude === "number" ? dados.latitude : parseFloat(dados.latitude);
                const lngVal = typeof dados.longitude === "number" ? dados.longitude : parseFloat(dados.longitude);
                const hasValidGps = (dados.gpsValido === true || dados.gpsValido === "true") && !isNaN(latVal) && !isNaN(lngVal) && (latVal !== 0 || lngVal !== 0);

                return {
                  ...emp,
                  status: isImpact ? "EMERGENCY" : (emp.status === "EMERGENCY" ? "EMERGENCY" : "ONLINE"),
                  lat: hasValidGps ? latVal : emp.lat,
                  lng: hasValidGps ? lngVal : emp.lng,
                  lastSeen: Date.now(),
                  telemetry: {
                    ...emp.telemetry,
                    aceleracao: Number(dados.aceleracao) || 0,
                    aceleracaoG: Number(dados.aceleracaoG) || 0,
                    picoAceleracaoG: Number(dados.picoAceleracaoG) || Number(dados.picoG) || 0,
                    picoG: Number(dados.picoG) || 0,
                    giroscopioGraus: Number(dados.giroscopioGraus) || 0,
                    pontuacao: Number(dados.pontuacao) || 0,
                    pontosMPU: Number(dados.pontosMPU) || 0,
                    pontosVibracao: Number(dados.pontosVibracao) || 0,
                    pontosSom: Number(dados.pontosSom) || 0,
                    vibracao: dados.vibracao === true || dados.vibracao === "true",
                    som: dados.som === true || dados.som === "true",
                    wifi: dados.wifi || "CONECTADO",
                    ip: dados.ip || "",
                    satelites: Number(dados.satelites) || 0,
                    altitude: Number(dados.altitude) || 0,
                    hdop: Number(dados.hdop) || 0,
                    gpsValido: dados.gpsValido === true || dados.gpsValido === "true",
                    mapsUrl: dados.mapsUrl || ""
                  }
                };
              }
              return emp;
            }));
          }
        }

        if (statsRes && statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData && statsData.signalsToday !== undefined) {
            setStats(prev => ({
              ...prev,
              signalsToday: statsData.signalsToday,
              emergenciesToday: statsData.emergenciesToday ?? prev.emergenciesToday,
              systemStatus: statsData.systemStatus ?? prev.systemStatus
            }));
          }
        }
      } catch {
        // Silencioso em caso de falha transitória de rede
      }
    }, 1500);

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollingInterval);
      ws.current?.close();
    };
  }, [isAuthenticated]);

  const handleLogin = async (user: string, pass: string) => {
    // 1. Tentar autenticação no serviço unificado (Supabase ou LocalStorage)
    const authRes = await dataService.authenticate(user, pass);
    if (authRes.success && authRes.user) {
      setIsAuthenticated(true);
      setUsername(authRes.user.username);
      setUserRole(authRes.role || "COMPANY_ADMIN");
      setCurrentUser(authRes.user);
      setLoginError("");
      setLoginSuccessMessage("");
      setShowForgotPasswordModal(false);
      return;
    }

    // 2. Fallback para API do servidor backend se estiver rodando
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await response.json();
      if (data.success) {
        setIsAuthenticated(true);
        setUsername(data.user.username);
        setUserRole(data.user.role || "COMPANY_ADMIN");
        if (data.user) {
          setCurrentUser({
            firstName: data.user.firstName || "Admin",
            lastName: data.user.lastName || "User",
            username: data.user.username || user,
            role: data.user.role || "COMPANY_ADMIN",
            cpf: data.user.cpf || "123.456.789-00",
            position: data.user.position || "Engenheiro de Segurança / Admin",
            department: data.user.department || "Centro de Operações Industriais (COI)",
            email: data.user.email || "gbxm.seguranca@industrial.com",
            phone: data.user.phone || "(11) 98765-4321"
          });
        }
        setLoginError("");
        setLoginSuccessMessage("");
        setShowForgotPasswordModal(false);
        return;
      }
    } catch {}

    setLoginError(authRes.message || "Usuário ou senha incorretos.");
  };

  const handleUpdateUser = async (updated: UserProfile): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await dataService.saveUser(updated, currentUser.username);
      if (res.success) {
        setCurrentUser(updated);
        setUsername(updated.username);
        return { success: true, message: res.message || "Perfil atualizado e sincronizado com o Supabase com sucesso!" };
      } else {
        return { success: false, message: res.message || "Erro ao atualizar perfil no Supabase." };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || "Falha ao processar atualização do perfil." };
    }
  };

  const handleRegister = async (userData: any): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await dataService.saveUser({
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
        password: userData.password,
        role: "VIEWER",
        cpf: userData.cpf,
        position: userData.position,
        department: userData.department,
        email: userData.email,
        phone: userData.phone,
        active: true
      }, "register");

      if (res.success) {
        setAuthView("LOGIN");
        setLoginError("");
        setLoginSuccessMessage("Cadastro realizado com sucesso no Supabase! Você já pode entrar.");
        return { success: true };
      } else {
        return { success: false, message: res.message || "Erro ao cadastrar usuário no Supabase." };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || "Erro ao cadastrar usuário." };
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername("");
    setUserRole("VIEWER");
    setView("HOME");
    setSelectedEmployeeId(null);
  };

  const ignoreEmergency = (employeeId: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "IGNORE_EMERGENCY", employeeId }));
    }
  };

  const reloadEmployees = async () => {
    const emps = await dataService.getEmployees();
    setEmployees(emps);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;

  if (!isAuthenticated) {
    return (
      <>
        {authView === "REGISTER" ? (
          <Register 
            onRegister={handleRegister} 
            onGoBack={() => {
              setAuthView("LOGIN");
              setLoginError("");
            }} 
          />
        ) : (
          <Login 
            onLogin={handleLogin} 
            onGoToRegister={() => {
              setAuthView("REGISTER");
              setLoginError("");
              setLoginSuccessMessage("");
            }}
            onForgotPassword={() => {
              setLoginError("");
              setLoginSuccessMessage("");
              setShowForgotPasswordModal(true);
            }}
            error={loginError} 
            successMessage={loginSuccessMessage}
          />
        )}

        {/* Modal de Recuperação de Senha com OTP - Exibido diretamente na tela de Login */}
        <ForgotPasswordModal
          isOpen={showForgotPasswordModal}
          onClose={() => setShowForgotPasswordModal(false)}
          onSuccess={() => {
            setShowForgotPasswordModal(false);
            setLoginError("");
            setLoginSuccessMessage("Senha redefinida com sucesso! Você já pode entrar com sua nova senha.");
          }}
        />

        {/* Modal de Política de Privacidade e Diretrizes LGPD */}
        <PrivacyPolicyModal
          isOpen={showPrivacyPolicyModal}
          onClose={() => setShowPrivacyPolicyModal(false)}
        />

        {/* Banner de Gestão de Cookies e Consentimento LGPD */}
        <CookieConsentBanner 
          onOpenPrivacyPolicy={() => setShowPrivacyPolicyModal(true)} 
        />
      </>
    );
  }

  return (
    <>
      {view === "HOME" ? (
        <Dashboard 
          username={username}
          userRole={userRole}
          employees={employees}
          stats={stats}
          activities={activities}
          currentUser={currentUser}
          onNavigateToMap={() => setView("MAP")} 
          onLogout={handleLogout}
          onUpdateUser={handleUpdateUser}
          onOpenHelmetModal={() => setShowHelmetModal(true)}
          onOpenEmployeeModal={() => setShowEmployeeModal(true)}
          onOpenUserModal={() => setShowUserModal(true)}
          onOpenAnalyticsModal={() => setShowAnalyticsModal(true)}
          onOpenPrivacyPolicy={() => setShowPrivacyPolicyModal(true)}
        />
      ) : (
        <div className="min-h-screen w-full bg-zinc-950 flex flex-col md:flex-row overflow-x-hidden font-sans">
          {/* Barra Lateral / Sidebar Responsiva */}
          <div className="flex flex-col md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900">
            <div className="p-3 bg-zinc-900 flex items-center justify-between border-b border-zinc-800">
              <button 
                onClick={() => setView("HOME")}
                className="text-zinc-400 hover:text-white flex items-center gap-2 transition-colors cursor-pointer text-xs font-bold uppercase tracking-widest p-2 rounded-xl hover:bg-zinc-800"
                aria-label="Voltar para o Painel Principal"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Painel Principal</span>
              </button>

              <button
                onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                className="md:hidden flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-800 text-yellow-500 text-xs font-bold"
                aria-label="Alternar lista de operadores"
              >
                <UsersIcon className="w-3.5 h-3.5" />
                <span>Operadores</span>
              </button>
            </div>

            <div className={`md:block ${showMobileSidebar ? "block" : "hidden md:block"}`}>
              <Sidebar 
                employees={employees} 
                selectedEmployeeId={selectedEmployeeId} 
                onSelectEmployee={(id) => {
                  setSelectedEmployeeId(id);
                  setShowMobileSidebar(false);
                }} 
                onIgnoreEmergency={ignoreEmergency}
              />
            </div>
          </div>

          {/* Área Principal de Monitoramento (Mapa + Vídeo + Atividades) com Rolagem Natural */}
          <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
            {/* Mapa ao Vivo */}
            <div className="h-[50vh] min-h-[380px] lg:h-[60vh] relative border-b border-zinc-800 w-full">
              <Map 
                employees={employees} 
                selectedEmployeeId={selectedEmployeeId} 
                onSelectEmployee={setSelectedEmployeeId} 
                userLocation={userLocation}
                userRole={userRole}
              />
              
              {/* Map Overlay Controls */}
              <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
                 <div className="bg-zinc-900/90 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-zinc-800 shadow-2xl">
                    <div className="flex items-center gap-2.5 mb-2">
                       <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                       <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                         {stats.systemStatus === "EMERGENCY" ? "Alerta de Emergência Ativo" : "Sistema Nominal"}
                       </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                       <div>
                          <div className="text-[9px] text-zinc-500 uppercase font-bold">Capacetes Ativos</div>
                          <div className="text-base font-bold text-zinc-100">{employees.filter(e => e.status !== "OFFLINE").length}</div>
                       </div>
                       <div>
                          <div className="text-[9px] text-zinc-500 uppercase font-bold">Emergências</div>
                          <div className="text-base font-bold text-red-500">{employees.filter(e => e.status === "EMERGENCY").length}</div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* Painel Inferior Responsivo: Câmera/Vídeo & Atividades Críticas */}
            <div className="flex-1 flex flex-col lg:flex-row w-full bg-zinc-950">
              <div className="flex-1 p-4 bg-zinc-950 border-b lg:border-b-0 lg:border-r border-zinc-800">
                <VideoPlayer employee={selectedEmployee} />
              </div>
              
              <div className="w-full lg:w-96 bg-zinc-900 p-5 md:p-6 overflow-y-auto max-h-96 lg:max-h-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-yellow-500" />
                    Atividades Críticas em Tempo Real
                  </h3>
                </div>
                <div className="space-y-3">
                  {employees.filter(e => e.status === "EMERGENCY" || e.status === "OFFLINE").length === 0 ? (
                    <div className="text-center py-6 text-zinc-600 text-xs italic">
                      Nenhuma atividade crítica registrada no momento.
                    </div>
                  ) : (
                    employees.filter(e => e.status === "EMERGENCY" || e.status === "OFFLINE").map(emp => (
                      <div key={emp.id} className="flex gap-3 items-start border-l-2 border-zinc-800 pl-3 py-1 group">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 shrink-0",
                          emp.status === "EMERGENCY" ? "bg-red-500 animate-pulse" : "bg-zinc-600"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-1">
                            <p className="text-xs font-bold text-zinc-200 truncate">
                              {emp.status === "EMERGENCY" ? "Alerta de Impacto (ESP32)" : "Capacete Desconectado"}
                            </p>
                            {emp.status === "EMERGENCY" && (
                              <button 
                                onClick={() => ignoreEmergency(emp.id)}
                                className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 transition-colors"
                              >
                                Reconhecer
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {emp.name} ({emp.id}) • {new Date().toLocaleTimeString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Modais do Sistema */}
      <HelmetManagementModal
        isOpen={showHelmetModal}
        onClose={() => setShowHelmetModal(false)}
        userRole={userRole}
        employees={employees}
        onRefreshData={reloadEmployees}
      />

      <EmployeeManagementModal
        isOpen={showEmployeeModal}
        onClose={() => setShowEmployeeModal(false)}
        userRole={userRole}
        onRefreshData={reloadEmployees}
      />

      <UserManagementModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        currentUserRole={userRole}
        currentUsername={username}
      />

      <SafetyAnalyticsModal
        isOpen={showAnalyticsModal}
        onClose={() => setShowAnalyticsModal(false)}
        employees={employees}
        userRole={userRole}
      />

      {/* Modal de Política de Privacidade e Diretrizes LGPD */}
      <PrivacyPolicyModal
        isOpen={showPrivacyPolicyModal}
        onClose={() => setShowPrivacyPolicyModal(false)}
      />

      {/* Banner de Gestão de Cookies e Consentimento LGPD */}
      <CookieConsentBanner 
        onOpenPrivacyPolicy={() => setShowPrivacyPolicyModal(true)} 
      />

      {/* Modal de Recuperação de Senha com OTP */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        onSuccess={() => setShowForgotPasswordModal(false)}
      />
    </>
  );
}
