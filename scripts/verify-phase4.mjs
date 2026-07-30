import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyPhase4Runtime } from './phase4/runtime.mjs';
import { verifyPhase4Packaging } from './phase4/package.mjs';
import { verifyPhase4Security } from './phase4/security.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'vx-phase4-'));
try {
  await verifyPhase4Runtime(join(temporary, 'runtime'));
  await verifyPhase4Security(join(temporary, 'security'));
  await verifyPhase4Packaging(join(temporary, 'package')); 
  console.log('VX Phase 4 verification passed (components, headless modules, content, outputs, visual parts, automatic packaging, security, and cleanup).');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
