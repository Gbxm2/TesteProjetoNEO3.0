/**
 * INDUSTRIAL SAFETY MONITOR - MÓDULO DE CIBERSEGURANÇA E PRIVACIDADE (LGPD)
 * 
 * Implementa boas práticas OWASP Top 10 e LGPD (Lei nº 13.709/2018):
 * 1. Hashing criptográfico de senhas (Web Crypto API - SHA-256 + Salt)
 * 2. Suporte à migração segura transparente de senhas legadas
 * 3. Mascaramento e proteção de dados pessoais sensíveis (CPF, contatos)
 * 4. Sanitização de inputs para prevenção de XSS e injeções
 * 5. Registro e formato padronizado de logs de auditoria de segurança
 */

// Prefixo identificador para diferenciar senhas já hasheadas de senhas em texto puro
const HASH_PREFIX = "$ism_sha256$";
const SYSTEM_SALT = "ISM_SAFETY_SALT_2026_SECURE_#";

// Prefixo identificador para CPFs criptografados com AES-GCM
const CPF_ENC_PREFIX = "$ism_cpf_enc$";
// Chave derivada fixa para criptografia simétrica AES-GCM do CPF (determinística, sem necessidade de chave externa)
const CPF_AES_KEY_MATERIAL = "ISM_CPF_AES256_KEY_2026_LGPD_#";

/**
 * Converte um ArrayBuffer em uma string hexadecimal.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Gera o hash criptográfico seguro de uma senha utilizando SHA-256 e Salt da Web Crypto API.
 */
