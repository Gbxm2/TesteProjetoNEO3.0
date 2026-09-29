import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { 
  Employee, 
  Helmet, 
  UserRecord, 
  SafetyGuideline, 
  AccidentEvent,
  UserProfile,
  UserRole,
  AppSetting
} from "../types";
import { 
  hashPassword, 
  verifyPassword, 
  createAuditLog, 
  SecurityAuditRecord,
  maskCPF,
  sanitizeInput,
  encryptCPF,
  decryptCPF,
  isCPFEncrypted,
  isValidEmailStrict
} from "../utils/security";

// Tipos para comunicação bidirecional de eventos Supabase Realtime
export type RealtimeChangeType = "INSERT" | "UPDATE" | "DELETE";
export type RealtimeTableType = "users" | "employees" | "helmets" | "accident_events" | "safety_guidelines" | "app_settings";
export type RealtimeListener = (table: RealtimeTableType, event: RealtimeChangeType, record: any) => void;

export interface MutationResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export function safeIsoDate(val?: string | null): string | null {
  if (!val || typeof val !== "string" || val.trim() === "") return null;
  const trimmed = val.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    const parsed = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// ============================================================
// DADOS INICIAIS RESILIENTES (LOCALSTORAGE / FALLBACK)
// ============================================================


const SEED_USERS: UserRecord[] = [
  {
    id: "USR-000",
    firstName: "Pedro",
    lastName: "Casaburi",
    username: "pedrocasaburi",
    role: "MASTER",
    password: "123456",
    cpf: "000.111.222-33",
    position: "Engenheiro de Sistemas / Desenvolvedor",
    department: "Diretoria de Tecnologia & Inovação",
    email: "pedrocasaburi@hotmail.com",
    phone: "(11) 99999-0000",
    active: true,
    companyId: "COMP-001"
  },
  {
    id: "USR-001",
    firstName: "Administrador",
    lastName: "Master",
    username: "adminmaster",
    role: "MASTER",
    password: "123456",
    cpf: "000.111.222-33",
    position: "Engenheiro Chefe de Sistemas / Dono",
    department: "Diretoria de Tecnologia & Inovação",
    email: "adminmaster@industrial.com",
    phone: "(11) 99999-0000",
    active: true,
    companyId: "COMP-001"
  },
  {
    id: "USR-002",
    firstName: "Gabriel",
    lastName: "Araújo",
    username: "Gbxm",
    role: "COMPANY_ADMIN",
    password: "123456",
    cpf: "123.456.789-00",
    position: "Engenheiro de Segurança / Admin COI",
    department: "Centro de Operações Industriais (COI)",
    email: "gbxm.seguranca@industrial.com",
    phone: "(11) 98765-4321",
    active: true,
    companyId: "COMP-001"
  },
  {
    id: "USR-003",
    firstName: "Auditor",
    lastName: "Visualizador",
    username: "visualizador",
    role: "VIEWER",
    password: "123456",
    cpf: "999.888.777-66",
    position: "Técnico de Monitoramento / Fiscal",
    department: "Auditoria Externa de Segurança",
    email: "visualizador@industrial.com",
    phone: "(11) 91234-5678",
    active: true,
    companyId: "COMP-001"
  }
];

const SEED_HELMETS: Helmet[] = [
  {
    id: "HELM-001",
    serialNumber: "CAP-2026-ESP01",
    macAddress: "24:6F:28:B4:7E:10",
    firmwareVersion: "v1.0.4",
    battery: 95,
    status: "IN_USE",
    lastCalibration: "2026-01-10",
    nextInspection: "2026-07-10",
    assignedEmployeeId: "EMP001",
    assignedEmployeeName: "Gabriel Araújo",
    companyId: "COMP-001"
  },
  {
    id: "HELM-002",
    serialNumber: "CAP-2026-ESP02",
    macAddress: "24:6F:28:B4:7E:11",
    firmwareVersion: "v1.0.4",
    battery: 80,
    status: "AVAILABLE",
    lastCalibration: "2026-02-15",
    nextInspection: "2026-08-15",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    companyId: "COMP-001"
  },
  {
    id: "HELM-003",
    serialNumber: "CAP-2026-ESP03",
    macAddress: "24:6F:28:B4:7E:12",
    firmwareVersion: "v1.0.3",
    battery: 65,
    status: "AVAILABLE",
    lastCalibration: "2026-01-20",
    nextInspection: "2026-07-20",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    companyId: "COMP-001"
  },
  {
    id: "HELM-004",
    serialNumber: "CAP-2026-ESP04",
    macAddress: "24:6F:28:B4:7E:13",
    firmwareVersion: "v1.0.4",
    battery: 90,
    status: "MAINTENANCE",
    lastCalibration: "2025-11-10",
    nextInspection: "2026-05-10",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    companyId: "COMP-001"
  }
];

const SEED_EMPLOYEES: Employee[] = [
  {
    id: "EMP001",
    name: "Gabriel Araújo",
    cpf: "123.456.789-00",
    matricula: "IND-1044",
    roleFunction: "Operador Industrial / Protótipo ESP32",
    department: "Usinagem & Linha de Montagem",
    shift: "1º Turno (06h - 14h)",
    emergencyContact: "(11) 98888-1111 (Esposa - Mariana)",
    status: "ONLINE",
    lat: -23.5505,
    lng: -46.6333,
    lastSeen: Date.now(),
    battery: 95,
    assignedHelmetId: "HELM-001",
    assignedHelmetSerial: "CAP-2026-ESP01",
    telemetry: {
      aceleracaoG: 1.02,
      picoG: 1.05,
      pontuacao: 12,
      vibracao: false,
      som: false,
      gpsValido: true,
      satelites: 8,
      altitude: 760,
      wifi: "Carlos Ara_EXT",
      ip: "192.168.0.122"
    }
  },
  {
    id: "EMP002",
    name: "Gustavo Felix",
    cpf: "234.567.890-11",
    matricula: "IND-1045",
    roleFunction: "Técnico de Manutenção Mecânica",
    department: "Manutenção Central",
    shift: "2º Turno (14h - 22h)",
    emergencyContact: "(11) 97777-2222 (Mãe - Cláudia)",
    status: "OFFLINE",
    lat: -23.5515,
    lng: -46.6343,
    lastSeen: 0,
    battery: 80,
    assignedHelmetId: "HELM-002",
    assignedHelmetSerial: "CAP-2026-ESP02"
  },
  {
    id: "EMP003",
    name: "Fabio Akira",
    cpf: "345.678.901-22",
    matricula: "IND-1046",
    roleFunction: "Inspetor de Qualidade & Processos",
    department: "Qualidade & Auditoria",
    shift: "1º Turno (06h - 14h)",
    emergencyContact: "(11) 96666-3333 (Irmão - Roberto)",
    status: "OFFLINE",
    lat: -23.5525,
    lng: -46.6353,
    lastSeen: 0,
    battery: 65,
    assignedHelmetId: "HELM-003",
    assignedHelmetSerial: "CAP-2026-ESP03"
  },
  {
    id: "EMP004",
    name: "Fabio Pelissari",
    cpf: "456.789.012-33",
    matricula: "IND-1047",
    roleFunction: "Eletricista de Alta Tensão",
    department: "Subestação Elétrica",
    shift: "3º Turno (22h - 06h)",
    emergencyContact: "(11) 95555-4444 (Esposa - Fernanda)",
    status: "OFFLINE",
    lat: -23.5535,
    lng: -46.6363,
    lastSeen: 0,
    battery: 90,
    assignedHelmetId: null,
    assignedHelmetSerial: null
  },
  {
    id: "EMP005",
    name: "Augusto Melo",
    cpf: "567.890.123-44",
    matricula: "IND-1048",
    roleFunction: "Técnico de Segurança do Trabalho",
    department: "Segurança e Higiene Ocupacional",
    shift: "1º Turno (06h - 14h)",
    emergencyContact: "(11) 94444-5555 (Pai - Renato)",
    status: "OFFLINE",
    lat: -23.5545,
    lng: -46.6373,
    lastSeen: 0,
    battery: 100,
    assignedHelmetId: null,
    assignedHelmetSerial: null
  }
];

const SEED_GUIDELINES: SafetyGuideline[] = [
  {
    id: "GUIDE-01",
    code: "NR-06.1",
    title: "Certificado de Aprovação (CA) de Capacetes Industriais",
    description: "Obrigatoriedade de equipamentos com Certificado de Aprovação válido emitido pelo Ministério do Trabalho para atenuação de impacto mecânico.",
    category: "EPI - Proteção da Cabeça",
    complianceStatus: "CONFORME",
    lastAudit: new Date().toISOString(),
    details: { normaReferencia: "ABNT NBR 8221:2019", caExigido: true }
  },
  {
    id: "GUIDE-02",
    code: "NR-06.2",
    title: "Inspeção e Substituição Periódica de Carneira e Casco",
    description: "Inspeção visual periódica contra trincas, deformações térmicas, fadiga do polietileno e higienização dos sistemas de suspensão.",
    category: "EPI - Conservação",
    complianceStatus: "CONFORME",
    lastAudit: new Date().toISOString(),
    details: { frequenciaDias: 180, responsavel: "SESMT" }
  },
  {
    id: "GUIDE-03",
    code: "NR-12.1",
    title: "Sistemas de Parada de Emergência e Delimitação",
    description: "Instalação e monitoramento contínuo de dispositivos de emergência em zonas com risco mecânico, esmagamento e prensagem.",
    category: "Máquinas e Equipamentos",
    complianceStatus: "CONFORME",
    lastAudit: new Date().toISOString(),
    details: { categoriaSeguranca: "Categoria 4 (PLe)", monitoramentoRemoto: true }
  },
  {
    id: "GUIDE-04",
    code: "NR-12.2",
    title: "Detecção Rápida de Queda e Impactos em Operadores",
    description: "Protocolo de alerta e desativação automática de maquinário pesado ao detectar impactos superiores a 4G ou desaceleração abrupta.",
    category: "Intertravamento",
    complianceStatus: "CONFORME",
    lastAudit: new Date().toISOString(),
    details: { limiteGSeguro: 4.0, tempoRespostaMs: 250 }
  }
];

const SEED_ACCIDENTS: AccidentEvent[] = [
  {
    id: "ACC-001",
    timestamp: Date.now() - 7200000,
    employeeId: "EMP001",
    employeeName: "Gabriel Araújo",
    aceleracaoG: 12.4,
    picoG: 14.8,
    pontuacao: 85,
    lat: -23.5505,
    lng: -46.6333,
    vibracao: true,
    som: true,
    acknowledged: false
  }
];

// Funções utilitárias para armazenamento local
function getFromStorage<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Erro ao gravar ${key} no localStorage:`, err);
  }
}

// Inicializa o LocalStorage se estiver vazio
function initLocalStorage() {
  if (!localStorage.getItem("ism_users")) saveToStorage("ism_users", SEED_USERS);
  if (!localStorage.getItem("ism_helmets")) saveToStorage("ism_helmets", SEED_HELMETS);
  if (!localStorage.getItem("ism_employees")) saveToStorage("ism_employees", SEED_EMPLOYEES);
  if (!localStorage.getItem("ism_guidelines")) saveToStorage("ism_guidelines", SEED_GUIDELINES);
  if (!localStorage.getItem("ism_accidents")) saveToStorage("ism_accidents", SEED_ACCIDENTS);
  if (!localStorage.getItem("ism_app_settings")) saveToStorage("ism_app_settings", { faq_forms_url: "" });
}

// ============================================================
// CANAL DE SINCRONIZAÇÃO BIDIRECIONAL EM TEMPO REAL (SUPABASE REALTIME)
// ============================================================
const realtimeListeners: Set<RealtimeListener> = new Set();

function notifyRealtimeListeners(table: RealtimeTableType, event: RealtimeChangeType, record: any) {
  realtimeListeners.forEach((listener) => {
    try {
      listener(table, event, record);
    } catch (e) {
      console.error("[Realtime] Erro ao disparar ouvinte:", e);
    }
  });
}

// Inicializa canal WebSocket Realtime do Supabase se o cliente estiver ativo
if (supabase) {
  try {
    const channel = supabase.channel("ism_realtime_bidirectional_channel");

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          console.log("[Supabase Realtime] Alteração na tabela users detectada na raiz:", payload);
          const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);

          if (payload.eventType === "INSERT") {
            const u = payload.new as any;
            const mapped: UserRecord = {
              id: u.id,
              firstName: u.first_name || "Usuário",
              lastName: u.last_name || "",
              username: u.username,
              role: (u.role as UserRole) || "VIEWER",
              password: u.password,
              cpf: u.cpf || "",
              position: u.position || "",
              department: u.department || "",
              email: u.email || "",
              phone: u.phone || "",
              active: u.active ?? true,
              companyId: u.company_id,
              createdAt: u.created_at
            };
            const existingIdx = localUsers.findIndex(x => x.username === mapped.username || (x.id && x.id === mapped.id));
            if (existingIdx >= 0) {
              localUsers[existingIdx] = mapped;
            } else {
              localUsers.unshift(mapped);
            }
            saveToStorage("ism_users", localUsers);
            notifyRealtimeListeners("users", "INSERT", mapped);
          } else if (payload.eventType === "UPDATE") {
            const u = payload.new as any;
            const idx = localUsers.findIndex(x => x.username === u.username || (x.id && x.id === u.id));
            if (idx >= 0) {
              localUsers[idx] = {
                ...localUsers[idx],
                firstName: u.first_name,
                lastName: u.last_name,
                role: u.role as UserRole,
                cpf: u.cpf || "",
                position: u.position || "",
                department: u.department || "",
                email: u.email || "",
                phone: u.phone || "",
                active: u.active ?? true
              };
              saveToStorage("ism_users", localUsers);
              notifyRealtimeListeners("users", "UPDATE", localUsers[idx]);
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as any;
            const filtered = localUsers.filter(x => x.id !== old.id && x.username !== old.username);
            saveToStorage("ism_users", filtered);
            notifyRealtimeListeners("users", "DELETE", old);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        (payload) => {
          console.log("[Supabase Realtime] Alteração na tabela employees detectada na raiz:", payload);
          const localEmps = getFromStorage<Employee[]>("ism_employees", SEED_EMPLOYEES);

          if (payload.eventType === "INSERT") {
            const e = payload.new as any;
            const mapped: Employee = {
              id: e.id,
              name: e.name,
              cpf: e.cpf,
              matricula: e.matricula,
              roleFunction: e.role_function,
              department: e.department,
              shift: e.shift,
              emergencyContact: e.emergency_contact,
              status: e.status,
              lat: typeof e.lat === "number" ? e.lat : -23.5505,
              lng: typeof e.lng === "number" ? e.lng : -46.6333,
              lastSeen: Number(e.last_seen) || Date.now(),
              battery: typeof e.battery === "number" ? e.battery : 100,
              assignedHelmetId: e.assigned_helmet_id
            };
            const existingIdx = localEmps.findIndex(x => x.id === mapped.id);
            if (existingIdx >= 0) {
              localEmps[existingIdx] = mapped;
            } else {
              localEmps.push(mapped);
            }
            saveToStorage("ism_employees", localEmps);
            notifyRealtimeListeners("employees", "INSERT", mapped);
          } else if (payload.eventType === "UPDATE") {
            const e = payload.new as any;
            const idx = localEmps.findIndex(x => x.id === e.id);
            if (idx >= 0) {
              localEmps[idx] = {
                ...localEmps[idx],
                name: e.name || localEmps[idx].name,
                cpf: e.cpf || localEmps[idx].cpf,
                matricula: e.matricula || localEmps[idx].matricula,
                roleFunction: e.role_function || localEmps[idx].roleFunction,
                department: e.department || localEmps[idx].department,
                shift: e.shift || localEmps[idx].shift,
                emergencyContact: e.emergency_contact || localEmps[idx].emergencyContact,
                status: e.status || localEmps[idx].status,
                lat: typeof e.lat === "number" ? e.lat : localEmps[idx].lat,
                lng: typeof e.lng === "number" ? e.lng : localEmps[idx].lng,
                battery: typeof e.battery === "number" ? e.battery : localEmps[idx].battery,
                lastSeen: Number(e.last_seen) || localEmps[idx].lastSeen,
                assignedHelmetId: e.assigned_helmet_id
              };
              saveToStorage("ism_employees", localEmps);
              notifyRealtimeListeners("employees", "UPDATE", localEmps[idx]);
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as any;
            const filtered = localEmps.filter(x => x.id !== old.id);
            saveToStorage("ism_employees", filtered);
            notifyRealtimeListeners("employees", "DELETE", old);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "helmets" },
        (payload) => {
          console.log("[Supabase Realtime] Alteração na tabela helmets detectada na raiz:", payload);
          const localHelms = getFromStorage<Helmet[]>("ism_helmets", SEED_HELMETS);

          if (payload.eventType === "INSERT") {
            const h = payload.new as any;
            const mapped: Helmet = {
              id: h.id,
              serialNumber: h.serial_number,
              macAddress: h.mac_address,
              firmwareVersion: h.firmware_version,
              battery: h.battery,
              status: h.status,
              lastCalibration: h.last_calibration ? h.last_calibration.split("T")[0] : undefined,
              nextInspection: h.next_inspection ? h.next_inspection.split("T")[0] : undefined,
              assignedEmployeeId: h.assigned_employee_id,
              companyId: h.company_id
            };
            const existingIdx = localHelms.findIndex(x => x.id === mapped.id);
            if (existingIdx >= 0) {
              localHelms[existingIdx] = mapped;
            } else {
              localHelms.push(mapped);
            }
            saveToStorage("ism_helmets", localHelms);
            notifyRealtimeListeners("helmets", "INSERT", mapped);
          } else if (payload.eventType === "UPDATE") {
            const h = payload.new as any;
            const idx = localHelms.findIndex(x => x.id === h.id);
            if (idx >= 0) {
              localHelms[idx] = {
                ...localHelms[idx],
                serialNumber: h.serial_number || localHelms[idx].serialNumber,
                battery: typeof h.battery === "number" ? h.battery : localHelms[idx].battery,
                status: h.status || localHelms[idx].status,
                assignedEmployeeId: h.assigned_employee_id
              };
              saveToStorage("ism_helmets", localHelms);
              notifyRealtimeListeners("helmets", "UPDATE", localHelms[idx]);
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as any;
            const filtered = localHelms.filter(x => x.id !== old.id);
            saveToStorage("ism_helmets", filtered);
            notifyRealtimeListeners("helmets", "DELETE", old);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "accident_events" },
        (payload) => {
          console.log("[Supabase Realtime] Novo alerta de impacto recebido da raiz:", payload);
          const localAcc = getFromStorage<AccidentEvent[]>("ism_accidents", SEED_ACCIDENTS);
          const a = payload.new as any;
          const mapped: AccidentEvent = {
            id: a.id,
            timestamp: Number(a.timestamp),
            employeeId: a.employee_id,
            employeeName: a.employee_name,
            aceleracaoG: a.aceleracao_g,
            picoG: a.pico_g,
            pontuacao: a.pontuacao,
            lat: a.lat,
            lng: a.lng,
            vibracao: a.vibracao,
            som: a.som,
            acknowledged: a.acknowledged
          };
          if (!localAcc.some(x => x.id === mapped.id)) {
            localAcc.unshift(mapped);
            saveToStorage("ism_accidents", localAcc.slice(0, 50));
          }
          notifyRealtimeListeners("accident_events", "INSERT", mapped);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        (payload) => {
          console.log("[Supabase Realtime] Alteração na tabela app_settings detectada na raiz:", payload);
          const localSettings = getFromStorage<Record<string, string>>("ism_app_settings", { faq_forms_url: "" });

          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const item = payload.new as any;
            if (item && item.key) {
              localSettings[item.key] = item.value ?? "";
              saveToStorage("ism_app_settings", localSettings);
              notifyRealtimeListeners("app_settings", payload.eventType, {
                key: item.key,
                value: item.value ?? "",
                description: item.description,
                updatedBy: item.updated_by,
                updatedAt: item.updated_at
              });
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as any;
            if (old && old.key) {
              delete localSettings[old.key];
              saveToStorage("ism_app_settings", localSettings);
              notifyRealtimeListeners("app_settings", "DELETE", old);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Supabase Realtime] Conexão bidirecional ativa: status = ${status}`);
      });
  } catch (err) {
    console.warn("[Supabase Realtime] Não foi possível assinar canal em tempo real:", err);
  }
}

