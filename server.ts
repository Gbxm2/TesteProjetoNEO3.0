import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "crypto";
import { Resend } from "resend";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// Inicialização do Supabase para persistência dos dados do ESP32
const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim();
const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes("seu-projeto")) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("[Supabase Server] Conexão com banco Supabase configurada com sucesso.");
  } catch (err) {
    console.warn("[Supabase Server] Erro ao conectar ao Supabase:", err);
  }
}

// ------------------------------------------------------------
// INTEGRAÇÃO RESEND (E-MAIL TRANSACIONAL) & SEGURANÇA OTP
// ------------------------------------------------------------
const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
const resendFromEmail = (process.env.RESEND_FROM_EMAIL || "Industrial Safety Monitor <onboarding@resend.dev>").trim();
let resend: Resend | null = null;

if (resendApiKey && !resendApiKey.includes("sua_chave") && resendApiKey.startsWith("re_")) {
  try {
    resend = new Resend(resendApiKey);
    console.log("[Resend] Cliente de e-mail transacional inicializado com sucesso.");
  } catch (err) {
    console.warn("[Resend] Falha ao instanciar cliente Resend:", err);
  }
} else {
  console.log("[Resend] Chave de API em modo simulação/dev. Os códigos OTP serão exibidos no terminal.");
}

const OTP_SYSTEM_SALT = process.env.OTP_SALT || "ISM_SAFETY_SALT_2026_SECURE_#";

function hashOtp(code: string, email: string): string {
  return crypto.createHash("sha256").update(`${OTP_SYSTEM_SALT}:${email.toLowerCase()}:${code}:${OTP_SYSTEM_SALT}`).digest("hex");
}

function hashPasswordNode(plainText: string, salt: string = "ISM_SAFETY_SALT_2026_SECURE_#"): string {
  if (plainText.startsWith("$ism_sha256$")) return plainText;
  const hex = crypto.createHash("sha256").update(salt + plainText + salt).digest("hex");
  return `$ism_sha256$${hex}`;
}

// Criptografia simétrica AES-256-GCM para CPF (Node.js — espelha a implementação do browser)
const CPF_ENC_PREFIX_NODE = "$ism_cpf_enc$";
const CPF_AES_KEY_MATERIAL_NODE = "ISM_CPF_AES256_KEY_2026_LGPD_#";

function deriveAESKeyNode(): Buffer {
  return crypto.pbkdf2Sync(
    CPF_AES_KEY_MATERIAL_NODE,
    "ISM_SAFETY_SALT_2026_SECURE_#",
    100000,
    32,
    "sha256"
  );
}

