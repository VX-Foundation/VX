import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { PluginManifest } from '@vx-foundation/types';
import { canonicalPluginManifest } from './host.js';

export function signPluginManifest(manifest: PluginManifest, privateKey: string | KeyObject, signer: string): PluginManifest {
  if (!manifest.integrity) throw new TypeError(`Plugin '${manifest.name}' must include source integrity before signing.`);
  if (!signer.trim() || signer.length > 256 || /[\0\r\n]/.test(signer)) throw new TypeError('Plugin signer identity is invalid.');
  const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('VX plugin signatures require an Ed25519 private key.');
  const { signature: _signature, ...withoutSignature } = manifest;
  const unsigned: PluginManifest = { ...withoutSignature, signer, signatureAlgorithm: 'ed25519' };
  const signature = sign(null, new TextEncoder().encode(canonicalPluginManifest(unsigned)), key).toString('base64');
  return Object.freeze({ ...unsigned, signature, capabilities: Object.freeze([...unsigned.capabilities]), permissions: Object.freeze([...unsigned.permissions]) });
}
