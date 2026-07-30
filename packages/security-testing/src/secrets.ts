export interface SecretFinding {
  rule: string;
  index: number;
  length: number;
  preview: string;
  confidence: 'medium' | 'high';
}

export interface SecretScanOptions {
  entropyThreshold?: number;
  minimumEntropyLength?: number;
  allow?: readonly RegExp[];
}

const rules: ReadonlyArray<{
  name: string;
  expression: RegExp;
  confidence: SecretFinding['confidence'];
}> = Object.freeze([
  {
    name: 'private-key',
    expression: new RegExp('-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', 'gu'),
    confidence: 'high'
  },
  { name: 'aws-access-key', expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu, confidence: 'high' },
  { name: 'github-token', expression: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,255}\b/gu, confidence: 'high' },
  { name: 'npm-token', expression: /\bnpm_[A-Za-z0-9]{30,255}\b/gu, confidence: 'high' },
  {
    name: 'generic-secret-assignment',
    expression: /\b(?:secret|token|password|api[_-]?key)\s*[:=]\s*["'][^"'\n]{16,}["']/giu,
    confidence: 'medium'
  }
]);

export function scanSecrets(source: string, options: SecretScanOptions = {}): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const rule of rules) {
    for (const match of source.matchAll(rule.expression)) {
      const value = match[0];
      const index = match.index ?? 0;
      if (options.allow?.some((expression) => matches(expression, value))) continue;
      findings.push({
        rule: rule.name,
        index,
        length: value.length,
        preview: redact(value),
        confidence: rule.confidence
      });
    }
  }

  const threshold = options.entropyThreshold ?? 4.2;
  const minimum = options.minimumEntropyLength ?? 32;
  for (const match of source.matchAll(/[A-Za-z0-9_\-+/=]{32,}/gu)) {
    const value = match[0];
    if (value.length < minimum || entropy(value) < threshold || /^sha(?:256|384|512)-/u.test(value)) continue;
    if (options.allow?.some((expression) => matches(expression, value))) continue;
    findings.push({
      rule: 'high-entropy-token',
      index: match.index ?? 0,
      length: value.length,
      preview: redact(value),
      confidence: 'medium'
    });
  }

  return Object.freeze(deduplicate(findings));
}

function matches(expression: RegExp, value: string): boolean { expression.lastIndex = 0; const result = expression.test(value); expression.lastIndex = 0; return result; }

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let total = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    total -= probability * Math.log2(probability);
  }
  return total;
}

function redact(value: string): string {
  return value.length <= 8 ? '*'.repeat(value.length) : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function deduplicate(findings: SecretFinding[]): SecretFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.rule}:${finding.index}:${finding.length}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