function encryptCPFNode(plainCpf: string): string {
  if (!plainCpf || plainCpf.trim() === "") return "";
  if (plainCpf.startsWith(CPF_ENC_PREFIX_NODE)) return plainCpf;
  try {
    const key = deriveAESKeyNode();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plainCpf, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${CPF_ENC_PREFIX_NODE}${iv.toString("hex")}:${encrypted}${authTag}`;
  } catch (err) {
    console.warn("[Security Server] Falha na criptografia AES-GCM do CPF:", err);
    return plainCpf;
  }
}

function decryptCPFNode(encryptedCpf: string): string {
  if (!encryptedCpf || !encryptedCpf.startsWith(CPF_ENC_PREFIX_NODE)) return encryptedCpf;
  try {
    const payload = encryptedCpf.slice(CPF_ENC_PREFIX_NODE.length);
    const [ivHex, cipherAndTagHex] = payload.split(":");
    if (!ivHex || !cipherAndTagHex || cipherAndTagHex.length < 32) return encryptedCpf;
    const iv = Buffer.from(ivHex, "hex");
    const cipherHex = cipherAndTagHex.slice(0, -32);
    const authTagHex = cipherAndTagHex.slice(-32);
    const key = deriveAESKeyNode();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.warn("[Security Server] Falha na descriptografia AES-GCM do CPF:", err);
    return encryptedCpf;
  }
}

function isValidEmailServer(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
}

function buildOtpEmailHtml(userName: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recuperação de Senha - Industrial Safety Monitor</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #18181b; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          <tr>
            <td style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 28px; border-bottom: 2px solid #eab308; text-align: center;">
              <div style="display: inline-block; background-color: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 12px; padding: 8px 16px; margin-bottom: 12px;">
                <span style="color: #facc15; font-weight: 800; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">⚠️ INDUSTRIAL SAFETY MONITOR</span>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Recuperação de Acesso e Credenciais</h1>
              <p style="color: #a1a1aa; margin: 6px 0 0 0; font-size: 13px;">Centro de Operações Industriais (COI)</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px;">
              <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin-top: 0;">
                Olá, <strong>${userName}</strong>,
              </p>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6;">
                Recebemos uma solicitação de redefinição de senha para a sua conta operacional. Utilize o código de verificação de uso único (OTP) abaixo para prosseguir:
              </p>
              
              <div style="background-color: #09090b; border: 2px dashed #eab308; border-radius: 12px; padding: 24px; text-align: center; margin: 28px 0;">
                <span style="display: block; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; margin-bottom: 8px;">CÓDIGO DE SEGURANÇA (OTP)</span>
                <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #facc15;">${otpCode}</span>
                <span style="display: block; color: #71717a; font-size: 11px; margin-top: 8px;">Válido por 10 minutos</span>
              </div>

              <div style="background-color: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; border-radius: 4px; padding: 12px 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #fca5a5; font-size: 12px; line-height: 1.5;">
                  <strong>Importante:</strong> Nunca compartilhe este código com terceiros. Caso você não tenha solicitado esta redefinição, desconsidere esta mensagem ou notifique o administrador do sistema.
                </p>
              </div>

              <p style="color: #71717a; font-size: 12px; margin: 0; line-height: 1.5;">
                Por motivos de conformidade e cibersegurança industrial (OWASP), este código expira após 10 minutos ou após 5 tentativas incorretas.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #121215; border-top: 1px solid rgba(255, 255, 255, 0.06); padding: 18px 28px; text-align: center;">
              <p style="color: #52525b; font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                © 2026 Industrial Safety Monitor • Telemetria IoT & Cibersegurança
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function printDevOtpBanner(email: string, name: string, code: string) {
  console.log("\n============================================================");
  console.log("       [OTP SIMULATION / RESEND DEV] CÓDIGO GERADO");
  console.log("============================================================");
  console.log(`Destinatário:  ${name} <${email}>`);
  console.log(`Código OTP:    >>>  ${code}  <<<`);
  console.log("Validade:      10 minutos");
  console.log("Hash SHA-256:  Criptografado com salt do sistema");
  console.log("============================================================\n");
}

interface InMemoryPasswordReset {
  id: string;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
  used: boolean;
  created_at: number;
}
const inMemoryResets: InMemoryPasswordReset[] = [];

async function runPasswordResetHousekeeping() {
  try {
    if (supabase) {
      const { error } = await supabase.rpc("purge_expired_password_resets");
      if (error) {
        // Limpeza direta caso a função RPC não esteja criada no Supabase
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("password_resets").delete().lt("expires_at", cutoff);
      }
    }
    // Limpeza de memória
    const now = Date.now();
    for (let i = inMemoryResets.length - 1; i >= 0; i--) {
      if (inMemoryResets[i].expires_at < now - 24 * 60 * 60 * 1000 || (inMemoryResets[i].used && inMemoryResets[i].created_at < now - 3600000)) {
        inMemoryResets.splice(i, 1);
      }
    }
  } catch (err) {
    console.warn("[Housekeeping] Erro na limpeza periódica:", err);
  }
}


function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses: { name: string; address: string }[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

import { Employee, EmployeeTelemetry, SystemStats, RecentActivity } from "./src/types";

// EMP001 é o ESP32 real conectado. Os demais representam capacetes cadastrados no sistema atualmente desligados (OFFLINE)
let employees: Employee[] = [
  { id: "EMP001", name: "Gabriel Araújo", lat: -23.5505, lng: -46.6333, status: "ONLINE", lastSeen: Date.now(), battery: 95 },
  { id: "EMP002", name: "Gustavo Felix", lat: -23.5515, lng: -46.6343, status: "OFFLINE", lastSeen: 0, battery: 0 },
  { id: "EMP003", name: "Fabio Akira", lat: -23.5525, lng: -46.6353, status: "OFFLINE", lastSeen: 0, battery: 0 },
  { id: "EMP004", name: "Fabio Pelissari", lat: -23.5535, lng: -46.6363, status: "OFFLINE", lastSeen: 0, battery: 0 },
  { id: "EMP005", name: "Augusto Melo", lat: -23.5545, lng: -46.6373, status: "OFFLINE", lastSeen: 0, battery: 0 },
];

let latestESP32Data: any = null;
let ultimaAtualizacao: string | null = null;
let signalsReceivedToday = 0;
let emergenciesCountToday = 0;
let esp32HasConnected = false;
let recentActivities: RecentActivity[] = [
  {
    id: "init-1",
    title: "Sistema Inicializado",
    description: "Servidor de monitoramento industrial ativo na porta 3000",
    timestamp: Date.now() - 30000,
    type: "INFO"
  }
];

function getSystemStats(): SystemStats {
  const activeCount = employees.filter(e => e.status !== "OFFLINE").length;
  const disconnectedCount = employees.filter(e => e.status === "OFFLINE").length;
  const hasEmergency = employees.some(e => e.status === "EMERGENCY");
  return {
    signalsToday: signalsReceivedToday,
    emergenciesToday: emergenciesCountToday,
    activeHelmets: activeCount,
    disconnectedHelmets: disconnectedCount,
    systemStatus: hasEmergency ? "EMERGENCY" : "NOMINAL"
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // ------------------------------------------------------------
  // CIBERSEGURANÇA: CABEÇALHOS DE PROTEÇÃO HTTP (OWASP)
  // ------------------------------------------------------------
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Permite acesso seguro e controlado
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, ngrok-skip-browser-warning");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Mitigação simples de Força Bruta / DoS por IP
  const requestRates = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (maxRequests: number, windowMs: number) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip || "127.0.0.1";
      const now = Date.now();
      const current = requestRates.get(ip);
      if (!current || now > current.resetAt) {
        requestRates.set(ip, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (current.count >= maxRequests) {
        return res.status(429).json({ sucesso: false, mensagem: "Taxa limite excedida. Aguarde alguns instantes." });
      }
      current.count++;
      next();
    };
  };
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  interface UserData {
    firstName: string;
    lastName: string;
    username: string;
    cpf: string;
    position: string;
    department: string;
    email: string;
    phone: string;
    password: string;
    token_version?: number;
    last_password_change?: string;
  }

  const users: UserData[] = [
    { 
      firstName: "Pedro", 
      lastName: "Casaburi", 
      username: "pedrocasaburi", 
      cpf: "000.111.222-33", 
      position: "Engenheiro de Sistemas / Desenvolvedor", 
      department: "Diretoria de Tecnologia & Inovação", 
      email: "pedrocasaburi@hotmail.com", 
      phone: "(11) 99999-0000", 
      password: "123456" 
    },
    { 
      firstName: "Administrador", 
      lastName: "Master", 
      username: "adminmaster", 
      cpf: "000.111.222-33", 
      position: "Engenheiro Chefe de Sistemas / Dono", 
      department: "Diretoria de Tecnologia & Inovação", 
      email: "adminmaster@industrial.com", 
      phone: "(11) 99999-0000", 
      password: "123456" 
    },
    { 
      firstName: "Gabriel", 
      lastName: "Araújo", 
      username: "Gbxm", 
      cpf: "123.456.789-00", 
      position: "Engenheiro de Segurança / Admin COI", 
      department: "Centro de Operações Industriais (COI)", 
      email: "gbxm.seguranca@industrial.com", 
      phone: "(11) 98765-4321", 
      password: "123456" 
    },
    { 
      firstName: "Auditor", 
      lastName: "Visualizador", 
      username: "visualizador", 
      cpf: "999.888.777-66", 
      position: "Técnico de Monitoramento / Fiscal", 
      department: "Auditoria Externa de Segurança", 
      email: "visualizador@industrial.com", 
      phone: "(11) 91234-5678", 
      password: "123456" 
    }
  ];

  app.post("/api/login", rateLimit(15, 60000), (req, res) => {
    const { username, password } = req.body;
    const hashed = hashPasswordNode(password || "");
    const user = users.find(u => u.username === username && (u.password === password || u.password === hashed));
    if (user) {
      const { password: _, ...safeUser } = user;
      safeUser.cpf = decryptCPFNode(safeUser.cpf || "");
      res.json({ success: true, user: safeUser });
    } else {
      res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
    }
  });

  app.post("/api/user/update", (req, res) => {
    const updated = req.body;
    if (updated.email && !isValidEmailServer(updated.email)) {
      return res.status(400).json({ success: false, message: "Formato de e-mail inválido." });
    }
    const userIndex = users.findIndex(u => u.username === updated.username);
    if (userIndex !== -1) {
      if (updated.cpf) {
        updated.cpf = encryptCPFNode(updated.cpf);
      }
      if (updated.password && !updated.password.startsWith("$ism_sha256$")) {
        updated.password = hashPasswordNode(updated.password);
      }
      users[userIndex] = { ...users[userIndex], ...updated };
      const { password: _, ...safeUser } = users[userIndex];
      safeUser.cpf = decryptCPFNode(safeUser.cpf || "");
      res.json({ success: true, user: safeUser });
    } else {
      res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }
  });

  app.post("/api/register", async (req, res) => {
    try {
      const userData: UserData = req.body;

      if (!userData.username || userData.username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Nome de usuário deve conter ao menos 3 caracteres." });
      }

      if (!userData.email || !isValidEmailServer(userData.email)) {
        return res.status(400).json({ success: false, message: "O endereço de e-mail informado possui formato inválido." });
      }

      const normalizedEmail = userData.email.trim().toLowerCase();

      // Checagem em memória
      if (users.find(u => u.username === userData.username)) {
        return res.status(400).json({ success: false, message: "Nome de usuário já existe no sistema." });
      }
      if (users.find(u => u.email?.trim().toLowerCase() === normalizedEmail)) {
        return res.status(400).json({ success: false, message: "Este e-mail já possui cadastro no sistema. Utilize outro e-mail ou recupere sua senha." });
      }

      // Checagem no Supabase se ativo
      if (supabase) {
        const { data: dbExisting, error } = await supabase
          .from("users")
          .select("id, username, email")
          .or(`username.eq.${userData.username},email.ilike.${normalizedEmail}`);

        if (!error && dbExisting && dbExisting.length > 0) {
          const match = dbExisting[0];
          if (match.username === userData.username) {
            return res.status(400).json({ success: false, message: "Nome de usuário já existe no sistema." });
          }
          return res.status(400).json({ success: false, message: "Este e-mail já possui cadastro no sistema. Utilize outro e-mail ou recupere sua senha." });
        }
      }

      // Hash da senha e Criptografia AES-256 do CPF
      const securePassword = hashPasswordNode(userData.password || "123456");
      const secureCpf = encryptCPFNode(userData.cpf || "");

      const newUser: UserData = {
        ...userData,
        password: securePassword,
        cpf: secureCpf,
        email: normalizedEmail
      };

      users.push(newUser);

      // Persistir no Supabase se conectado
      if (supabase) {
        try {
          await supabase.from("users").insert({
            id: `USR-${Date.now()}`,
            username: newUser.username,
            password: newUser.password,
            role: "VIEWER",
            first_name: newUser.firstName,
            last_name: newUser.lastName,
            cpf: newUser.cpf || null,
            position: newUser.position || null,
            department: newUser.department || null,
            email: newUser.email || null,
            phone: newUser.phone || null,
            active: true,
            company_id: "COMP-001"
          });
        } catch (dbErr) {
          console.warn("[Register Server] Falha ao persistir no Supabase:", dbErr);
        }
      }

      res.json({ success: true, message: "Usuário cadastrado com sucesso." });
    } catch (err: any) {
      console.error("[Register Server] Erro:", err);
      res.status(500).json({ success: false, message: "Erro interno ao cadastrar usuário." });
    }
  });

  // ------------------------------------------------------------
  // CIBERSEGURANÇA: ENDPOINTS DE RECUPERAÇÃO DE SENHA COM OTP
  // ------------------------------------------------------------
  const forgotPasswordRates = new Map<string, { count: number; resetAt: number }>();
  const forgotPasswordRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const now = Date.now();
    const current = forgotPasswordRates.get(ip);
    if (!current || now > current.resetAt) {
      forgotPasswordRates.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return next();
    }
    if (current.count >= 3) {
      return res.status(429).json({
        success: false,
        message: "Muitas solicitações de recuperação deste IP. Por segurança, aguarde 15 minutos."
      });
    }
    current.count++;
    next();
  };

  app.post("/api/auth/forgot-password", forgotPasswordRateLimit, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, message: "Endereço de e-mail é obrigatório." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ success: false, message: "Formato de e-mail inválido." });
      }

      let userFound = false;
      let userName = "Operador";
      let userUsername = "";

      // 1. Verificar no banco Supabase
      if (supabase) {
        try {
          const { data: dbUsers, error } = await supabase
            .from("users")
            .select("id, username, first_name, last_name, email, active")
            .ilike("email", normalizedEmail);

          if (!error && dbUsers && dbUsers.length > 0) {
            const u = dbUsers[0];
            if (u.active !== false) {
              userFound = true;
              userName = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || "Operador";
              userUsername = u.username || "";
            }
          }
        } catch (dbErr) {
          console.warn("[Forgot-Password] Erro ao consultar Supabase:", dbErr);
        }
      }

      // 2. Verificar na lista local em memória
      if (!userFound) {
        const localUser = users.find(u => u.email.toLowerCase() === normalizedEmail);
        if (localUser) {
          userFound = true;
          userName = `${localUser.firstName} ${localUser.lastName}`.trim();
          userUsername = localUser.username;
        }
      }

      // 3. Se usuário existir, gerar e persistir OTP com hash criptográfico seguro
      if (userFound) {
        const now = Date.now();
        const expiresAt = now + 10 * 60 * 1000; // 10 minutos
        const expiresAtIso = new Date(expiresAt).toISOString();

        // Invalida códigos ativos prévios deste e-mail
        if (supabase) {
          try {
            await supabase
              .from("password_resets")
              .update({ used: true })
              .eq("email", normalizedEmail)
              .eq("used", false);
          } catch (e) {
            console.warn("[Forgot-Password] Falha ao invalidar resets anteriores:", e);
          }
        }
        inMemoryResets.forEach(r => {
          if (r.email === normalizedEmail && !r.used) r.used = true;
        });

        // Geração do código numérico de 6 dígitos
        const otpCode = Math.floor(100000 + crypto.randomInt(900000)).toString();
        const codeHash = hashOtp(otpCode, normalizedEmail);

        if (supabase) {
          try {
            await supabase.from("password_resets").insert({
              email: normalizedEmail,
              code_hash: codeHash,
              attempts: 0,
              expires_at: expiresAtIso,
              used: false
            });
          } catch (e) {
            console.warn("[Forgot-Password] Falha ao gravar no Supabase:", e);
          }
        }

        inMemoryResets.push({
          id: `PR-${Date.now()}`,
          email: normalizedEmail,
          code_hash: codeHash,
          attempts: 0,
          expires_at: expiresAt,
          used: false,
          created_at: now
        });

        recentActivities.unshift({
          id: `audit-${Date.now()}`,
          title: "Recuperação Solicitada",
          description: `Código OTP solicitado para @${userUsername || normalizedEmail}`,
          timestamp: Date.now(),
          type: "INFO"
        });
        if (recentActivities.length > 20) recentActivities.pop();
        broadcastUpdate();

        // Disparo por Resend ou exibição no terminal
        if (resend) {
          try {
            const htmlContent = buildOtpEmailHtml(userName, otpCode);
            await resend.emails.send({
              from: resendFromEmail,
              to: [normalizedEmail],
              subject: `Código de Recuperação: ${otpCode} - Industrial Safety Monitor`,
              html: htmlContent
            });
            console.log(`[Resend] E-mail de OTP enviado com sucesso para ${normalizedEmail}`);
          } catch (mailErr) {
            console.error("[Resend] Erro ao despachar e-mail:", mailErr);
            printDevOtpBanner(normalizedEmail, userName, otpCode);
          }
        } else {
          printDevOtpBanner(normalizedEmail, userName, otpCode);
        }
      } else {
        // E-mail não encontrado em nenhum banco — retorna erro explícito
        console.log(`[Forgot-Password] Solicitação rejeitada para e-mail inexistente: ${normalizedEmail}`);
        return res.status(404).json({
          success: false,
          message: "O e-mail informado não possui cadastro no sistema. Verifique o endereço ou entre em contato com o administrador."
        });
      }

      return res.json({
        success: true,
        message: "Código de verificação enviado com sucesso para o e-mail cadastrado."
      });
    } catch (err) {
      console.error("[Forgot-Password] Erro interno:", err);
      return res.status(500).json({ success: false, message: "Erro interno no servidor ao processar a solicitação." });
    }
  });

  const resetPasswordRates = new Map<string, { count: number; resetAt: number }>();
  const resetPasswordRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const now = Date.now();
    const current = resetPasswordRates.get(ip);
    if (!current || now > current.resetAt) {
      resetPasswordRates.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return next();
    }
    if (current.count >= 15) {
      return res.status(429).json({
        success: false,
        message: "Muitas tentativas de validação. Por segurança, aguarde alguns minutos."
      });
    }
    current.count++;
    next();
  };

  app.post("/api/auth/reset-password", resetPasswordRateLimit, async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ success: false, message: "E-mail, código de verificação e nova senha são obrigatórios." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const cleanCode = String(code).trim();

      if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
        return res.status(400).json({ success: false, message: "O código deve conter exatamente 6 dígitos numéricos." });
      }

      if (typeof newPassword !== "string" || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: "A nova senha deve possuir ao menos 4 caracteres." });
      }

      const now = Date.now();
      let activeRecord: any = null;
      let isSupabaseSource = false;

      // 1. Consulta no Supabase
      if (supabase) {
        try {
          const { data: dbRecords, error } = await supabase
            .from("password_resets")
            .select("*")
            .eq("email", normalizedEmail)
            .eq("used", false)
            .gt("expires_at", new Date(now).toISOString())
            .order("created_at", { ascending: false })
            .limit(1);

          if (!error && dbRecords && dbRecords.length > 0) {
            activeRecord = dbRecords[0];
            isSupabaseSource = true;
          }
        } catch (e) {
          console.warn("[Reset-Password] Falha ao consultar Supabase:", e);
        }
      }

      // 2. Consulta em memória
      if (!activeRecord) {
        const memRecord = inMemoryResets
          .filter(r => r.email === normalizedEmail && !r.used && r.expires_at > now)
          .sort((a, b) => b.created_at - a.created_at)[0];
        if (memRecord) {
          activeRecord = memRecord;
          isSupabaseSource = false;
        }
      }

      if (!activeRecord) {
        return res.status(400).json({
          success: false,
          message: "Código de verificação inexistente ou expirado. Solicite um novo código."
        });
      }

      // 3. Verificação de limite de tentativas
      if (activeRecord.attempts >= 5) {
        if (isSupabaseSource && supabase) {
          await supabase.from("password_resets").update({ used: true }).eq("id", activeRecord.id);
        }
        activeRecord.used = true;
        return res.status(400).json({
          success: false,
          message: "Limite de tentativas excedido para este código. Solicite um novo código."
        });
      }

      // 4. Comparação segura com timingSafeEqual
      const inputHash = hashOtp(cleanCode, normalizedEmail);
      const storedHash = activeRecord.code_hash;

      const hashBufferStored = Buffer.from(storedHash, "hex");
      const hashBufferInput = Buffer.from(inputHash, "hex");

      const isOtpValid =
        hashBufferStored.length === hashBufferInput.length &&
        crypto.timingSafeEqual(hashBufferStored, hashBufferInput);

      if (!isOtpValid) {
        const nextAttempts = (activeRecord.attempts || 0) + 1;
        const remaining = Math.max(0, 5 - nextAttempts);

        if (isSupabaseSource && supabase) {
          await supabase
            .from("password_resets")
            .update({
              attempts: nextAttempts,
              used: nextAttempts >= 5
            })
            .eq("id", activeRecord.id);
        }
        activeRecord.attempts = nextAttempts;
        if (nextAttempts >= 5) activeRecord.used = true;

        if (remaining > 0) {
          return res.status(400).json({
            success: false,
            message: `Código incorreto. Você ainda tem ${remaining} tentativa(s).`
          });
        } else {
          return res.status(400).json({
            success: false,
            message: "Limite de 5 tentativas atingido. O código foi invalidado por segurança."
          });
        }
      }

      // 5. Sucesso: marcar código como utilizado
      if (isSupabaseSource && supabase) {
        await supabase.from("password_resets").update({ used: true }).eq("id", activeRecord.id);
      }
      activeRecord.used = true;

      // 6. Hashear a nova senha e revogar sessões ativas
      const hashedPassword = hashPasswordNode(newPassword);
      const nowIso = new Date().toISOString();

      if (supabase) {
        try {
          const { data: dbUsers } = await supabase
            .from("users")
            .select("id, token_version")
            .ilike("email", normalizedEmail);

          if (dbUsers && dbUsers.length > 0) {
            const currentTokenVersion = dbUsers[0].token_version || 1;
            await supabase
              .from("users")
              .update({
                password: hashedPassword,
                token_version: currentTokenVersion + 1,
                last_password_change: nowIso
              })
              .eq("id", dbUsers[0].id);
          }
        } catch (dbErr) {
          console.error("[Reset-Password] Erro ao atualizar senha no Supabase:", dbErr);
        }
      }

      // Atualiza usuário local
      const localUser = users.find(u => u.email.toLowerCase() === normalizedEmail);
      if (localUser) {
        localUser.password = newPassword;
        localUser.token_version = (localUser.token_version || 1) + 1;
        localUser.last_password_change = nowIso;
      }

      recentActivities.unshift({
        id: `audit-reset-${Date.now()}`,
        title: "Senha Redefinida",
        description: `Senha de ${localUser ? '@' + localUser.username : normalizedEmail} redefinida via OTP`,
        timestamp: Date.now(),
        type: "INFO"
      });
      if (recentActivities.length > 20) recentActivities.pop();
      broadcastUpdate();

      console.log(`[Reset-Password] Senha redefinida com sucesso para ${normalizedEmail}`);
      return res.json({
        success: true,
        message: "Senha redefinida com sucesso! Você já pode realizar o login com suas novas credenciais."
      });
    } catch (err) {
      console.error("[Reset-Password] Erro interno:", err);
      return res.status(500).json({ success: false, message: "Erro interno no servidor ao processar a redefinição de senha." });
    }
  });

  app.get("/api/stats", (_req, res) => {
    res.json(getSystemStats());
  });

  // ============================================================
  // CONFIGURAÇÕES GLOBAIS DA APLICAÇÃO (Admin Master / FAQ Forms)
  // ============================================================
  const inMemorySettings = new Map<string, { value: string; description?: string; updatedBy?: string; updatedAt: string }>();
  // Seed inicial padrão para faq_forms_url
  inMemorySettings.set("faq_forms_url", {
    value: "",
    description: "URL do Google Forms para solicitações e FAQ dos usuários. Configurável pelo Admin Master.",
    updatedBy: "system",
    updatedAt: new Date().toISOString()
  });

  app.get("/api/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      if (!key) {
        return res.status(400).json({ success: false, message: "Chave não informada." });
      }

      // 1. Tentar ler do Supabase se configurado
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from("app_settings")
            .select("*")
            .eq("key", key)
            .maybeSingle();

          if (!error && data) {
            return res.json({
              success: true,
              key: data.key,
              value: data.value ?? "",
              description: data.description,
              updatedBy: data.updated_by,
              updatedAt: data.updated_at
            });
          }
        } catch (dbErr) {
          console.warn(`[Settings] Erro ao consultar chave '${key}' no Supabase:`, dbErr);
        }
      }

      // 2. Fallback para cache em memória
      const memSetting = inMemorySettings.get(key);
      return res.json({
        success: true,
        key,
        value: memSetting ? memSetting.value : "",
        description: memSetting?.description,
        updatedBy: memSetting?.updatedBy,
        updatedAt: memSetting?.updatedAt
      });
    } catch (err) {
      console.error("[Settings] Erro no GET /api/settings/:key:", err);
      return res.status(500).json({ success: false, message: "Erro interno ao buscar configuração." });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value, description, updatedBy } = req.body;
      if (!key || typeof key !== "string") {
        return res.status(400).json({ success: false, message: "A chave da configuração é obrigatória." });
      }

      const safeValue = typeof value === "string" ? value.trim() : "";
      const nowIso = new Date().toISOString();

      // Salva em memória
      inMemorySettings.set(key, {
        value: safeValue,
        description: description || inMemorySettings.get(key)?.description,
        updatedBy: updatedBy || "admin",
        updatedAt: nowIso
      });

      // Salva no Supabase se ativo
      if (supabase) {
        try {
          const { error } = await supabase
            .from("app_settings")
            .upsert({
              key,
              value: safeValue,
              description: description || undefined,
              updated_by: updatedBy || "admin",
              updated_at: nowIso
            }, { onConflict: "key" });

          if (error) {
            console.warn("[Settings] Erro ao persistir configuração no Supabase:", error);
          }
        } catch (dbErr) {
          console.warn("[Settings] Erro ao atualizar Supabase app_settings:", dbErr);
        }
      }

      console.log(`[Settings] Configuração '${key}' atualizada com sucesso por '${updatedBy || "admin"}': ${safeValue}`);
      return res.json({
        success: true,
        key,
        value: safeValue,
        updatedBy,
        updatedAt: nowIso
      });
    } catch (err) {
      console.error("[Settings] Erro no POST /api/settings:", err);
      return res.status(500).json({ success: false, message: "Erro interno ao atualizar configuração." });
    }
  });

  // ============================================================
  // PROCESSAMENTO DE TELEMETRIA DO ESP32
  // ============================================================
  function applyESP32Data(dados: any, clientIp?: string) {
    if (!dados || typeof dados !== "object") return;
    latestESP32Data = dados;
    ultimaAtualizacao = new Date().toISOString();
    signalsReceivedToday++;

    if (!esp32HasConnected) {
      esp32HasConnected = true;
      recentActivities.unshift({
        id: `conn-${Date.now()}`,
        title: "ESP32 Conectado",
        description: `Capacete EMP001 online na rede Wi-Fi (${dados.ip || clientIp || "192.168.0.122"})`,
        timestamp: Date.now(),
        type: "CONNECT",
        employeeId: "EMP001",
        employeeName: "Gabriel Araújo"
      });
      if (recentActivities.length > 20) recentActivities.pop();
    }

    console.log(`\n[ESP32] Pacote #${signalsReceivedToday} recebido em ${ultimaAtualizacao}:`);
    console.log(`  Wifi: ${dados.wifi} | IP: ${dados.ip || clientIp || "N/A"}`);
    console.log(`  Aceleração: ${dados.aceleracaoG}g | Pico: ${dados.picoG}g | Pontuação: ${dados.pontuacao}`);
    console.log(`  Impacto: ${dados.impacto} | GPS Válido: ${dados.gpsValido} (${dados.latitude}, ${dados.longitude})`);

    // Atualiza os dados do funcionário EMP001 (Gabriel Araújo / Gbxm)
    const empIndex = employees.findIndex(e => e.id === "EMP001");
    if (empIndex !== -1) {
      const currentEmp = employees[empIndex];
      const now = Date.now();

      // GPS
      let newLat = currentEmp.lat;
      let newLng = currentEmp.lng;
      const latVal = typeof dados.latitude === "number" ? dados.latitude : parseFloat(dados.latitude);
      const lngVal = typeof dados.longitude === "number" ? dados.longitude : parseFloat(dados.longitude);

      if ((dados.gpsValido === true || dados.gpsValido === "true") && !isNaN(latVal) && !isNaN(lngVal) && (latVal !== 0 || lngVal !== 0)) {
        newLat = latVal;
        newLng = lngVal;
      }

      // Detecção de impacto real pelo firmware
      const isImpact = dados.impacto === true || dados.impacto === "true" || (Number(dados.pontuacao) >= 60);

      let newStatus = currentEmp.status;
      if (isImpact) {
        newStatus = "EMERGENCY";
        if (currentEmp.status !== "EMERGENCY") {
          emergenciesCountToday++;
          const impactAccId = `ACC-${Date.now()}`;
          recentActivities.unshift({
            id: `imp-${Date.now()}`,
            title: "Alerta de Impacto",
            description: `Impacto detectado: ${parseFloat(dados.aceleracaoG) || 0}g | Pontuação: ${dados.pontuacao}/100`,
            timestamp: Date.now(),
            type: "EMERGENCY",
            employeeId: currentEmp.id,
            employeeName: currentEmp.name
          });
          if (recentActivities.length > 20) recentActivities.pop();

          // Sincroniza evento crítico de acidente no Supabase
          if (supabase) {
            supabase.from("accident_events").insert({
              id: impactAccId,
              timestamp: now,
              employee_id: currentEmp.id,
              employee_name: currentEmp.name,
              aceleracao_g: parseFloat(dados.aceleracaoG) || 0,
              pico_g: parseFloat(dados.picoG) || 0,
              pontuacao: Number(dados.pontuacao) || 0,
              lat: newLat,
              lng: newLng,
              vibracao: dados.vibracao === true || dados.vibracao === "true",
              som: dados.som === true || dados.som === "true",
              acknowledged: false
            }).then(({ error }) => {
              if (error) console.error("[Supabase] Falha ao registrar acidente:", error.message);
              else console.log("[Supabase] Incidente registrado com sucesso no banco de dados!");
            });
          }
        }
      } else if (currentEmp.status !== "EMERGENCY") {
        newStatus = "ONLINE";
      }

      const telemetryData: EmployeeTelemetry = {
        aceleracao: parseFloat(dados.aceleracao) || 0,
        aceleracaoG: parseFloat(dados.aceleracaoG) || 0,
        picoAceleracaoG: parseFloat(dados.picoAceleracaoG) || parseFloat(dados.picoG) || 0,
        picoG: parseFloat(dados.picoG) || 0,
        giroscopioGraus: parseFloat(dados.giroscopioGraus) || 0,
        pontuacao: Number(dados.pontuacao) || 0,
        pontosMPU: Number(dados.pontosMPU) || 0,
        pontosVibracao: Number(dados.pontosVibracao) || 0,
        pontosSom: Number(dados.pontosSom) || 0,
        vibracao: dados.vibracao === true || dados.vibracao === "true",
        som: dados.som === true || dados.som === "true",
        satelites: Number(dados.satelites) || 0,
        altitude: parseFloat(dados.altitude) || 0,
        hdop: parseFloat(dados.hdop) || 0,
        gpsValido: dados.gpsValido === true || dados.gpsValido === "true",
        mapsUrl: dados.mapsUrl || "",
        wifi: dados.wifi || "CONECTADO",
        ip: dados.ip || clientIp || ""
      };

      employees[empIndex] = {
        ...currentEmp,
        lat: newLat,
        lng: newLng,
        status: newStatus,
        lastSeen: now,
        telemetry: telemetryData
      };

      // Sincroniza posição e status no Supabase a cada 10 pacotes ou em emergência
      if (supabase && (signalsReceivedToday % 10 === 0 || isImpact)) {
        supabase.from("employees").update({
          lat: newLat,
          lng: newLng,
          status: newStatus,
          last_seen: now,
          battery: currentEmp.battery
        }).eq("id", currentEmp.id).then(({ error }) => {
          if (error) console.error("[Supabase] Erro ao atualizar operador:", error.message);
        });
      }

      // Notifica todos os clientes conectados instantaneamente via WebSocket
      broadcastUpdate();
    }
  }

  // ============================================================
  // ROTAS DA API ESP32 (DADOS REAIS DOS SENSORES)
  // ============================================================
  app.post("/api/dados", (req, res) => {
    applyESP32Data(req.body, req.ip);
    res.status(200).json({
      sucesso: true,
      mensagem: "Dados recebidos com sucesso pelo monitor."
    });
  });

  app.get("/api/dados", (_req, res) => {
    if (!latestESP32Data) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Ainda não existem dados do ESP32."
      });
    }
    res.json(latestESP32Data);
  });

  app.get("/api/employees", (_req, res) => {
    res.json(employees);
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      api: "online",
      esp32Conectado: latestESP32Data !== null,
      ultimaAtualizacao
    });
  });

  app.get("/api/interfaces", (_req, res) => {
    res.json({
      interfaces: getLocalIpAddresses(),
      port: PORT,
      endpoint: "/api/dados"
    });
  });

  // ============================================================
  // SUPORTE A POLLING ESP32 (MODO BUSCA ATIVA)
  // ============================================================
  let pollingEsp32Ip = process.env.ESP32_IP || "";
  let pollingInterval: NodeJS.Timeout | null = null;

  function startEsp32Polling(targetIp: string) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingEsp32Ip = targetIp.trim();
    if (!pollingEsp32Ip) return;

    const authUser = process.env.ESP32_AUTH_USER || "Gbxm";
    const authPass = process.env.ESP32_AUTH_PASS || "Gbxm#1853";
    const authHeader = "Basic " + Buffer.from(`${authUser}:${authPass}`).toString("base64");
    console.log(`[ESP32 Polling] Iniciando busca periódica segura em http://${pollingEsp32Ip}/dados...`);

    pollingInterval = setInterval(async () => {
      try {
        const url = `http://${pollingEsp32Ip}/dados`;
        const resp = await fetch(url, {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(2000)
        });
        if (resp.ok) {
          const data = await resp.json();
          applyESP32Data(data, pollingEsp32Ip);
        }
      } catch {
        // Silencioso se o ESP32 estiver offline/desconectado momentaneamente
      }
    }, 2000);
  }

  if (pollingEsp32Ip) {
    startEsp32Polling(pollingEsp32Ip);
  }

  app.post("/api/esp32/polling", (req, res) => {
    const { ip } = req.body;
    if (ip) {
      startEsp32Polling(ip);
      res.json({ sucesso: true, mensagem: `Polling configurado para ${ip}` });
    } else {
      if (pollingInterval) clearInterval(pollingInterval);
      pollingEsp32Ip = "";
      res.json({ sucesso: true, mensagem: "Polling desativado." });
    }
  });

  app.get("/api/esp32/polling", (_req, res) => {
    res.json({
      ativo: Boolean(pollingEsp32Ip),
      ip: pollingEsp32Ip
    });
  });

  // Vite setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // WebSocket logic
  wss.on("connection", (ws) => {
    console.log("Client connected");
    
    // Send initial state with real-time stats and recent activities
    ws.send(JSON.stringify({ 
      type: "INITIAL_STATE", 
      data: employees,
      stats: getSystemStats(),
      activities: recentActivities
    }));

    ws.on("message", (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === "IGNORE_EMERGENCY") {
          const empId = parsed.employeeId;
          employees = employees.map(emp => 
            emp.id === empId && emp.status === "EMERGENCY" 
              ? { ...emp, status: "ONLINE", lastSeen: Date.now() } 
              : emp
          );
          recentActivities.unshift({
            id: `ign-${Date.now()}`,
            title: "Emergência Reconhecida",
            description: `Alerta do operador ${empId} desativado manualmente pelo usuário`,
            timestamp: Date.now(),
            type: "INFO",
            employeeId: empId
          });
          if (recentActivities.length > 20) recentActivities.pop();
          broadcastUpdate();
        } else if (parsed.type === "SET_BASE_LOCATION") {
          const { lat, lng } = parsed;
          // Set base location around user if GPS hasn't updated EMP001 yet
          employees = employees.map((emp) => {
            if (emp.id === "EMP001" && emp.telemetry?.gpsValido) {
              return emp; // Manter GPS real
            }
            return {
              ...emp,
              lat: lat + (Math.random() - 0.5) * 0.005,
              lng: lng + (Math.random() - 0.5) * 0.005,
            };
          });
          broadcastUpdate();
        }
      } catch (e) {
        console.error("Error parsing message", e);
      }
    });

    ws.on("close", () => console.log("Client disconnected"));
  });

  function broadcastUpdate() {
    const updateMsg = JSON.stringify({ 
      type: "UPDATE", 
      data: employees,
      stats: getSystemStats(),
      activities: recentActivities
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(updateMsg);
      }
    });
  }

  // Heartbeat loop: apenas monitora perda de sinal (sem movimentação ou emergência aleatória)
  setInterval(() => {
    let changed = false;
    const now = Date.now();

    employees = employees.map((emp) => {
      const timeSinceLastSeen = now - emp.lastSeen;
      let newStatus = emp.status;

      // Se não estiver em emergência ativa, atualiza status por perda de conexão
      if (emp.status !== "EMERGENCY") {
        if (timeSinceLastSeen > 30000 && emp.status !== "OFFLINE") {
          newStatus = "OFFLINE";
          changed = true;
        } else if (timeSinceLastSeen > 15000 && emp.status !== "UNSTABLE" && emp.status !== "OFFLINE") {
          newStatus = "UNSTABLE";
          changed = true;
        }
      }

      return {
        ...emp,
        status: newStatus
      };
    });

    if (changed) {
      broadcastUpdate();
    }
  }, 3000);

  // Rotina de Housekeeping: limpeza periódica de tokens OTP expirados (a cada 30 minutos)
  runPasswordResetHousekeeping();
  setInterval(runPasswordResetHousekeeping, 30 * 60 * 1000);

  httpServer.listen(PORT, "0.0.0.0", () => {
    const ips = getLocalIpAddresses();
    console.log("\n============================================================");
    console.log("       INDUSTRIAL SAFETY MONITOR - SERVIDOR ATIVO");
    console.log("============================================================");
    console.log(`Porta: ${PORT}`);
    console.log(`Painel Web Local:       http://localhost:${PORT}`);
    if (ips.length > 0) {
      console.log("\nAcesso pelo Navegador na Rede:");
      ips.forEach(ip => {
        console.log(`  - [${ip.name}] http://${ip.address}:${PORT}`);
      });
      console.log("\n-> Configure no ESP32 (Codigo_Teste_API.ino):");
      ips.forEach(ip => {
        console.log(`   const char* apiURL = "http://${ip.address}:${PORT}/api/dados";`);
      });
    }
    console.log(`\nStatus da API:          http://localhost:${PORT}/api/status`);
    console.log("============================================================\n");
  });
}

startServer();
