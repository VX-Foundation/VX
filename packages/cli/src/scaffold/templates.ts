export const PROJECT_TEMPLATES = ['basic', 'starter', 'fullstack', 'library'] as const;

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number];

export interface TemplateDescriptor {
  name: ProjectTemplate;
  library: boolean;
  description: string;
  requiredFiles: readonly string[];
}

const DESCRIPTORS: Readonly<Record<ProjectTemplate, TemplateDescriptor>> = Object.freeze({
  basic: Object.freeze({
    name: 'basic',
    library: false,
    description: 'Minimal client and server rendered VX application.',
    requiredFiles: Object.freeze(['package.json', 'vx.config.ts', 'tsconfig.json', 'public/vx.svg', 'src/pages/page.vx'])
  }),
  starter: Object.freeze({
    name: 'starter',
    library: false,
    description: 'Multi-route VX starter with layout, tests, and an endpoint.',
    requiredFiles: Object.freeze([
      'package.json',
      'vx.config.ts',
      'tsconfig.json',
      'public/vx.svg',
      'src/pages/layout.vx',
      'src/pages/page.vx',
      'src/pages/about/page.vx',
      'src/pages/api/health/endpoint.ts'
    ])
  }),
  fullstack: Object.freeze({
    name: 'fullstack',
    library: false,
    description: 'Server-rendered VX application with actions, endpoint, and deployment configuration.',
    requiredFiles: Object.freeze([
      'package.json',
      'vx.config.ts',
      'tsconfig.json',
      'public/vx.svg',
      'src/pages/layout.vx',
      'src/pages/page.vx',
      'src/pages/route.json',
      'src/pages/api/health/endpoint.ts'
    ])
  }),
  library: Object.freeze({
    name: 'library',
    library: true,
    description: 'Convention-based VX component library.',
    requiredFiles: Object.freeze([
      'package.json',
      'vx.config.ts',
      'tsconfig.json',
      'public/vx.svg',
      'src/components/Card.vx',
      'src/modules/labels.vx'
    ])
  })
});

export function resolveTemplate(value: string, library = false): TemplateDescriptor {
  const requested = library ? 'library' : value;
  if (!isProjectTemplate(requested)) {
    throw new Error(`Unknown VX template '${requested}'. Expected one of: ${PROJECT_TEMPLATES.join(', ')}.`);
  }
  return DESCRIPTORS[requested];
}

export function templateDescriptor(name: ProjectTemplate): TemplateDescriptor {
  return DESCRIPTORS[name];
}

export function isProjectTemplate(value: string): value is ProjectTemplate {
  return (PROJECT_TEMPLATES as readonly string[]).includes(value);
}