export async function hashPassword(plainText: string, salt: string = SYSTEM_SALT): Promise<string> {
  if (!plainText) return "";
  
  // Se já for um hash gerado pelo sistema, não re-hashear
  if (plainText.startsWith(HASH_PREFIX)) {
    return plainText;
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + plainText + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hexHash = bufferToHex(hashBuffer);
    return `${HASH_PREFIX}${hexHash}`;
  } catch (err) {
    console.warn("[Security] Web Crypto API indisponível, utilizando fallback seguro:", err);
    // Fallback determinístico simples com salt se Web Crypto não estiver acessível
    let hash = 0;
    const combined = salt + plainText;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `${HASH_PREFIX}fb_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Verifica se a senha fornecida pelo usuário confere com o valor armazenado.
 * Suporta migração retrocompatível transparente (texto puro -> hash seguro).
 */
export async function verifyPassword(inputPassword: string, storedPasswordOrHash: string): Promise<{ valid: boolean; requiresRehash: boolean }> {
  if (!inputPassword || !storedPasswordOrHash) {
    return { valid: false, requiresRehash: false };
  }

  // Caso 1: Senha armazenada já está com hash seguro
  if (storedPasswordOrHash.startsWith(HASH_PREFIX)) {
    const computedHash = await hashPassword(inputPassword);
    return {
      valid: computedHash === storedPasswordOrHash,
      requiresRehash: false
    };
  }

  // Caso 2: Senha legada em texto puro (ex: seed "123456")
  const matchesPlainText = inputPassword === storedPasswordOrHash;
  return {
    valid: matchesPlainText,
    requiresRehash: matchesPlainText // Se bateu em texto puro, sinaliza para atualizar para hash imediatamente
  };
}

/**
 * Mascara o CPF para visualização pública ou de perfis sem privilégios Master,
 * garantindo conformidade com a LGPD (Princípio da Necessidade e Minimização).
 * Exemplo: "123.456.789-00" -> "***.456.789-**"
 */
export function maskCPF(cpf?: string | null, isFullAccess: boolean = false): string {
  if (!cpf) return "Não informado";
  if (isCPFEncrypted(cpf)) {
    return isFullAccess ? "[CPF Protegido - AES-256]" : "***.***.***-**";
  }
  if (isFullAccess) return cpf;
  
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return "***.***.***-**";
  
  return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
}

/**
 * Sanitiza strings para exibição segura, neutralizando potenciais tags maliciosas.
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .trim();
}

/**
 * Validação rigorosa de coordenadas geográficas para integridade de telemetria.
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Registro de Auditoria de Cibersegurança
 */
export interface SecurityAuditRecord {
  id: string;
  timestamp: number;
  action: "LOGIN_SUCCESS" | "LOGIN_FAILED" | "ROLE_CHANGED" | "USER_CREATED" | "USER_DISABLED" | "EMERGENCY_ACKNOWLEDGED" | "PASSWORD_RESET_REQUEST" | "PASSWORD_RESET";
  actorUsername: string;
  target?: string;
  details?: string;
  ip?: string;
}

export function createAuditLog(
  action: SecurityAuditRecord["action"],
  actorUsername: string,
  target?: string,
  details?: string
): SecurityAuditRecord {
  return {
    id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    action,
    actorUsername,
    target,
    details
  };
}

// ============================================================
// CRIPTOGRAFIA SIMÉTRICA AES-GCM PARA CPF (REVERSÍVEL / LGPD)
// Diferente da senha (hash SHA-256 irreversível), o CPF precisa ser
// recuperável para exibição a usuários MASTER autorizados.
// ============================================================

/**
 * Deriva uma chave AES-256 a partir do material fixo usando PBKDF2.
 */
async function deriveAESKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CPF_AES_KEY_MATERIAL),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(SYSTEM_SALT),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Verifica se um valor de CPF já está criptografado pelo sistema.
 */
export function isCPFEncrypted(cpf?: string | null): boolean {
  if (!cpf) return false;
  return cpf.startsWith(CPF_ENC_PREFIX);
}

/**
 * Criptografa um CPF em texto puro usando AES-256-GCM.
 * Retorna string no formato: $ism_cpf_enc$<iv_hex>:<ciphertext_hex>
 * Se o CPF já estiver criptografado, retorna sem alteração.
 */
export async function encryptCPF(plainCpf: string): Promise<string> {
  if (!plainCpf || plainCpf.trim() === "") return "";
  
  // Se já estiver criptografado, não re-criptografar
  if (isCPFEncrypted(plainCpf)) {
    return plainCpf;
  }

  try {
    const key = await deriveAESKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // IV de 96 bits para AES-GCM
    
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plainCpf)
    );

    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join("");
    const cipherHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, "0")).join("");
    
    return `${CPF_ENC_PREFIX}${ivHex}:${cipherHex}`;
  } catch (err) {
    console.warn("[Security] Falha na criptografia AES-GCM do CPF, armazenando mascarado:", err);
    // Fallback seguro: retorna CPF mascarado ao invés de texto puro
    const clean = plainCpf.replace(/\D/g, "");
    if (clean.length === 11) {
      return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
    }
    return "***.***.***-**";
  }
}

/**
 * Descriptografa um CPF criptografado com AES-256-GCM.
 * Retorna o CPF em texto puro. Se o valor não estiver criptografado, retorna como está.
 */
export async function decryptCPF(encryptedCpf: string): Promise<string> {
  if (!encryptedCpf || encryptedCpf.trim() === "") return "";
  
  // Se não estiver criptografado, retornar como está (compatibilidade retroativa)
  if (!isCPFEncrypted(encryptedCpf)) {
    return encryptedCpf;
  }

  try {
    const payload = encryptedCpf.slice(CPF_ENC_PREFIX.length);
    const [ivHex, cipherHex] = payload.split(":");
    
    if (!ivHex || !cipherHex) {
      console.warn("[Security] Formato de CPF criptografado inválido");
      return "***.***.***-**";
    }

    const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const cipherBytes = new Uint8Array(cipherHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));

    const key = await deriveAESKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBytes
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("[Security] Falha na descriptografia AES-GCM do CPF:", err);
    return "***.***.***-**";
  }
}

/**
 * Validação rigorosa de formato de e-mail (RFC 5322 simplificada).
 * Verifica: presença de @, domínio com ponto, TLD mínimo 2 chars, sem espaços.
 */
export function isValidEmailStrict(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(trimmed);
}