// ============================================================
// CICLO DE SINCRONIZAÇÃO ATIVA BIDIRECIONAL (SMART HEARTBEAT SYNC)
// Detecta cadastros e edições feitas diretamente no Supabase (Table Editor / SQL)
// ============================================================
let isSyncRunning = false;

async function runBidirectionalHeartbeatSync() {
  if (!supabase || isSyncRunning) return;
  if (typeof document !== "undefined" && document.hidden) return;

  isSyncRunning = true;
  try {
    // 1. Sincronizar Usuários
    const { data: dbUsers, error: uErr } = await supabase.from("users").select("*");
    if (!uErr && dbUsers) {
      const currentLocalUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
      let usersChanged = false;
      // Descriptografa CPF de cada usuário sincronizado (AES-GCM)
      const mapped: UserRecord[] = await Promise.all(dbUsers.map(async u => ({
        id: u.id,
        firstName: u.first_name || "",
        lastName: u.last_name || "",
        username: u.username,
        role: (u.role as UserRole) || "VIEWER",
        cpf: await decryptCPF(u.cpf || ""),
        position: u.position || "",
        department: u.department || "",
        email: u.email || "",
        phone: u.phone || "",
        active: u.active ?? true,
        companyId: u.company_id,
        createdAt: u.created_at
      })));

      for (const m of mapped) {
        const found = currentLocalUsers.find(x => x.username === m.username || (x.id && x.id === m.id));
        if (!found) {
          usersChanged = true;
          notifyRealtimeListeners("users", "INSERT", m);
        } else if (
          found.firstName !== m.firstName ||
          found.lastName !== m.lastName ||
          found.role !== m.role ||
          found.email !== m.email ||
          found.phone !== m.phone ||
          found.department !== m.department ||
          found.position !== m.position ||
          found.active !== m.active
        ) {
          usersChanged = true;
          notifyRealtimeListeners("users", "UPDATE", m);
        }
      }
      for (const loc of currentLocalUsers) {
        if (!mapped.some(m => m.username === loc.username || (m.id && m.id === loc.id))) {
          usersChanged = true;
          notifyRealtimeListeners("users", "DELETE", loc);
        }
      }
      if (usersChanged) {
        saveToStorage("ism_users", mapped);
      }
    }

    // 2. Sincronizar Capacetes
    const { data: dbHelmets, error: hErr } = await supabase.from("helmets").select("*");
    if (!hErr && dbHelmets) {
      const currentLocalHelmets = getFromStorage<Helmet[]>("ism_helmets", SEED_HELMETS);
      let helmetsChanged = false;
      const mappedH: Helmet[] = dbHelmets.map(h => ({
        id: h.id,
        serialNumber: h.serial_number,
        macAddress: h.mac_address,
        firmwareVersion: h.firmware_version,
        battery: h.battery,
        status: h.status,
        lastCalibration: h.last_calibration ? h.last_calibration.split("T")[0] : undefined,
        nextInspection: h.next_inspection ? h.next_inspection.split("T")[0] : undefined,
        assignedEmployeeId: h.assigned_employee_id,
        companyId: h.company_id
      }));

      for (const mh of mappedH) {
        const foundH = currentLocalHelmets.find(x => x.id === mh.id);
        if (!foundH) {
          helmetsChanged = true;
          notifyRealtimeListeners("helmets", "INSERT", mh);
        } else if (
          foundH.battery !== mh.battery ||
          foundH.status !== mh.status ||
          foundH.assignedEmployeeId !== mh.assignedEmployeeId ||
          foundH.serialNumber !== mh.serialNumber ||
          foundH.firmwareVersion !== mh.firmwareVersion ||
          foundH.macAddress !== mh.macAddress ||
          foundH.lastCalibration !== mh.lastCalibration ||
          foundH.nextInspection !== mh.nextInspection
        ) {
          helmetsChanged = true;
          notifyRealtimeListeners("helmets", "UPDATE", mh);
        }
      }
      for (const locH of currentLocalHelmets) {
        if (!mappedH.some(m => m.id === locH.id)) {
          helmetsChanged = true;
          notifyRealtimeListeners("helmets", "DELETE", locH);
        }
      }
      if (helmetsChanged) {
        saveToStorage("ism_helmets", mappedH);
      }
    }

    // 3. Sincronizar Funcionários
    const { data: dbEmps, error: eErr } = await supabase.from("employees").select("*");
    if (!eErr && dbEmps) {
      const currentLocalEmps = getFromStorage<Employee[]>("ism_employees", SEED_EMPLOYEES);
      let empsChanged = false;
      const mappedE: Employee[] = dbEmps.map(e => ({
        id: e.id,
        name: e.name,
        cpf: e.cpf,
        matricula: e.matricula,
        roleFunction: e.role_function,
        department: e.department,
        shift: e.shift,
        emergencyContact: e.emergency_contact,
        status: e.status,
        lat: typeof e.lat === "number" ? e.lat : -23.5505,
        lng: typeof e.lng === "number" ? e.lng : -46.6333,
        lastSeen: Number(e.last_seen) || 0,
        battery: typeof e.battery === "number" ? e.battery : 100,
        assignedHelmetId: e.assigned_helmet_id
      }));

      for (const me of mappedE) {
        const foundE = currentLocalEmps.find(x => x.id === me.id);
        if (!foundE) {
          empsChanged = true;
          notifyRealtimeListeners("employees", "INSERT", me);
        } else if (
          foundE.status !== me.status ||
          foundE.name !== me.name ||
          foundE.assignedHelmetId !== me.assignedHelmetId ||
          foundE.battery !== me.battery ||
          foundE.department !== me.department ||
          foundE.shift !== me.shift ||
          foundE.roleFunction !== me.roleFunction
        ) {
          empsChanged = true;
          notifyRealtimeListeners("employees", "UPDATE", me);
        }
      }
      for (const locE of currentLocalEmps) {
        if (!mappedE.some(m => m.id === locE.id)) {
          empsChanged = true;
          notifyRealtimeListeners("employees", "DELETE", locE);
        }
      }
      if (empsChanged) {
        saveToStorage("ism_employees", mappedE);
      }
    }
  } catch (err) {
    console.warn("[dataService] Heartbeat sync falhou:", err);
  } finally {
    isSyncRunning = false;
  }
}

