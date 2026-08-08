function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashContent(content: string, length = 8): string {
  if (length <= 0) {
    throw new RangeError('Hash length must be at least one character.');
  }

  try {
    const modName = ['node', 'crypto'].join(':');
    const getReq = new Function('m', 'return typeof require !== "undefined" ? require(m) : null');
    const cryptoModule = typeof process !== 'undefined' && process.versions?.node ? getReq(modName) : null;
    if (cryptoModule && typeof cryptoModule.createHash === 'function') {
      return cryptoModule.createHash('sha256').update(content).digest('hex').slice(0, length);
    }
  } catch {
    // Browser fallback
  }

  return fnv1a(content).repeat(Math.ceil(length / 8)).slice(0, length);
}
