import { createInterface } from 'node:readline/promises';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';

export interface InteractivePromptOptions {
  name?: string;
  template?: string;
  packageManager?: string;
  overwrite?: boolean;
  yes?: boolean;
}

export interface PromptResult {
  name: string;
  template: 'basic' | 'starter' | 'fullstack' | 'library';
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
  overwrite: boolean;
}

export const TEMPLATE_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  basic: { label: 'Basic', desc: 'Minimal setup with direct DOM lowering and reactive state' },
  starter: { label: 'Starter', desc: 'Components, visual system, data bindings & file routing' },
  fullstack: { label: 'Fullstack', desc: 'API endpoints, server actions, SSR & realtime data' },
  library: { label: 'Library', desc: 'Reusable VX component and primitive library' }
};

export async function promptScaffoldOptions(
  inputName?: string,
  options: InteractivePromptOptions = {}
): Promise<PromptResult> {
  const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY) && !options.yes;
  const detectedPm = detectPackageManager();

  if (!isTTY) {
    const finalName = sanitizeProjectName(inputName || options.name || 'vx-project');
    const finalTemplate = validateTemplate(options.template || 'basic');
    const finalPm = validatePackageManager(options.packageManager || detectedPm);
    return {
      name: finalName,
      template: finalTemplate,
      packageManager: finalPm,
      overwrite: options.overwrite ?? true
    };
  }

  console.log(pc.bold(pc.cyan('\n  ┌  VX Framework Scaffolding\n  │')));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // 1. Project Name Prompt
    let projectName = inputName || options.name;
    if (!projectName) {
      const answer = await rl.question(pc.cyan('  ? ') + pc.bold('Project name: ') + pc.dim('(my-vx-app) '));
      projectName = answer.trim() || 'my-vx-app';
    }
    projectName = sanitizeProjectName(projectName);

    // 2. Directory Conflict Check
    const targetDir = resolve(process.cwd(), projectName);
    let overwrite = options.overwrite ?? false;
    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
      if (!options.overwrite) {
        const answer = await rl.question(
          pc.yellow('  ! ') + pc.bold(`Target directory "${projectName}" is not empty. Overwrite existing files? `) + pc.dim('(y/N) ')
        );
        overwrite = answer.trim().toLowerCase() === 'y';
      }
    }

    // 3. Template Selection Prompt
    let template: 'basic' | 'starter' | 'fullstack' | 'library' = validateTemplate(options.template || '');
    if (!options.template) {
      console.log(pc.cyan('\n  ? ') + pc.bold('Select a project template:'));
      const keys: Array<'basic' | 'starter' | 'fullstack' | 'library'> = ['basic', 'starter', 'fullstack', 'library'];
      keys.forEach((key, index) => {
        const item = TEMPLATE_DESCRIPTIONS[key]!;
        console.log(`    ${pc.cyan(String(index + 1))}) ${pc.bold(item.label.padEnd(10))} - ${pc.dim(item.desc)}`);
      });
      const choice = await rl.question(pc.cyan('    Choice ') + pc.dim('(1-4, default 1): '));
      const parsedChoice = Number.parseInt(choice.trim(), 10);
      if (parsedChoice >= 1 && parsedChoice <= 4) {
        template = keys[parsedChoice - 1]!;
      } else {
        template = 'basic';
      }
    }

    // 4. Package Manager Selection Prompt
    let pm: 'pnpm' | 'npm' | 'yarn' | 'bun' = validatePackageManager(options.packageManager || '');
    if (!options.packageManager) {
      console.log(pc.cyan('\n  ? ') + pc.bold('Select package manager:'));
      const pmList: Array<'pnpm' | 'npm' | 'yarn' | 'bun'> = ['pnpm', 'npm', 'yarn', 'bun'];
      pmList.forEach((item, index) => {
        const isDetected = item === detectedPm;
        const tag = isDetected ? pc.green(' (detected)') : '';
        console.log(`    ${pc.cyan(String(index + 1))}) ${pc.bold(item)}${tag}`);
      });
      const choice = await rl.question(pc.cyan('    Choice ') + pc.dim(`(1-4, default ${pmList.indexOf(detectedPm) + 1}): `));
      const parsedChoice = Number.parseInt(choice.trim(), 10);
      if (parsedChoice >= 1 && parsedChoice <= 4) {
        pm = pmList[parsedChoice - 1]!;
      } else {
        pm = detectedPm;
      }
    }

    console.log(pc.cyan('  └\n'));

    return {
      name: projectName,
      template,
      packageManager: pm,
      overwrite
    };
  } finally {
    rl.close();
  }
}

export function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' | 'bun' {
  const userAgent = process.env['npm_config_user_agent'] || '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  if (userAgent.startsWith('npm')) return 'npm';
  return 'pnpm';
}

function sanitizeProjectName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.trim().replace(/[<>:"|?*\u0000-\u001f]/g, '').replace(/\s+/g, '-').toLowerCase() || 'vx-project';
}

function validateTemplate(template: string): 'basic' | 'starter' | 'fullstack' | 'library' {
  const normalized = template.toLowerCase().trim();
  if (normalized === 'starter' || normalized === 'fullstack' || normalized === 'library') {
    return normalized;
  }
  return 'basic';
}

function validatePackageManager(pm: string): 'pnpm' | 'npm' | 'yarn' | 'bun' {
  const normalized = pm.toLowerCase().trim();
  if (normalized === 'npm' || normalized === 'yarn' || normalized === 'bun') {
    return normalized;
  }
  return 'pnpm';
}