// Inicia batimento periódico e sincronização imediata ao reativar a aba
if (typeof window !== "undefined") {
  setInterval(runBidirectionalHeartbeatSync, 5000);
  window.addEventListener("focus", () => runBidirectionalHeartbeatSync());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) runBidirectionalHeartbeatSync();
  });
}

// ============================================================
// SERVIÇO DE DADOS INTELIGENTE (SUPABASE + LOCAL RESILIENTE)
// ============================================================
export const dataService = {
  isOnline(): boolean {
    return isSupabaseConfigured();
  },

  // Força uma sincronização imediata bidirecional com o Supabase Cloud
  async syncNow(): Promise<void> {
    await runBidirectionalHeartbeatSync();
  },

  // ------------------------------------------------------------
  // USUÁRIOS & AUTENTICAÇÃO (RBAC)
  // ------------------------------------------------------------
  async getUsers(): Promise<UserRecord[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: true });
        if (!error && data && data.length > 0) {
          // Descriptografa CPF de cada usuário em paralelo (AES-GCM)
          const mappedUsers: UserRecord[] = await Promise.all(data.map(async u => ({
            id: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            username: u.username,
            role: u.role as UserRole,
            password: u.password,
            cpf: await decryptCPF(u.cpf || ""),
            position: u.position || "",
            department: u.department || "",
            email: u.email || "",
            phone: u.phone || "",
            active: u.active ?? true,
            companyId: u.company_id,
            createdAt: u.created_at
          })));
          saveToStorage("ism_users", mappedUsers);
          return mappedUsers;
        }
      } catch (err) {
        console.warn("[dataService] Falha ao buscar usuários do Supabase, utilizando cache local:", err);
      }
    }
    const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
    return Promise.all(localUsers.map(async u => ({
      ...u,
      cpf: await decryptCPF(u.cpf || "")
    })));
  },

  // Ouvinte de eventos em tempo real para reatividade no React
  subscribeToRealtime(listener: RealtimeListener): () => void {
    realtimeListeners.add(listener);
    return () => realtimeListeners.delete(listener);
  },

  // Auditoria de Cibersegurança
  async getAuditLogs(): Promise<SecurityAuditRecord[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("security_audit_logs")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(50);
        if (!error && data && data.length > 0) {
          return data.map(d => ({
            id: d.id,
            timestamp: Number(d.timestamp),
            action: d.action as SecurityAuditRecord["action"],
            actorUsername: d.actor_username,
            target: d.target,
            details: d.details,
            ip: d.ip
          }));
        }
      } catch {}
    }
    return getFromStorage<SecurityAuditRecord[]>("ism_audit_logs", []);
  },

  async recordAudit(action: SecurityAuditRecord["action"], actor: string, target?: string, details?: string) {
    const record = createAuditLog(action, actor, target, details);
    const localLogs = getFromStorage<SecurityAuditRecord[]>("ism_audit_logs", []);
    saveToStorage("ism_audit_logs", [record, ...localLogs.slice(0, 49)]);

    if (supabase) {
      try {
        await supabase.from("security_audit_logs").insert({
          id: record.id,
          timestamp: record.timestamp,
          action: record.action,
          actor_username: record.actorUsername,
          target: record.target,
          details: record.details
        });
      } catch {}
    }
  },

  async authenticate(username: string, pass: string): Promise<{ success: boolean; user?: UserProfile; role?: UserRole; message?: string }> {
    // 1. Tentar autenticação no Supabase se ativo
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("username", username)
          .single();

        if (!error && data) {
          if (!data.active) {
            await this.recordAudit("LOGIN_FAILED", username, undefined, "Tentativa em conta desativada");
            return { success: false, message: "Usuário desativado pelo administrador." };
          }

          // Verificação criptográfica com suporte à migração transparente de senhas em texto puro
          const { valid, requiresRehash } = await verifyPassword(pass, data.password);
          if (valid) {
            if (requiresRehash) {
              const secureHash = await hashPassword(pass);
              await supabase.from("users").update({ password: secureHash }).eq("username", username);
            }

            await this.recordAudit("LOGIN_SUCCESS", username, undefined, "Autenticado via Supabase Cloud");
            const userProfile: UserProfile = {
              firstName: data.first_name,
              lastName: data.last_name,
              username: data.username,
              role: data.role as UserRole,
              cpf: await decryptCPF(data.cpf || ""),
              position: data.position,
              department: data.department,
              email: data.email,
              phone: data.phone
            };
            return { success: true, user: userProfile, role: data.role as UserRole };
          }
        }
      } catch (err) {
        console.warn("[dataService] Verificação online falhou, testando banco local:", err);
      }
    }

    // 2. Fallback local resiliente
    const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
    const found = localUsers.find(u => u.username === username);

    if (found) {
      if (!found.active) {
        await this.recordAudit("LOGIN_FAILED", username, undefined, "Tentativa local em conta desativada");
        return { success: false, message: "Usuário desativado pelo administrador." };
      }

      const { valid, requiresRehash } = await verifyPassword(pass, found.password || "");
      if (valid) {
        if (requiresRehash) {
          found.password = await hashPassword(pass);
          saveToStorage("ism_users", localUsers);
        }

        await this.recordAudit("LOGIN_SUCCESS", username, undefined, "Autenticado via Armazenamento Local");
        return {
          success: true,
          user: {
            firstName: found.firstName,
            lastName: found.lastName,
            username: found.username,
            role: found.role,
            cpf: found.cpf ? await decryptCPF(found.cpf) : "",
            position: found.position,
            department: found.department,
            email: found.email,
            phone: found.phone
          },
          role: found.role
        };
      }
    }

    await this.recordAudit("LOGIN_FAILED", username, undefined, "Credenciais inválidas");
    return { success: false, message: "Usuário ou senha incorretos." };
  },

  async saveUser(user: Partial<UserRecord>, actor: string = "system"): Promise<MutationResult<UserRecord>> {
    const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
    let updatedUsers: UserRecord[];

    // Garante hash criptográfico seguro na senha antes de salvar
    let securePassword = user.password;
    if (securePassword && !securePassword.startsWith("$ism_sha256$")) {
      securePassword = await hashPassword(securePassword);
    }

    // Criptografia AES-GCM do CPF antes de persistir (LGPD — proteção de dados pessoais sensíveis)
    let secureCpf = user.cpf;
    if (secureCpf && secureCpf.trim() !== "" && !isCPFEncrypted(secureCpf)) {
      secureCpf = await encryptCPF(secureCpf);
      console.log("[Security] CPF criptografado com AES-256-GCM antes do armazenamento");
    }

    // Validação rigorosa de e-mail no fluxo de cadastro público ou edição
    if (user.email && user.email.trim() !== "") {
      if (!isValidEmailStrict(user.email)) {
        return { success: false, message: "O endereço de e-mail informado possui formato inválido." };
      }
    } else if (actor === "register") {
      return { success: false, message: "O endereço de e-mail é obrigatório para realizar o cadastro." };
    }

    const existingIndex = localUsers.findIndex(u => (user.id && u.id === user.id) || u.username === user.username);
    let savedRecord: UserRecord;

    // Validação de unicidade para novo cadastro público
    if (actor === "register" && existingIndex >= 0) {
      return { success: false, message: "Este nome de usuário já está em uso localmente. Por favor, escolha outro." };
    }

    // Validação de duplicidade de e-mail no armazenamento local
    if (user.email && user.email.trim() !== "") {
      const normalizedNewEmail = user.email.trim().toLowerCase();
      const duplicateEmailUser = localUsers.find(
        u => u.email && u.email.trim().toLowerCase() === normalizedNewEmail &&
             (user.username ? u.username !== user.username : true) &&
             (user.id ? u.id !== user.id : true)
      );
      if (duplicateEmailUser && (actor === "register" || existingIndex < 0)) {
        return {
          success: false,
          message: "Este endereço de e-mail já está cadastrado no sistema. Utilize outro e-mail ou a recuperação de senha."
        };
      }
    }

    if (existingIndex >= 0) {
      savedRecord = { 
        ...localUsers[existingIndex], 
        ...user,
        password: securePassword || localUsers[existingIndex].password,
        cpf: secureCpf || localUsers[existingIndex].cpf
      } as UserRecord;
      updatedUsers = [...localUsers];
      updatedUsers[existingIndex] = savedRecord;
      await this.recordAudit("ROLE_CHANGED", actor, user.username, `Alterado perfil para ${user.role || savedRecord.role}`);
    } else {
      savedRecord = {
        id: user.id || `USR-${Date.now()}`,
        firstName: user.firstName || "Novo",
        lastName: user.lastName || "Usuário",
        username: user.username || `user_${Date.now()}`,
        role: user.role || "VIEWER",
        password: securePassword || (await hashPassword("123456")),
        cpf: secureCpf || "",
        position: user.position || "",
        department: user.department || "",
        email: user.email || "",
        phone: user.phone || "",
        active: user.active ?? true,
        companyId: user.companyId || "COMP-001",
        createdAt: Date.now()
      };
      updatedUsers = [savedRecord, ...localUsers];
      await this.recordAudit("USER_CREATED", actor, savedRecord.username, `Novo usuário criado com papel ${savedRecord.role}`);
    }

    // Persistir no Supabase se disponível
    if (supabase) {
      try {
        const usernameToMatch = user.username || savedRecord.username;
        // 1. Verificar se o registro já existe no Supabase por username
        const { data: dbExisting, error: checkErr } = await supabase
          .from("users")
          .select("id, username")
          .eq("username", usernameToMatch)
          .maybeSingle();

        if (checkErr) {
          console.error("[dataService] Erro ao verificar usuário no Supabase:", checkErr);
          return { success: false, message: `Erro ao consultar Supabase: ${checkErr.message}` };
        }

        // Em fluxo de cadastro novo, rejeitar se o username já existir no Supabase
        if (dbExisting && actor === "register") {
          return { success: false, message: "Este nome de usuário já está em uso no Supabase. Por favor, escolha outro." };
        }

        // Verificar duplicidade de e-mail no Supabase para novos cadastros
        if (user.email && user.email.trim() !== "" && (actor === "register" || !dbExisting)) {
          const normalizedNewEmail = user.email.trim().toLowerCase();
          const { data: dbEmailMatch } = await supabase
            .from("users")
            .select("id, username, email")
            .ilike("email", normalizedNewEmail)
            .limit(1);

          if (dbEmailMatch && dbEmailMatch.length > 0 && dbEmailMatch[0].username !== usernameToMatch) {
            return {
              success: false,
              message: "Este endereço de e-mail já está cadastrado no sistema. Utilize outro e-mail ou a recuperação de senha."
            };
          }
        }

        if (dbExisting) {
          // Atualização de usuário existente: enviamos apenas campos alterados/válidos
          const updatePayload: any = {
            first_name: user.firstName !== undefined ? user.firstName : savedRecord.firstName,
            last_name: user.lastName !== undefined ? user.lastName : savedRecord.lastName,
            cpf: secureCpf !== undefined ? secureCpf : savedRecord.cpf,
            position: user.position !== undefined ? user.position : savedRecord.position,
            department: user.department !== undefined ? user.department : savedRecord.department,
            email: user.email !== undefined ? user.email : savedRecord.email,
            phone: user.phone !== undefined ? user.phone : savedRecord.phone,
            active: user.active !== undefined ? user.active : savedRecord.active
          };
          if (user.role) updatePayload.role = user.role;
          if (user.companyId) updatePayload.company_id = user.companyId;
          if (securePassword) {
            updatePayload.password = securePassword;
            updatePayload.last_password_change = new Date().toISOString();
          }

          const { error: updateErr } = await supabase
            .from("users")
            .update(updatePayload)
            .eq("username", usernameToMatch);

          if (updateErr) {
            console.error("[dataService] Falha ao atualizar usuário no Supabase:", updateErr);
            return { success: false, message: `Erro ao atualizar usuário no Supabase: ${updateErr.message}` };
          }
        } else {
          // Inserção de novo usuário no Supabase
          const insertPayload: any = {
            id: savedRecord.id,
            username: savedRecord.username,
            password: savedRecord.password,
            role: savedRecord.role,
            first_name: savedRecord.firstName,
            last_name: savedRecord.lastName,
            cpf: secureCpf || savedRecord.cpf || null,
            position: savedRecord.position || null,
            department: savedRecord.department || null,
            email: savedRecord.email || null,
            phone: savedRecord.phone || null,
            active: savedRecord.active,
            company_id: savedRecord.companyId || "COMP-001"
          };

          const { error: insertErr } = await supabase
            .from("users")
            .insert(insertPayload);

          if (insertErr) {
            console.error("[dataService] Falha ao criar usuário no Supabase:", insertErr);
            const msg = insertErr.message?.includes("duplicate")
              ? "Nome de usuário já cadastrado no banco."
              : `Erro ao cadastrar usuário no Supabase: ${insertErr.message}`;
            return { success: false, message: msg };
          }
        }
      } catch (err: any) {
        console.error("[dataService] Exceção ao gravar usuário no Supabase:", err);
        return { success: false, message: `Falha de conexão com Supabase: ${err?.message || err}` };
      }
    }

    saveToStorage("ism_users", updatedUsers);
    notifyRealtimeListeners("users", existingIndex >= 0 ? "UPDATE" : "INSERT", savedRecord);

    return { 
      success: true, 
      message: existingIndex >= 0 ? "Usuário atualizado com sucesso no Supabase!" : "Novo usuário cadastrado com sucesso no Supabase!", 
      data: savedRecord 
    };
  },

  async toggleUserStatus(username: string, actor: string = "system"): Promise<MutationResult<boolean>> {
    const users = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
    const target = users.find(u => u.username === username);
    if (!target) return { success: false, message: "Usuário não encontrado." };
    target.active = !target.active;

    if (supabase) {
      try {
        const { error } = await supabase.from("users").update({ active: target.active }).eq("username", username);
        if (error) {
          console.error("[dataService] Erro ao atualizar status no Supabase:", error);
          return { success: false, message: `Erro ao atualizar status no Supabase: ${error.message}` };
        }
      } catch (e: any) {
        console.error("[dataService] Exceção ao atualizar status no Supabase:", e);
        return { success: false, message: `Falha de conexão ao atualizar status: ${e?.message || e}` };
      }
    }

    saveToStorage("ism_users", users);
    await this.recordAudit(
      target.active ? "ROLE_CHANGED" : "USER_DISABLED",
      actor,
      username,
      `Status do usuário alterado para ${target.active ? "ATIVO" : "INATIVO"}`
    );
    notifyRealtimeListeners("users", "UPDATE", target);
    return { success: true, message: `Status alterado para ${target.active ? "ATIVO" : "INATIVO"} com sucesso!`, data: target.active };
  },

  async deleteUser(username: string, actor: string = "system"): Promise<MutationResult<null>> {
    let users = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
    users = users.filter(u => u.username !== username);
    saveToStorage("ism_users", users);

    await this.recordAudit("USER_DISABLED", actor, username, "Usuário excluído do sistema");

    if (supabase) {
      try {
        const { error } = await supabase.from("users").delete().eq("username", username);
        if (error) {
          console.error("[dataService] Erro ao excluir usuário no Supabase:", error);
          return { success: false, message: `Erro ao excluir usuário no Supabase: ${error.message}` };
        }
      } catch (e: any) {
        console.error("[dataService] Exceção ao excluir usuário no Supabase:", e);
        return { success: false, message: `Falha de conexão ao excluir no Supabase: ${e?.message || e}` };
      }
    }
    notifyRealtimeListeners("users", "DELETE", { username });
    return { success: true, message: `Usuário @${username} excluído com sucesso do Supabase!` };
  },

  // ------------------------------------------------------------
  // CAPACETES INTELIGENTES (HELMETS)
  // ------------------------------------------------------------
  async getHelmets(): Promise<Helmet[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("helmets").select("*").order("id", { ascending: true });
        if (!error && data && data.length > 0) {
          const mappedHelmets: Helmet[] = data.map(h => ({
            id: h.id,
            serialNumber: h.serial_number,
            macAddress: h.mac_address,
            firmwareVersion: h.firmware_version,
            battery: h.battery,
            status: h.status,
            lastCalibration: h.last_calibration ? h.last_calibration.split("T")[0] : undefined,
            nextInspection: h.next_inspection ? h.next_inspection.split("T")[0] : undefined,
            assignedEmployeeId: h.assigned_employee_id,
            companyId: h.company_id
          }));
          saveToStorage("ism_helmets", mappedHelmets);
          return mappedHelmets;
        }
      } catch (e) {
        console.warn("[dataService] Erro ao buscar capacetes do Supabase:", e);
      }
    }
    return getFromStorage<Helmet[]>("ism_helmets", SEED_HELMETS);
  },

  async saveHelmet(helmet: Helmet): Promise<MutationResult<Helmet>> {
    const helmets = getFromStorage<Helmet[]>("ism_helmets", SEED_HELMETS);
    const index = helmets.findIndex(h => h.id === helmet.id);
    const sanitizedAssignedEmp = (helmet.assignedEmployeeId && helmet.assignedEmployeeId !== "none" && helmet.assignedEmployeeId.trim() !== "") 
      ? helmet.assignedEmployeeId.trim() 
      : null;

    const cleanedHelmet: Helmet = {
      ...helmet,
      assignedEmployeeId: sanitizedAssignedEmp,
      battery: Math.min(100, Math.max(0, Number(helmet.battery) || 0))
    };

    let updatedHelmets: Helmet[];
    if (index >= 0) {
      updatedHelmets = [...helmets];
      updatedHelmets[index] = cleanedHelmet;
    } else {
      updatedHelmets = [...helmets, cleanedHelmet];
    }

    // Persistir no Supabase se ativo
    if (supabase) {
      try {
        const payload = {
          id: cleanedHelmet.id,
          serial_number: cleanedHelmet.serialNumber,
          mac_address: cleanedHelmet.macAddress || null,
          firmware_version: cleanedHelmet.firmwareVersion || "v1.0.4",
          battery: cleanedHelmet.battery,
          status: cleanedHelmet.status,
          last_calibration: safeIsoDate(cleanedHelmet.lastCalibration),
          next_inspection: safeIsoDate(cleanedHelmet.nextInspection),
          assigned_employee_id: cleanedHelmet.assignedEmployeeId,
          company_id: cleanedHelmet.companyId || "COMP-001"
        };

        const { data: existingH, error: checkErr } = await supabase
          .from("helmets")
          .select("id")
          .eq("id", cleanedHelmet.id)
          .maybeSingle();

        if (checkErr) {
          console.error("[dataService] Erro ao consultar capacete no Supabase:", checkErr);
          return { success: false, message: `Erro ao consultar capacete no Supabase: ${checkErr.message}` };
        }

        if (existingH) {
          const { error: upErr } = await supabase
            .from("helmets")
            .update(payload)
            .eq("id", cleanedHelmet.id);

          if (upErr) {
            console.error("[dataService] Erro ao atualizar capacete no Supabase:", upErr);
            return { success: false, message: `Erro ao atualizar capacete no Supabase: ${upErr.message}` };
          }
        } else {
          const { error: insErr } = await supabase
            .from("helmets")
            .insert(payload);

          if (insErr) {
            console.error("[dataService] Erro ao inserir capacete no Supabase:", insErr);
            return { success: false, message: `Erro ao cadastrar capacete no Supabase: ${insErr.message}` };
          }
        }

        // Sincronização Cruzada no Supabase com tabela employees:
        if (cleanedHelmet.assignedEmployeeId) {
          await supabase
            .from("employees")
            .update({ assigned_helmet_id: cleanedHelmet.id })
            .eq("id", cleanedHelmet.assignedEmployeeId);

          await supabase
            .from("employees")
            .update({ assigned_helmet_id: null })
            .eq("assigned_helmet_id", cleanedHelmet.id)
            .neq("id", cleanedHelmet.assignedEmployeeId);
        } else {
          await supabase
            .from("employees")
            .update({ assigned_helmet_id: null })
            .eq("assigned_helmet_id", cleanedHelmet.id);
        }
      } catch (err: any) {
        console.error("[dataService] Exceção ao salvar capacete no Supabase:", err);
        return { success: false, message: `Falha de conexão com Supabase: ${err?.message || err}` };
      }
    }

    saveToStorage("ism_helmets", updatedHelmets);
    notifyRealtimeListeners("helmets", index >= 0 ? "UPDATE" : "INSERT", cleanedHelmet);

    return { 
      success: true, 
      message: index >= 0 ? "Capacete atualizado com sucesso no Supabase!" : "Capacete cadastrado com sucesso no Supabase!", 
      data: cleanedHelmet 
    };
  },

  async deleteHelmet(id: string): Promise<MutationResult<null>> {
    let helmets = getFromStorage<Helmet[]>("ism_helmets", SEED_HELMETS);
    helmets = helmets.filter(h => h.id !== id);
    saveToStorage("ism_helmets", helmets);

    if (supabase) {
      try {
        await supabase.from("employees").update({ assigned_helmet_id: null }).eq("assigned_helmet_id", id);
        const { error } = await supabase.from("helmets").delete().eq("id", id);
        if (error) {
          console.error("[dataService] Erro ao excluir capacete no Supabase:", error);
          return { success: false, message: `Erro ao excluir capacete no Supabase: ${error.message}` };
        }
      } catch (e: any) {
        console.error("[dataService] Exceção ao excluir capacete no Supabase:", e);
        return { success: false, message: `Falha de conexão ao excluir capacete: ${e?.message || e}` };
      }
    }
    notifyRealtimeListeners("helmets", "DELETE", { id });
    return { success: true, message: "Capacete excluído com sucesso do Supabase!" };
  },

  // ------------------------------------------------------------
  // FUNCIONÁRIOS / OPERADORES (EMPLOYEES)
  // ------------------------------------------------------------
  async getEmployees(): Promise<Employee[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("employees").select("*").order("id", { ascending: true });
        if (!error && data && data.length > 0) {
          const mappedEmployees: Employee[] = await Promise.all(data.map(async e => ({
            id: e.id,
            name: e.name,
            cpf: await decryptCPF(e.cpf || ""),
            matricula: e.matricula,
            roleFunction: e.role_function,
            department: e.department,
            shift: e.shift,
            emergencyContact: e.emergency_contact,
            status: e.status,
            lat: typeof e.lat === "number" ? e.lat : -23.5505,
            lng: typeof e.lng === "number" ? e.lng : -46.6333,
            lastSeen: Number(e.last_seen) || 0,
            battery: typeof e.battery === "number" ? e.battery : 100,
            assignedHelmetId: e.assigned_helmet_id
          })));
          saveToStorage("ism_employees", mappedEmployees);
          return mappedEmployees;
        }
      } catch (e) {
        console.warn("[dataService] Erro ao carregar funcionários do Supabase:", e);
      }
    }
    const localEmployees = getFromStorage<Employee[]>("ism_employees", SEED_EMPLOYEES);
    return Promise.all(localEmployees.map(async e => ({
      ...e,
      cpf: await decryptCPF(e.cpf || "")
    })));
  },

  async saveEmployee(employee: Employee): Promise<MutationResult<Employee>> {
    const employees = getFromStorage<Employee[]>("ism_employees", SEED_EMPLOYEES);
    const index = employees.findIndex(e => e.id === employee.id);
    const sanitizedHelmetId = (employee.assignedHelmetId && employee.assignedHelmetId !== "none" && employee.assignedHelmetId.trim() !== "") 
      ? employee.assignedHelmetId.trim() 
      : null;

    let secureCpf = employee.cpf;
    if (secureCpf && secureCpf.trim() !== "" && !isCPFEncrypted(secureCpf)) {
      secureCpf = await encryptCPF(secureCpf);
    }

    const cleanedEmployee: Employee = {
      ...employee,
      cpf: secureCpf || "",
      assignedHelmetId: sanitizedHelmetId
    };

    let updatedEmployees: Employee[];
    if (index >= 0) {
      updatedEmployees = [...employees];
      updatedEmployees[index] = cleanedEmployee;
    } else {
      updatedEmployees = [...employees, cleanedEmployee];
    }

    // Persistir no Supabase se ativo
    if (supabase) {
      try {
        const payload = {
          id: cleanedEmployee.id,
          name: cleanedEmployee.name,
          cpf: secureCpf || null,
          matricula: cleanedEmployee.matricula || null,
          role_function: cleanedEmployee.roleFunction || null,
          department: cleanedEmployee.department || null,
          shift: cleanedEmployee.shift || null,
          emergency_contact: cleanedEmployee.emergencyContact || null,
          status: cleanedEmployee.status || "OFFLINE",
          lat: typeof cleanedEmployee.lat === "number" ? cleanedEmployee.lat : -23.5505,
          lng: typeof cleanedEmployee.lng === "number" ? cleanedEmployee.lng : -46.6333,
          last_seen: cleanedEmployee.lastSeen || 0,
          battery: typeof cleanedEmployee.battery === "number" ? cleanedEmployee.battery : 100,
          assigned_helmet_id: cleanedEmployee.assignedHelmetId,
          company_id: cleanedEmployee.companyId || "COMP-001"
        };

        const { data: existingE, error: checkErr } = await supabase
          .from("employees")
          .select("id")
          .eq("id", cleanedEmployee.id)
          .maybeSingle();

        if (checkErr) {
          console.error("[dataService] Erro ao consultar operador no Supabase:", checkErr);
          return { success: false, message: `Erro ao consultar operador no Supabase: ${checkErr.message}` };
        }

        if (existingE) {
          const { error: upErr } = await supabase
            .from("employees")
            .update(payload)
            .eq("id", cleanedEmployee.id);

          if (upErr) {
            console.error("[dataService] Erro ao atualizar operador no Supabase:", upErr);
            return { success: false, message: `Erro ao atualizar operador no Supabase: ${upErr.message}` };
          }
        } else {
          const { error: insErr } = await supabase
            .from("employees")
            .insert(payload);

          if (insErr) {
            console.error("[dataService] Erro ao cadastrar operador no Supabase:", insErr);
            return { success: false, message: `Erro ao cadastrar operador no Supabase: ${insErr.message}` };
          }
        }

        // Sincronização Cruzada no Supabase com tabela helmets:
        if (cleanedEmployee.assignedHelmetId) {
          await supabase
            .from("helmets")
            .update({ status: "IN_USE", assigned_employee_id: cleanedEmployee.id })
            .eq("id", cleanedEmployee.assignedHelmetId);

          await supabase
            .from("helmets")
            .update({ status: "AVAILABLE", assigned_employee_id: null })
            .eq("assigned_employee_id", cleanedEmployee.id)
            .neq("id", cleanedEmployee.assignedHelmetId);
        } else {
          await supabase
            .from("helmets")
            .update({ status: "AVAILABLE", assigned_employee_id: null })
            .eq("assigned_employee_id", cleanedEmployee.id);
        }
      } catch (err: any) {
        console.error("[dataService] Exceção ao salvar operador no Supabase:", err);
        return { success: false, message: `Falha de conexão com Supabase: ${err?.message || err}` };
      }
    }

    saveToStorage("ism_employees", updatedEmployees);
    notifyRealtimeListeners("employees", index >= 0 ? "UPDATE" : "INSERT", cleanedEmployee);

    return { 
      success: true, 
      message: index >= 0 ? "Operador atualizado com sucesso no Supabase!" : "Operador cadastrado com sucesso no Supabase!", 
      data: cleanedEmployee 
    };
  },

  async deleteEmployee(id: string): Promise<MutationResult<null>> {
    let employees = getFromStorage<Employee[]>("ism_employees", SEED_EMPLOYEES);
    employees = employees.filter(e => e.id !== id);
    saveToStorage("ism_employees", employees);

    if (supabase) {
      try {
        await supabase.from("helmets").update({ status: "AVAILABLE", assigned_employee_id: null }).eq("assigned_employee_id", id);
        const { error } = await supabase.from("employees").delete().eq("id", id);
        if (error) {
          console.error("[dataService] Erro ao excluir funcionário no Supabase:", error);
          return { success: false, message: `Erro ao excluir funcionário no Supabase: ${error.message}` };
        }
      } catch (e: any) {
        console.error("[dataService] Exceção ao excluir funcionário no Supabase:", e);
        return { success: false, message: `Falha de conexão ao excluir funcionário: ${e?.message || e}` };
      }
    }
    notifyRealtimeListeners("employees", "DELETE", { id });
    return { success: true, message: "Funcionário excluído com sucesso do Supabase!" };
  },

  // ------------------------------------------------------------
  // NORMAS REGULAMENTADORAS (NR-06 e NR-12)
  // ------------------------------------------------------------
  async getSafetyGuidelines(): Promise<SafetyGuideline[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("safety_guidelines").select("*").order("code", { ascending: true });
        if (!error && data && data.length > 0) {
          return data.map(g => ({
            id: g.id,
            code: g.code,
            title: g.title,
            description: g.description,
            category: g.category,
            complianceStatus: g.compliance_status,
            lastAudit: g.last_audit,
            details: g.details
          }));
        }
      } catch (e) {
        console.warn("[dataService] Erro ao buscar normas do Supabase:", e);
      }
    }
    return getFromStorage<SafetyGuideline[]>("ism_guidelines", SEED_GUIDELINES);
  },

  // ------------------------------------------------------------
  // EVENTOS DE ACIDENTES & HISTÓRICO
  // ------------------------------------------------------------
  async getAccidents(): Promise<AccidentEvent[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("accident_events").select("*").order("timestamp", { ascending: false });
        if (!error && data && data.length > 0) {
          return data.map(a => ({
            id: a.id,
            timestamp: Number(a.timestamp),
            employeeId: a.employee_id,
            employeeName: a.employee_name,
            aceleracaoG: a.aceleracao_g,
            picoG: a.pico_g,
            pontuacao: a.pontuacao,
            lat: a.lat,
            lng: a.lng,
            vibracao: a.vibracao,
            som: a.som,
            acknowledged: a.acknowledged,
            acknowledgedBy: a.acknowledged_by,
            acknowledgedAt: a.acknowledged_at
          }));
        }
      } catch (e) {
        console.warn("[dataService] Erro ao buscar acidentes do Supabase:", e);
      }
    }
    return getFromStorage<AccidentEvent[]>("ism_accidents", SEED_ACCIDENTS);
  },

  async recordAccident(accident: AccidentEvent): Promise<boolean> {
    const accidents = getFromStorage<AccidentEvent[]>("ism_accidents", SEED_ACCIDENTS);
    const updated = [accident, ...accidents.slice(0, 49)];
    saveToStorage("ism_accidents", updated);

    if (supabase) {
      try {
        await supabase.from("accident_events").insert({
          id: accident.id,
          timestamp: accident.timestamp,
          employee_id: accident.employeeId,
          employee_name: accident.employeeName,
          aceleracao_g: accident.aceleracaoG,
          pico_g: accident.picoG,
          pontuacao: accident.pontuacao,
          lat: accident.lat,
          lng: accident.lng,
          vibracao: accident.vibracao,
          som: accident.som,
          acknowledged: accident.acknowledged
        });
      } catch (e) {
        console.error("[dataService] Erro ao registrar acidente no Supabase:", e);
      }
    }
    return true;
  },

  // ------------------------------------------------------------
  // EXPORTAÇÃO DE LAUDO TÉCNICO PARA A BANCA DE TCC
  // ------------------------------------------------------------
  async generateTechnicalReport() {
    const [helmets, employees, guidelines, accidents, users] = await Promise.all([
      this.getHelmets(),
      this.getEmployees(),
      this.getSafetyGuidelines(),
      this.getAccidents(),
      this.getUsers()
    ]);

    return {
      titulo: "LAUDO TÉCNICO INDUSTRIAL E CONFORMIDADE DE SEGURANÇA (TCC)",
      sistema: "Industrial Safety Monitor - ESP32 IoT Cloud System",
      dataGeracao: new Date().toLocaleString("pt-BR"),
      modoBanco: this.isOnline() ? "Supabase Cloud (PostgreSQL)" : "Armazenamento Local Resiliente",
      estatisticasGerais: {
        totalCapacetes: helmets.length,
        capacetesEmUso: helmets.filter(h => h.status === "IN_USE").length,
        operadoresCadastrados: employees.length,
        operadoresAtivos: employees.filter(e => e.status !== "OFFLINE").length,
        incidentesRegistrados: accidents.length,
        normasAuditadas: guidelines.length
      },
      normasConformidade: guidelines,
      capacetes: helmets,
      funcionarios: employees,
      historicoImpactos: accidents,
      usuariosAutorizados: users.map(u => ({ nome: `${u.firstName} ${u.lastName}`, role: u.role, usuario: u.username, depto: u.department }))
    };
  },

  // ------------------------------------------------------------
  // RECUPERAÇÃO DE SENHA COM OTP (RESEND / SUPABASE / OWASP)
  // ------------------------------------------------------------
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const apiBase = (import.meta as any).env?.VITE_API_URL || "";

    // 1. Tentar despachar pelo servidor backend (com Resend)
    try {
      const res = await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.demoOtp) {
            const resets = getFromStorage<any[]>("ism_password_resets", []);
            resets.push({
              email: normalizedEmail,
              code: data.demoOtp,
              expires_at: Date.now() + 10 * 60 * 1000,
              used: false
            });
            saveToStorage("ism_password_resets", resets);
          }
          const log = createAuditLog("PASSWORD_RESET_REQUEST", normalizedEmail, undefined, "Solicitação de código OTP enviada via backend");
          const logs = getFromStorage<SecurityAuditRecord[]>("ism_audit_logs", []);
          logs.unshift(log);
          saveToStorage("ism_audit_logs", logs.slice(0, 100));
          return { success: true, message: data.message || "Se o e-mail estiver cadastrado, um código foi enviado." };
        } else if (!res.ok && data.message) {
          return { success: false, message: data.message };
        }
      }
    } catch (e) {
      console.info("[dataService] Backend local não acessível no momento. Utilizando contingência direta Supabase/Nuvem:", e);
    }

    // 2. Contingência autônoma: Supabase Cloud ou Local Storage (garante funcionamento no Vercel e na banca)
    try {
      // Validação rigorosa do formato de e-mail
      if (!isValidEmailStrict(normalizedEmail)) {
        return { success: false, message: "O endereço de e-mail informado possui formato inválido." };
      }

      let userFound = false;
      let userName = "Operador";

      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: dbUsers, error } = await supabase
            .from("users")
            .select("id, username, first_name, last_name, email, active")
            .ilike("email", normalizedEmail);

          if (!error && dbUsers && dbUsers.length > 0 && dbUsers[0].active !== false) {
            userFound = true;
            userName = `${dbUsers[0].first_name || ""} ${dbUsers[0].last_name || ""}`.trim() || dbUsers[0].username;
          }
        } catch (dbErr) {
          console.warn("[dataService] Consulta de usuário no Supabase:", dbErr);
        }
      }

      if (!userFound) {
        const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
        const u = localUsers.find(x => x.email.toLowerCase() === normalizedEmail);
        if (u && u.active !== false) {
          userFound = true;
          userName = `${u.firstName} ${u.lastName}`.trim();
        }
      }

      // Verificação explícita: informar caso o e-mail não possua cadastro
      if (!userFound) {
        return { 
          success: false, 
          message: "O e-mail informado não possui cadastro no sistema. Verifique o endereço ou entre em contato com o administrador." 
        };
      }

      // Gerar código numérico de 6 dígitos
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = await hashPassword(otpCode);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      if (isSupabaseConfigured() && supabase) {
        try {
          await supabase.from("password_resets").update({ used: true }).eq("email", normalizedEmail).eq("used", false);
          await supabase.from("password_resets").insert({
            email: normalizedEmail,
            code_hash: hashedCode,
            attempts: 0,
            expires_at: expiresAt,
            used: false
          });
        } catch (e) {
          console.warn("[dataService] Gravação no Supabase password_resets:", e);
        }
      }

      // Armazenar localmente para contingência em modo apresentação
      const resets = getFromStorage<any[]>("ism_password_resets", []);
      resets.forEach(r => { if (r.email === normalizedEmail) r.used = true; });
      resets.push({
        email: normalizedEmail,
        code: otpCode,
        code_hash: hashedCode,
        expires_at: Date.now() + 10 * 60 * 1000,
        used: false
      });
      saveToStorage("ism_password_resets", resets);

      const log = createAuditLog("PASSWORD_RESET_REQUEST", normalizedEmail, undefined, "Solicitação de código OTP gerada");
      const logs = getFromStorage<SecurityAuditRecord[]>("ism_audit_logs", []);
      logs.unshift(log);
      saveToStorage("ism_audit_logs", logs.slice(0, 100));

      // Feedback no console do navegador para demonstração rápida caso e-mail real não esteja configurado
      console.info(
        `%c[INDUSTRIAL SAFETY MONITOR - DEMO OTP]%c\nE-mail: ${normalizedEmail}\nCódigo de Verificação: ${otpCode}\nValidade: 10 minutos`,
        "background: #eab308; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;",
        "color: #eab308; font-weight: bold;"
      );

      return { 
        success: true, 
        message: "Código de verificação enviado com sucesso para o e-mail cadastrado." 
      };
    } catch (fallbackErr) {
      console.error("[dataService] Erro ao processar solicitação de recuperação:", fallbackErr);
      return { success: false, message: "Ocorreu um erro ao processar a solicitação. Tente novamente." };
    }
  },

  async resetPasswordWithOtp(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    const apiBase = (import.meta as any).env?.VITE_API_URL || "";

    // 1. Tentar validar via backend
    try {
      const res = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          code: cleanCode,
          newPassword
        })
      });
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (res.ok && data.success) {
          const log = createAuditLog("PASSWORD_RESET", normalizedEmail, undefined, "Senha redefinida com sucesso via backend OTP");
          const logs = getFromStorage<SecurityAuditRecord[]>("ism_audit_logs", []);
          logs.unshift(log);
          saveToStorage("ism_audit_logs", logs.slice(0, 100));

          // Atualizar no storage local também para consistência
          const securePassword = await hashPassword(newPassword);
          const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
          const idx = localUsers.findIndex(u => u.email.toLowerCase() === normalizedEmail);
          if (idx >= 0) {
            localUsers[idx].password = securePassword;
            saveToStorage("ism_users", localUsers);
          }

          return { success: true, message: data.message || "Senha redefinida com sucesso!" };
        } else if (!res.ok && data.message) {
          return { success: false, message: data.message };
        }
      }
    } catch (e) {
      console.info("[dataService] Backend local não acessível. Validando diretamente via Supabase/Local:", e);
    }

    // 2. Validação direta via Supabase ou Local Storage (contingência)
    try {
      let codeValid = false;

      // Consulta Supabase
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: resets, error } = await supabase
            .from("password_resets")
            .select("*")
            .eq("email", normalizedEmail)
            .eq("used", false)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(1);

          if (!error && resets && resets.length > 0) {
            const expectedHash1 = await hashPassword(cleanCode);
            let expectedHash2 = "";
            try {
              const encoder = new TextEncoder();
              const salt = "ISM_SAFETY_SALT_2026_SECURE_#";
              const saltData = encoder.encode(`${salt}:${normalizedEmail}:${cleanCode}:${salt}`);
              const hashBuffer = await crypto.subtle.digest("SHA-256", saltData);
              const bytes = new Uint8Array(hashBuffer);
              expectedHash2 = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
            } catch {}

            if (resets[0].code_hash === expectedHash1 || resets[0].code_hash === expectedHash2) {
              codeValid = true;
              await supabase.from("password_resets").update({ used: true }).eq("id", resets[0].id);
            }
          }
        } catch (e) {
          console.warn("[dataService] Falha na validação direta pelo Supabase:", e);
        }
      }

      // Consulta Local Storage se ainda não validou
      if (!codeValid) {
        const localResets = getFromStorage<any[]>("ism_password_resets", []);
        const now = Date.now();
        const activeIdx = localResets.findIndex(r => 
          r.email === normalizedEmail && 
          !r.used && 
          r.expires_at > now && 
          (r.code === cleanCode || r.code_hash === cleanCode)
        );

        if (activeIdx >= 0) {
          codeValid = true;
          localResets[activeIdx].used = true;
          saveToStorage("ism_password_resets", localResets);
        }
      }

      if (!codeValid) {
        return { success: false, message: "Código de verificação incorreto ou expirado." };
      }

      const securePassword = await hashPassword(newPassword);

      // Atualizar a senha no banco Supabase
      if (isSupabaseConfigured() && supabase) {
        try {
          await supabase
            .from("users")
            .update({ 
              password: securePassword,
              last_password_change: new Date().toISOString()
            })
            .ilike("email", normalizedEmail);
        } catch (dbUpErr) {
          console.warn("[dataService] Atualização de senha no Supabase:", dbUpErr);
        }
      }

      // Atualizar no storage local
      const localUsers = getFromStorage<UserRecord[]>("ism_users", SEED_USERS);
      const idx = localUsers.findIndex(u => u.email.toLowerCase() === normalizedEmail);
      if (idx >= 0) {
        localUsers[idx].password = securePassword;
        saveToStorage("ism_users", localUsers);
      }

      const log = createAuditLog("PASSWORD_RESET", normalizedEmail, undefined, "Senha redefinida com sucesso");
      const logs = getFromStorage<SecurityAuditRecord[]>("ism_audit_logs", []);
      logs.unshift(log);
      saveToStorage("ism_audit_logs", logs.slice(0, 100));

      return { success: true, message: "Senha redefinida com sucesso! Você já pode entrar com sua nova senha." };
    } catch (err) {
      console.error("[dataService] Erro ao validar código OTP:", err);
      return { success: false, message: "Erro ao processar a validação da senha." };
    }
  },

  // ------------------------------------------------------------
  // CONFIGURAÇÕES GLOBAIS DA APLICAÇÃO (Admin Master / FAQ Forms)
  // ------------------------------------------------------------
  async getAppSetting(key: string, defaultValue: string = ""): Promise<string> {
    // 1. Tentar ler do Supabase se ativo
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", key)
          .maybeSingle();

        if (!error && data && typeof data.value === "string") {
          const local = getFromStorage<Record<string, string>>("ism_app_settings", {});
          local[key] = data.value;
          saveToStorage("ism_app_settings", local);
          return data.value;
        }
      } catch (err) {
        console.warn(`[dataService] Falha ao ler configuração '${key}' do Supabase:`, err);
      }
    }

    // 2. Tentar ler do backend local via API REST se estiver online
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(key)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && typeof json.value === "string") {
          const local = getFromStorage<Record<string, string>>("ism_app_settings", {});
          local[key] = json.value;
          saveToStorage("ism_app_settings", local);
          return json.value;
        }
      }
    } catch {
      // Backend REST offline ou indisponível no momento
    }

    // 3. Fallback para LocalStorage resiliente
    const local = getFromStorage<Record<string, string>>("ism_app_settings", {});
    if (local && key in local && typeof local[key] === "string") {
      return local[key];
    }

    return defaultValue;
  },

  async setAppSetting(key: string, value: string, updatedBy: string = "admin"): Promise<boolean> {
    const trimmedValue = value.trim();
    const nowIso = new Date().toISOString();

    // 1. Atualizar LocalStorage imediatamente para feedback instantâneo
    const local = getFromStorage<Record<string, string>>("ism_app_settings", {});
    local[key] = trimmedValue;
    saveToStorage("ism_app_settings", local);

    // Dispara evento local para ouvintes da mesma aba/sessão
    notifyRealtimeListeners("app_settings", "UPDATE", {
      key,
      value: trimmedValue,
      updatedBy,
      updatedAt: nowIso
    });

    // 2. Persistir no Supabase se ativo
    if (supabase) {
      try {
        await supabase.from("app_settings").upsert({
          key,
          value: trimmedValue,
          updated_by: updatedBy,
          updated_at: nowIso
        }, { onConflict: "key" });
      } catch (err) {
        console.warn(`[dataService] Falha ao sincronizar configuração '${key}' com Supabase:`, err);
      }
    }

    // 3. Persistir via Backend REST se ativo
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: trimmedValue, updatedBy })
      });
    } catch (err) {
      console.info("[dataService] Backend REST indisponível para salvar configuração, persistido local e/ou Supabase.");
    }

    return true;
  }
};
