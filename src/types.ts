export type EmployeeStatus = "ONLINE" | "OFFLINE" | "EMERGENCY" | "UNSTABLE" | "INACTIVE";

export type UserRole = "MASTER" | "COMPANY_ADMIN" | "VIEWER";

export type HelmetStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "INACTIVE";

export interface EmployeeTelemetry {
  aceleracao?: number;
  aceleracaoG?: number;
  picoAceleracaoG?: number;
  picoG?: number;
  giroscopioGraus?: number;
  pontuacao?: number;
  pontosMPU?: number;
  pontosVibracao?: number;
  pontosSom?: number;
  vibracao?: boolean;
  som?: boolean;
  satelites?: number;
  altitude?: number;
  hdop?: number;
  gpsValido?: boolean;
  mapsUrl?: string;
  wifi?: string;
  ip?: string;
}

export interface Helmet {
  id: string;
  serialNumber: string;
  macAddress?: string;
  firmwareVersion?: string;
  battery: number;
  status: HelmetStatus;
  lastCalibration?: string;
  nextInspection?: string;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  companyId?: string;
}

export interface Employee {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: EmployeeStatus;
  lastSeen: number;
  battery: number;
  active?: boolean;
  cpf?: string;
  matricula?: string;
  roleFunction?: string;
  department?: string;
  shift?: string;
  emergencyContact?: string;
  assignedHelmetId?: string | null;
  assignedHelmetSerial?: string | null;
  companyId?: string;
  telemetry?: EmployeeTelemetry;
}

export interface Company {
  id: string;
  name: string;
  cnpj?: string;
}

export interface SystemStats {
  signalsToday: number;
  emergenciesToday: number;
  activeHelmets: number;
  disconnectedHelmets: number;
  systemStatus: "NOMINAL" | "EMERGENCY" | "WARNING";
}

export interface RecentActivity {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  type: "EMERGENCY" | "CONNECT" | "DISCONNECT" | "INFO";
  employeeName?: string;
  employeeId?: string;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  username: string;
  role?: UserRole;
  cpf: string;
  position: string;
  department: string;
  email: string;
  phone: string;
}

export interface UserRecord extends UserProfile {
  id?: string;
  role: UserRole;
  password?: string;
  active: boolean;
  createdAt?: number | string;
  companyId?: string;
}

export interface AccidentEvent {
  id: string;
  timestamp: number;
  employeeId: string;
  employeeName: string;
  aceleracaoG: number;
  picoG: number;
  pontuacao: number;
  lat: number;
  lng: number;
  vibracao: boolean;
  som: boolean;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface SafetyGuideline {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  complianceStatus: "CONFORME" | "ATENCAO" | "CRITICO";
  lastAudit?: string;
  details?: Record<string, any>;
}

export interface WebSocketMessage {
  type: "INITIAL_STATE" | "UPDATE";
  data: Employee[];
  stats?: SystemStats;
  activities?: RecentActivity[];
  accidents?: AccidentEvent[];
  users?: UserRecord[];
}

export interface AppSetting {
  id?: string;
  key: string;
  value: string;
  description?: string;
  updatedBy?: string;
  updatedAt?: string;
  createdAt?: string;
}
