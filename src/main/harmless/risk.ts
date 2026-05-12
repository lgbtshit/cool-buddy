import type { AgentRiskLevel } from '../shared/types';

const ABSOLUTE_BAN_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\/(\s|$)/i,
  /\brm\s+-rf\s+\/\*/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\b.*\bof=\/dev\//i,
  /\b:\(\)\s*\{\s*:\|:&\s*};:/,
  /\b(shutdown|poweroff|halt|init 0)\b/i
];

const P0_PATTERNS: RegExp[] = [
  /\b(systemctl|service)\s+(stop|restart|reload|disable|mask)\b/i,
  /\bdocker\s+(stop|rm|rmi)\b/i,
  /\bdocker\s+compose\s+(down|rm|stop|restart)\b/i,
  /\b(killall|pkill|kill\s+-9)\b/i,
  /\b(usermod|passwd|chpasswd)\b/i,
  /\b(chown|chmod)\b.*\s\/(etc|usr|var|boot|root)\b/i,
  /\b(iptables|ufw|firewall-cmd)\b/i
];

const P1_PATTERNS: RegExp[] = [
  /\b(systemctl|service)\s+(start|enable)\b/i,
  /\b(apt|apt-get|yum|dnf|apk)\s+(install|remove|upgrade|update)\b/i,
  /\b(pip|npm|pnpm|yarn)\s+(install|remove|uninstall|add)\b/i,
  /\btee\b.*\s\/(etc|usr|var)\b/i,
  />\s*\/(etc|usr|var)\b/,
  /\bsed\b.*-i\b/i
];

const P2_PATTERNS: RegExp[] = [
  /\b(mkdir|touch|cp|mv|ln|tar|unzip)\b/i,
  /\b(rm|rmdir)\b/i,
  /\bdocker\s+(run|exec|restart|pull)\b/i
];

const P3_PATTERNS: RegExp[] = [/\b(cat|tail|head|grep|find|du|df|ps|top|ls|pwd|whoami|id)\b/i];

export type CommandRiskAssessment =
  | {
      allowed: false;
      reason: string;
    }
  | {
      allowed: true;
      riskLevel: AgentRiskLevel;
      summary: string;
    };

export function assessCommandRisk(command: string, isWhitelisted: boolean): CommandRiskAssessment {
  const normalized = command.trim();

  if (!normalized) {
    return {
      allowed: true,
      riskLevel: 'p4',
      summary: 'Empty command.'
    };
  }

  if (ABSOLUTE_BAN_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      allowed: false,
      reason: 'This command matches a permanently blocked destructive pattern.'
    };
  }

  if (isWhitelisted) {
    return {
      allowed: true,
      riskLevel: 'p4',
      summary: 'This command is covered by the whitelist and can run directly.'
    };
  }

  if (P0_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      allowed: true,
      riskLevel: 'p0',
      summary: 'High-impact operational change. Requires double confirmation.'
    };
  }

  if (P1_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      allowed: true,
      riskLevel: 'p1',
      summary: 'Dangerous write or package-management action. Requires confirmation.'
    };
  }

  if (P2_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      allowed: true,
      riskLevel: 'p2',
      summary: 'Mutable filesystem or container action. Requires confirmation.'
    };
  }

  if (P3_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      allowed: true,
      riskLevel: 'p3',
      summary: 'Low-risk operational command. Requires lightweight confirmation.'
    };
  }

  return {
    allowed: true,
    riskLevel: 'p4',
    summary: 'Read-only or normal query command.'
  };
}

export function getRiskConfirmCount(riskLevel: AgentRiskLevel): 1 | 2 {
  return riskLevel === 'p0' ? 2 : 1;
}
