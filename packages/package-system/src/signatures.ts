import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

export interface PackageSignature {
  algorithm: 'ed25519';
  signer: string;
  signature: string;
}

export function signPackagePayload(payload: string | Uint8Array, privateKey: string | KeyObject, signer: string): PackageSignature {
  if (!signer.trim()) throw new TypeError('VX package signatures require a signer identity.');
  const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('VX package signatures require an Ed25519 private key.');
  return { algorithm: 'ed25519', signer, signature: sign(null, bytes(payload), key).toString('base64') };
}

export function verifyPackageSignature(payload: string | Uint8Array, signature: PackageSignature, publicKey: string | KeyObject): boolean {
  if (signature.algorithm !== 'ed25519' || !signature.signer || !signature.signature) return false;
  const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
  if (key.asymmetricKeyType !== 'ed25519') return false;
  try { return verify(null, bytes(payload), key, Buffer.from(signature.signature, 'base64')); }
  catch { return false; }
}

function bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}
