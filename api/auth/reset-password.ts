/**
 * ============================================================================
 * INDUSTRIAL SAFETY MONITOR - SERVERLESS FUNCTION: /api/auth/reset-password
 * ============================================================================
 * [GUIA PARA O SQUAD DE CLOUD & SERVERLESS - VERCEL]
 * 
 * FINALIDADE:
 * Validação segura de token OTP e redefinição de credenciais de acesso em ambiente serverless Vercel.
 * 
 * FLUXO DE SEGURANÇA & MITIGAÇÃO OWASP:
 * 1. Proteção contra Ataques de Dicionário / Força Bruta:
 *    - Limite estrito de 5 tentativas por código OTP emitido.
 *    - Após a 5ª tentativa falha, o código é marcado como inválido/bloqueado.
 *    - Rate Limiting por IP para impedir bombardeamento automatizado de payloads.
 * 2. Validação Criptográfica:
 *    - O código fornecido é transformado em SHA-256 com o Salt do sistema e comparado com o hash no Supabase.
 * 3. Hashing da Nova Senha:
 *    - A nova senha é convertida para hash SHA-256 salteado com prefixo "$ism_sha256$" antes do UPDATE no banco.
 * 4. Revogação de Sessão (Token Version Invalidation):
 *    - O campo `token_version` do usuário é incrementado (+1) para derrubar sessões prévias roubadas/antigas.
 * ============================================================================
 */
import type { IncomingMessage, ServerResponse } from "http";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type VercelRequest = IncomingMessage & { body?: any; query?: Record<string, string | string[]>; };
type VercelResponse = ServerResponse & {
  json: (data: any) => void;
  status: (code: number) => VercelResponse;
  end: () => void;
};

const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim();
const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const OTP_SALT = "ISM_SAFETY_SALT_2026_SECURE_#";

function hashOtp(code: string, email: string): string {
  return crypto
    .createHash("sha256")
    .update(`${OTP_SALT}:${email.toLowerCase()}:${code}:${OTP_SALT}`)
    .digest("hex");
}

function hashPasswordServer(plainText: string): string {
  if (plainText.startsWith("$ism_sha256$")) return plainText;
  const hex = crypto
    .createHash("sha256")
    .update(OTP_SALT + plainText + OTP_SALT)
    .digest("hex");
  return `$ism_sha256$${hex}`;
}

// Rate limiting por IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  if (entry.count >= 15) return true;
  entry.count++;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ success: false, message: "Método não permitido." });

  const clientIp = (
    (req.headers["x-forwarded-for"] as string) ||
    (req.headers["x-real-ip"] as string) ||
    "127.0.0.1"
  )
    .split(",")[0]
    .trim();

  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      success: false,
      message: "Muitas tentativas. Aguarde alguns minutos."
    });
  }

  const { email, code, newPassword } = req.body || {};

  if (!email || !code || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "E-mail, código e nova senha são obrigatórios."
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanCode = String(code).trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({
      success: false,
      message: "O código deve conter exatamente 6 dígitos numéricos."
    });
  }

  if (typeof newPassword !== "string" || newPassword.length < 4) {
    return res.status(400).json({
      success: false,
      message: "A nova senha deve ter ao menos 4 caracteres."
    });
  }

  if (!supabase) {
    return res.status(503).json({
      success: false,
      message: "Banco de dados não configurado. Contate o administrador."
    });
  }

  try {
    // Buscar o reset ativo mais recente para este e-mail
    const { data: resets, error: fetchErr } = await supabase
      .from("password_resets")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchErr || !resets || resets.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Código inexistente ou expirado. Solicite um novo código."
      });
    }

    const activeReset = resets[0];

    // Verificar limite de tentativas
    if (activeReset.attempts >= 5) {
      await supabase
        .from("password_resets")
        .update({ used: true })
        .eq("id", activeReset.id);
      return res.status(400).json({
        success: false,
        message: "Limite de tentativas excedido. Solicite um novo código."
      });
    }

    // Validar o código usando timingSafeEqual (prevenção de timing attacks)
    const inputHash = hashOtp(cleanCode, normalizedEmail);
    const storedHash = activeReset.code_hash;

    let isValid = false;
    try {
      const bufStored = Buffer.from(storedHash, "hex");
      const bufInput = Buffer.from(inputHash, "hex");
      isValid = bufStored.length === bufInput.length && crypto.timingSafeEqual(bufStored, bufInput);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      const nextAttempts = (activeReset.attempts || 0) + 1;
      const remaining = Math.max(0, 5 - nextAttempts);

      await supabase
        .from("password_resets")
        .update({ attempts: nextAttempts, used: nextAttempts >= 5 })
        .eq("id", activeReset.id);

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

    // Código válido: marcar como usado
    await supabase
      .from("password_resets")
      .update({ used: true })
      .eq("id", activeReset.id);

    // Hashear a nova senha e atualizar no banco
    const hashedPassword = hashPasswordServer(newPassword);
    const nowIso = new Date().toISOString();

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

    // Registrar log de auditoria (silencioso - não bloqueia o fluxo)
    try {
      await supabase.from("security_audit_logs").insert({
        timestamp: Date.now(),
        action: "PASSWORD_RESET",
        actor_username: normalizedEmail,
        target: normalizedEmail,
        details: "Senha redefinida com sucesso via OTP Vercel Serverless",
        ip: clientIp
      });
    } catch { /* tabela pode não existir ainda - não bloqueia */ }

    console.log(`[reset-password] Senha redefinida com sucesso para ${normalizedEmail}`);

    return res.json({
      success: true,
      message: "Senha redefinida com sucesso! Você já pode realizar o login com suas novas credenciais."
    });
  } catch (err: any) {
    console.error("[reset-password] Erro interno:", err);
    return res.status(500).json({
      success: false,
      message: "Erro interno ao processar a redefinição de senha."
    });
  }
}
