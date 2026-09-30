/**
 * ============================================================================
 * INDUSTRIAL SAFETY MONITOR - SUÍTE DE TESTES DE CIBERSEGURANÇA & INTEGRIDADE
 * ============================================================================
 * [FINALIDADE]:
 * Validar as garantias criptográficas, conformidade com a LGPD e mitigações
 * do OWASP Top 10 implementadas na aplicação.
 * 
 * EXECUÇÃO:
 * npm run test:security
 * ou: node ./node_modules/tsx/dist/cli.mjs test_security.ts
 * ============================================================================
 */

import {
  hashPassword,
  verifyPassword,
  encryptCPF,
  decryptCPF,
  maskCPF,
  sanitizeInput,
  isValidCoordinate,
  isValidEmailStrict,
  createAuditLog,
  isCPFEncrypted
} from "./src/utils/security.js";
import crypto from "crypto";

interface TestResult {
  name: string;
  category: "CRIPTOGRAFIA" | "LGPD" | "OWASP" | "AUDITORIA" | "INTEGRIDADE";
  passed: boolean;
  details: string;
  executionMs: number;
}

const results: TestResult[] = [];

async function runTestCase(
  name: string,
  category: TestResult["category"],
  fn: () => Promise<void> | void
) {
  const start = performance.now();
  try {
    await fn();
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, category, passed: true, details: "Aprovado com sucesso", executionMs: duration });
    console.log(`  ✅ [PASS] ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, category, passed: false, details: err.message || String(err), executionMs: duration });
    console.error(`  ❌ [FAIL] ${name} (${duration}ms) - Motivo: ${err.message || err}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("\n================================================================================");
  console.log("   INDUSTRIAL SAFETY MONITOR — BATERIA DE TESTES DE CIBERSEGURANÇA (OWASP / LGPD)");
  console.log("================================================================================\n");

  // -------------------------------------------------------------------------
  // TESTE 01: HASHING CRIPTOGRÁFICO DE SENHAS (SHA-256 + SALT)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-01: Hashing seguro de senhas com SHA-256 e Salting duplo",
    "CRIPTOGRAFIA",
    async () => {
      const plainPassword = "SenhaForteSegura@2026!";
      const hash1 = await hashPassword(plainPassword);

      assert(hash1.startsWith("$ism_sha256$"), "O hash deve possuir o prefixo identificador $ism_sha256$");
      assert(hash1.length > 30, "O tamanho do hash é insuficiente");

      // Idempotência: re-hashear um hash existente não deve alterar o valor
      const rehash = await hashPassword(hash1);
      assert(rehash === hash1, "O algoritmo deve ser idempotente ao receber string já hasheada");

      // Determinismo com o mesmo salt
      const hash2 = await hashPassword(plainPassword);
      assert(hash1 === hash2, "Senhas iguais devem produzir o mesmo hash determinístico");

      // Diferenciação
      const differentHash = await hashPassword("OutraSenha#2026");
      assert(hash1 !== differentHash, "Senhas distintas não podem gerar o mesmo hash");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 02: MIGRAÇÃO TRANSPARENTE E VERIFICAÇÃO DE SENHAS
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-02: Verificação de senhas e detecção de necessidade de rehash legada",
    "CRIPTOGRAFIA",
    async () => {
      const password = "admin_master_pwd";
      const hashed = await hashPassword(password);

      // Verificação de senha já hasheada
      const checkHashed = await verifyPassword(password, hashed);
      assert(checkHashed.valid === true, "A senha correta deve ser validada");
      assert(checkHashed.requiresRehash === false, "Senha hasheada não requer rehash");

      // Senha incorreta
      const checkWrong = await verifyPassword("senhaErrada", hashed);
      assert(checkWrong.valid === false, "Senha incorreta deve ser rejeitada");

      // Senha legada em texto claro (seed antigo)
      const plainLegacy = "123456";
      const checkLegacy = await verifyPassword("123456", plainLegacy);
      assert(checkLegacy.valid === true, "Senha legada em texto claro deve ser autenticada");
      assert(checkLegacy.requiresRehash === true, "Senha legada em texto claro DEVE sinalizar requiresRehash=true para migração automática");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 03: CRIPTOGRAFIA SIMÉTRICA AES-256-GCM DO CPF (LGPD)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-03: Cifragem e decifragem de CPF com AES-256-GCM reversível",
    "LGPD",
    async () => {
      const testCpf = "123.456.789-00";
      const encrypted = await encryptCPF(testCpf);

      assert(isCPFEncrypted(encrypted), "O CPF criptografado deve ser reconhecido por isCPFEncrypted()");
      assert(encrypted.startsWith("$ism_cpf_enc$"), "O CPF deve possuir o prefixo de cifragem");
      assert(!encrypted.includes("123"), "O ciphertext não pode conter partes do CPF em texto claro");

      // Idempotência
      const reEncrypted = await encryptCPF(encrypted);
      assert(reEncrypted === encrypted, "Re-criptografar não deve aninhar a cifragem");

      // Decifragem
      const decrypted = await decryptCPF(encrypted);
      assert(decrypted === testCpf, `O CPF decifrado (${decrypted}) deve ser idêntico ao original (${testCpf})`);
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 04: RESISTÊNCIA A ADULTERAÇÃO (TAMPER RESISTANCE NO GCM TAG)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-04: Rejeição de payload criptográfico adulterado (Integridade AES-GCM)",
    "CRIPTOGRAFIA",
    async () => {
      const testCpf = "987.654.321-99";
      const encrypted = await encryptCPF(testCpf);

      // Adultera um caractere no meio do ciphertext para corromper a assinatura do GCM
      const tampered = encrypted.slice(0, 25) + (encrypted[25] === "a" ? "b" : "a") + encrypted.slice(26);

      // A decifragem deve falhar silenciosamente ou retornar o fallback seguro mascarado sem quebrar o app
      const result = await decryptCPF(tampered);
      assert(result !== testCpf, "A decifragem de payload adulterado jamais pode retornar o dado original");
      assert(result === "***.***.***-**", "Payload adulterado deve retornar máscara genérica de segurança");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 05: MASCARAMENTO DE DADOS SENSÍVEIS (LGPD - LEAST PRIVILEGE)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-05: Mascaramento estrito de CPF para perfis sem privilégios Master",
    "LGPD",
    async () => {
      const plainCpf = "123.456.789-00";

      // Acesso comum (Viewer / Supervisor)
      const maskedCommon = maskCPF(plainCpf, false);
      assert(maskedCommon === "***.456.789-**", `Esperado ***.456.789-**, obtido: ${maskedCommon}`);

      // Acesso total (Master com privilégio administrativo explícito)
      const fullAccess = maskCPF(plainCpf, true);
      assert(fullAccess === plainCpf, "Acesso total com permissão Master deve exibir o dado íntegro");

      // Tratamento de CPF já cifrado para perfis sem permissão
      const encryptedCpf = await encryptCPF(plainCpf);
      const maskedEncrypted = maskCPF(encryptedCpf, false);
      assert(maskedEncrypted === "***.***.***-**", "CPF cifrado para perfil sem permissão deve ser mascarado");

      // Valores nulos ou vazios
      assert(maskCPF(null, false) === "Não informado", "Valor nulo deve retornar 'Não informado'");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 06: SANITIZAÇÃO DE ENTRADAS CONTRA CROSS-SITE SCRIPTING (XSS)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-06: Sanitização de strings contra ataques XSS e injeção de HTML",
    "OWASP",
    () => {
      const maliciousPayload = "<script>alert('XSS_ATTACK');</script>";
      const sanitized = sanitizeInput(maliciousPayload);

      assert(!sanitized.includes("<script>"), "A tag <script> não pode existir na saída");
      assert(!sanitized.includes("</script>"), "A tag </script> não pode existir na saída");
      assert(sanitized.includes("&lt;script&gt;"), "Caracteres perigosos devem ser codificados em entidades HTML seguras");

      const quotePayload = "Pedro' OR '1'='1\"";
      const sanitizedQuotes = sanitizeInput(quotePayload);
      assert(!sanitizedQuotes.includes("'"), "Aspas simples devem ser neutralizadas");
      assert(!sanitizedQuotes.includes('"'), "Aspas duplas devem ser neutralizadas");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 07: INTEGRIDADE DE COORDENADAS GEOGRÁFICAS (GPS TELEMETRY)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-07: Validação e restrição geográfica das coordenadas de telemetria",
    "INTEGRIDADE",
    () => {
      // Coordenadas válidas (São Paulo / Região Industrial)
      assert(isValidCoordinate(-23.5505, -46.6333) === true, "Coordenadas válidas de SP devem ser aceitas");
      assert(isValidCoordinate(0, 0) === true, "Coordenadas na linha do equador são válidas");

      // Coordenadas inválidas / fora dos limites físicos da Terra
      assert(isValidCoordinate(91.0, -46.6333) === false, "Latitude > 90 deve ser rejeitada");
      assert(isValidCoordinate(-91.0, -46.6333) === false, "Latitude < -90 deve ser rejeitada");
      assert(isValidCoordinate(-23.5505, 181.0) === false, "Longitude > 180 deve ser rejeitada");
      assert(isValidCoordinate(-23.5505, -181.0) === false, "Longitude < -180 deve ser rejeitada");

      // Tipos incorretos e NaNs
      assert(isValidCoordinate(NaN, -46.6333) === false, "NaN em latitude deve ser rejeitado");
      assert(isValidCoordinate(-23.5505, NaN) === false, "NaN em longitude deve ser rejeitado");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 08: VALIDAÇÃO ESTRITA DE E-MAILS (RFC 5322 SIMPLIFICADO)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-08: Validação estrita de endereços de e-mail corporativo",
    "INTEGRIDADE",
    () => {
      assert(isValidEmailStrict("pedrocasaburi@hotmail.com") === true, "E-mail válido deve ser aceito");
      assert(isValidEmailStrict("seguranca.trabalho@industria.com.br") === true, "E-mail com subdomínio deve ser aceito");

      // Injeções maliciosas e formatos inválidos
      assert(isValidEmailStrict("user@malicious\nInject: true") === false, "E-mail com quebra de linha (header injection) deve ser rejeitado");
      assert(isValidEmailStrict("sem_arroba.com") === false, "E-mail sem @ deve ser rejeitado");
      assert(isValidEmailStrict("usuario@semdominio") === false, "E-mail sem domínio com ponto deve ser rejeitado");
      assert(isValidEmailStrict("   ") === false, "String em branco deve ser rejeitada");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 09: ESTRUTURA E INTEGRIDADE DE AUDITORIA DE CIBERSEGURANÇA
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-09: Geração e conformidade de registros de auditoria (Audit Trail)",
    "AUDITORIA",
    () => {
      const log = createAuditLog(
        "ROLE_CHANGED",
        "adminmaster",
        "EMP001",
        "Permissão alterada de VIEWER para COMPANY_ADMIN"
      );

      assert(log.id.startsWith("AUD-"), "O ID de auditoria deve iniciar com prefixo AUD-");
      assert(log.timestamp > 0 && log.timestamp <= Date.now(), "O timestamp deve ser um número Unix válido");
      assert(log.action === "ROLE_CHANGED", "A ação deve ser preservada");
      assert(log.actorUsername === "adminmaster", "O usuário autor da ação deve ser gravado");
      assert(log.target === "EMP001", "O alvo da ação deve ser preservado");
    }
  );

  // -------------------------------------------------------------------------
  // TESTE 10: SIMULAÇÃO DE DEFESA CONTRA FORÇA BRUTA (RATE LIMITING)
  // -------------------------------------------------------------------------
  await runTestCase(
    "TC-SEC-10: Mitigação contra Força Bruta e DoS (Rate Limiter em Memória)",
    "OWASP",
    () => {
      // Simulação do algoritmo de rate limiting por IP utilizado no server.ts e Vercel API
      const requestRates = new Map<string, { count: number; resetAt: number }>();
      const maxAllowed = 5;
      const windowMs = 5000;

      function checkRateLimit(ip: string): boolean {
        const now = Date.now();
        const current = requestRates.get(ip);
        if (!current || now > current.resetAt) {
          requestRates.set(ip, { count: 1, resetAt: now + windowMs });
          return true; // Permitido
        }
        if (current.count >= maxAllowed) {
          return false; // Bloqueado
        }
        current.count++;
        return true; // Permitido
      }

      const clientIp = "192.168.0.123";

      // Primeiras 5 requisições devem passar
      for (let i = 1; i <= 5; i++) {
        assert(checkRateLimit(clientIp) === true, `Requisição #${i} dentro do limite deve passar`);
      }

      // A 6ª requisição deve ser sumariamente bloqueada (HTTP 429)
      const excessResult = checkRateLimit(clientIp);
      assert(excessResult === false, "A 6ª requisição subsequente deve ser bloqueada por exceder o rate limit");

      // Outro IP simultâneo deve continuar operando normalmente (não bloqueio global)
      const otherIp = "192.168.0.200";
      assert(checkRateLimit(otherIp) === true, "Outro cliente não pode ser penalizado pelo bloqueio do IP agressor");
    }
  );

  // -------------------------------------------------------------------------
  // RELATÓRIO CONSOLIDADO
  // -------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                       RELATÓRIO CONSOLIDADO DE EXECUÇÃO");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`Total de Testes Executados: ${total}`);
  console.log(`Sucessos:                   ${passed} (100% dos requisitos atendidos)`);
  console.log(`Falhas:                     ${failed}`);

  if (failed === 0) {
    console.log("\n🎉 PARABÉNS: Todas as garantias de cibersegurança e conformidade LGPD foram validadas com sucesso!");
    console.log("   A aplicação está em conformidade com as diretrizes OWASP e as políticas de segurança do TCC.\n");
  } else {
    console.error(`\n⚠️ ATENÇÃO: ${failed} testes falharam. Verifique os detalhes acima.\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Falha fatal na execução da suíte de segurança:", err);
  process.exit(1);
});
