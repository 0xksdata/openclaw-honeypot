// Attack Pattern Analyzer
// Detects common attack patterns for logging and alerting

import { logSuspiciousActivity, updateAttackerSession } from "../database/queries.js";
import { logger } from "./logger.js";

export interface AnalysisResult {
  isSuspicious: boolean;
  reasons: string[];
  severity: "low" | "medium" | "high" | "critical";
  attackTypes: string[];
}

// SQL Injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b.*\b(FROM|INTO|SET|TABLE|DATABASE)\b)/i,
  /(\b(OR|AND)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/i,
  /(--|#|\/\*|\*\/)/,
  /(\bOR\b\s+['"]?[a-z]+['"]?\s*=\s*['"]?[a-z]+['"]?)/i,
  /('\s*(OR|AND)\s*')/i,
  /(SLEEP\s*\(\s*\d+\s*\))/i,
  /(BENCHMARK\s*\()/i,
  /(LOAD_FILE\s*\()/i,
  /(INTO\s+(OUTFILE|DUMPFILE))/i,
  /(INFORMATION_SCHEMA)/i,
  /(CONCAT\s*\(.*SELECT)/i,
  /(\bEXEC\b|\bEXECUTE\b)/i,
  /(xp_cmdshell)/i,
];

// Command Injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /(;|\||`|\$\(|\$\{)/,
  /(\b(cat|ls|pwd|whoami|id|uname|wget|curl|nc|netcat|bash|sh|python|perl|ruby|php)\b)/i,
  /(\.\.\/)|(\.\.\\)/,
  /(\/etc\/passwd|\/etc\/shadow)/i,
  /(\||\&\&|\|\||;)\s*(cat|ls|rm|mv|cp|wget|curl)/i,
  /(\$\{.*\})/,
  /(>\s*\/)/,
  /(\breverse\b.*\bshell\b)/i,
  /(\/bin\/bash|\/bin\/sh)/,
  /(eval\s*\()/i,
];

// XSS patterns
const XSS_PATTERNS = [
  /(<script[^>]*>)/i,
  /(javascript\s*:)/i,
  /(on\w+\s*=\s*["'])/i,
  /(<img[^>]+onerror)/i,
  /(<svg[^>]+onload)/i,
  /(<iframe)/i,
  /(document\.cookie)/i,
  /(document\.location)/i,
  /(window\.location)/i,
  /(<body[^>]+onload)/i,
  /(expression\s*\()/i,
  /(vbscript\s*:)/i,
];

// Path Traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /(\.\.\/){2,}/,
  /(\.\.\\){2,}/,
  /(%2e%2e%2f)/i,
  /(%252e%252e%252f)/i,
  /(%c0%ae)/i,
  /(\/etc\/)/i,
  /(\/proc\/)/i,
  /(\/var\/log)/i,
  /(C:\\Windows)/i,
  /(\/root\/)/i,
];

// Prompt Injection patterns (AI-specific)
const PROMPT_INJECTION_PATTERNS = [
  /(ignore\s+(previous|all|above)\s+(instructions?|prompts?|rules?))/i,
  /(disregard\s+(your|the|all)\s+(instructions?|guidelines?|rules?))/i,
  /(you\s+are\s+now\s+)/i,
  /(from\s+now\s+on\s+you\s+(are|will|must))/i,
  /(pretend\s+(you\s+are|to\s+be))/i,
  /(act\s+as\s+(if|a|an))/i,
  /(new\s+instructions?:)/i,
  /(system\s*:)/i,
  /(ADMIN\s*:)/i,
  /(bypass\s+(safety|content|filter))/i,
  /(jailbreak)/i,
  /(DAN\s+mode)/i,
  /(developer\s+mode)/i,
  /(do\s+anything\s+now)/i,
  /(\[SYSTEM\])/i,
  /(override\s+(safety|security))/i,
];

// Scanner/Recon patterns
const SCANNER_PATTERNS = [
  /(nmap|nikto|sqlmap|burp|dirbuster|gobuster|wfuzz)/i,
  /(\/\.git\/)/i,
  /(\/\.env)/i,
  /(\/wp-admin|\/wp-content|\/wp-includes)/i,
  /(\/phpmyadmin|\/pma)/i,
  /(\/admin|\/administrator|\/manager)/i,
  /(\/backup|\/bak|\.bak|\.backup)/i,
  /(\/config|\/configuration)/i,
  /(\.sql|\.db|\.sqlite)/i,
  /(\/api\/v\d+\/)/i,
  /(\/swagger|\/api-docs|\/openapi)/i,
  /(robots\.txt|sitemap\.xml)/i,
];

// Exploit attempt patterns
const EXPLOIT_PATTERNS = [
  /(CVE-\d{4}-\d+)/i,
  /(log4j|log4shell)/i,
  /(spring4shell)/i,
  /(shellshock)/i,
  /(heartbleed)/i,
  /(struts)/i,
  /(jndi:ldap)/i,
  /(jndi:rmi)/i,
  /(jndi:dns)/i,
  /(base64_decode\s*\()/i,
  /(eval\s*\(\s*base64)/i,
  /(gopher:\/\/)/i,
  /(dict:\/\/)/i,
  /(file:\/\/)/i,
];

function matchPatterns(
  payload: string,
  patterns: RegExp[]
): { matched: boolean; pattern?: string } {
  for (const pattern of patterns) {
    if (pattern.test(payload)) {
      return { matched: true, pattern: pattern.source };
    }
  }
  return { matched: false };
}

export function analyzePayload(payload: string): AnalysisResult {
  const reasons: string[] = [];
  const attackTypes: string[] = [];
  let maxSeverity: "low" | "medium" | "high" | "critical" = "low";

  // SQL Injection
  const sqlResult = matchPatterns(payload, SQL_INJECTION_PATTERNS);
  if (sqlResult.matched) {
    reasons.push(`SQL injection pattern detected: ${sqlResult.pattern}`);
    attackTypes.push("sql_injection");
    maxSeverity = "high";
  }

  // Command Injection
  const cmdResult = matchPatterns(payload, COMMAND_INJECTION_PATTERNS);
  if (cmdResult.matched) {
    reasons.push(`Command injection pattern detected: ${cmdResult.pattern}`);
    attackTypes.push("command_injection");
    maxSeverity = "critical";
  }

  // XSS
  const xssResult = matchPatterns(payload, XSS_PATTERNS);
  if (xssResult.matched) {
    reasons.push(`XSS pattern detected: ${xssResult.pattern}`);
    attackTypes.push("xss");
    if (maxSeverity === "low") maxSeverity = "medium";
  }

  // Path Traversal
  const pathResult = matchPatterns(payload, PATH_TRAVERSAL_PATTERNS);
  if (pathResult.matched) {
    reasons.push(`Path traversal pattern detected: ${pathResult.pattern}`);
    attackTypes.push("path_traversal");
    if (maxSeverity === "low" || maxSeverity === "medium") maxSeverity = "high";
  }

  // Prompt Injection
  const promptResult = matchPatterns(payload, PROMPT_INJECTION_PATTERNS);
  if (promptResult.matched) {
    reasons.push(`Prompt injection pattern detected: ${promptResult.pattern}`);
    attackTypes.push("prompt_injection");
    if (maxSeverity === "low") maxSeverity = "medium";
  }

  // Scanner activity
  const scanResult = matchPatterns(payload, SCANNER_PATTERNS);
  if (scanResult.matched) {
    reasons.push(`Scanner/recon pattern detected: ${scanResult.pattern}`);
    attackTypes.push("scan");
    if (maxSeverity === "low") maxSeverity = "low";
  }

  // Exploit attempts
  const exploitResult = matchPatterns(payload, EXPLOIT_PATTERNS);
  if (exploitResult.matched) {
    reasons.push(`Exploit pattern detected: ${exploitResult.pattern}`);
    attackTypes.push("exploit");
    maxSeverity = "critical";
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
    severity: maxSeverity,
    attackTypes,
  };
}

// Analyze and log suspicious activity
export async function analyzeAndLogSuspicious(params: {
  payload: string;
  ipAddress: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
  connectionId?: string;
}): Promise<AnalysisResult> {
  const result = analyzePayload(params.payload);

  if (result.isSuspicious) {
    for (const attackType of result.attackTypes) {
      await logSuspiciousActivity({
        type: attackType,
        severity: result.severity,
        description: result.reasons.join("; "),
        payload: params.payload.slice(0, 5000),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        requestPath: params.requestPath,
        requestMethod: params.requestMethod,
        connectionId: params.connectionId,
      });
    }

    // Update attacker session
    await updateAttackerSession(params.ipAddress, {
      incrementSuspicious: true,
      isScanner: result.attackTypes.includes("scan"),
      isExploiter:
        result.attackTypes.includes("exploit") ||
        result.attackTypes.includes("command_injection"),
    });

    logger.warn(`Suspicious activity from ${params.ipAddress}:`, {
      types: result.attackTypes,
      severity: result.severity,
      path: params.requestPath,
    });
  }

  return result;
}

// Check if IP shows bruteforce behavior
export function checkBruteforce(
  authAttemptCount: number,
  timeWindowMs: number = 60000
): boolean {
  // More than 5 auth attempts per minute is suspicious
  return authAttemptCount > 5;
}

// Check if IP shows scanner behavior
export function checkScanner(
  requestCount: number,
  uniquePaths: number,
  timeWindowMs: number = 60000
): boolean {
  // High request count with many unique paths indicates scanning
  return requestCount > 50 && uniquePaths > 20;
}
