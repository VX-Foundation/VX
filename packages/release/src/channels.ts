import type { ReleaseChannel, ReleaseChannelPlan } from './types.js';
import { parseVersion } from './semver.js';

export interface CreateReleasePlanOptions {
  channel: ReleaseChannel;
  baseVersion: string;
  sequence?: number;
  revision?: string;
}

export function createReleaseChannelPlan(options: CreateReleasePlanOptions): ReleaseChannelPlan {
  const parsed = parseVersion(options.baseVersion);
  if (!parsed) throw new TypeError(`Invalid release version '${options.baseVersion}'.`);
  if (options.channel === 'stable') {
    if (parsed.prerelease) throw new TypeError('Stable releases cannot use a prerelease version.');
    return { channel: 'stable', npmTag: 'latest', version: options.baseVersion, provenanceRequired: true, compatibilityRequired: true };
  }
  const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  if (options.channel === 'next') {
    const sequence = positiveSequence(options.sequence);
    return { channel: 'next', npmTag: 'next', version: `${core}-next.${sequence}`, provenanceRequired: true, compatibilityRequired: true };
  }
  const revision = normalizeRevision(options.revision);
  const sequence = positiveSequence(options.sequence);
  return { channel: 'canary', npmTag: 'canary', version: `${core}-canary.${revision}.${sequence}`, provenanceRequired: true, compatibilityRequired: false };
}

function positiveSequence(value: number | undefined): number {
  const sequence = value ?? 0;
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError('Release sequence must be a non-negative safe integer.');
  return sequence;
}

function normalizeRevision(value: string | undefined): string {
  const revision = (value ?? 'local').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  if (!revision) throw new TypeError('Canary release revision must contain letters or numbers.');
  return revision;
}
