export interface MigrationChange {
  code: string;
  message: string;
  line: number;
}

export interface MigrationResult {
  code: string;
  changed: boolean;
  changes: MigrationChange[];
  manual: MigrationChange[];
}

interface LegacyScriptRegion {
  marker: '#data' | '#state' | '#logic';
  start: number;
  end: number;
  lines: string[];
}

const LEGACY_SCRIPT_STARTS = new Set<LegacyScriptRegion['marker']>(['#data', '#state', '#logic']);

/**
 * Migrates only deterministic legacy region markers. Multiple legacy data,
 * state, and logic regions are merged into one script block without creating
 * duplicate top-level regions. Ambiguous existing-script, HTML, and style
 * cases are reported for manual conversion instead of being guessed.
 */
export function migrateVXSource(source: string): MigrationResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const changes: MigrationChange[] = [];
  const manual: MigrationChange[] = [];
  const regions = collectLegacyScriptRegions(lines, manual);
  const existingScript = lines.some((line) => line.trim() === '#script');
  const canMergeScript = regions.length > 0 && !existingScript && !manual.some((item) => item.code === 'VX_MIGRATION_SCRIPT_REGION_INVALID');

  if (existingScript && regions.length > 0) {
    manual.push({
      code: 'VX_MIGRATION_SCRIPT_CONFLICT',
      message: 'Legacy data/state/logic regions cannot be merged automatically because the file already contains #script.',
      line: regions[0]!.start + 1
    });
  }

  const skipped = new Set<number>();
  const scriptInsertion = canMergeScript ? buildMergedScript(lines, regions, changes, skipped) : undefined;
  const output: string[] = [];
  let viewOpen = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (scriptInsertion && index === scriptInsertion.index) {
      output.push(...scriptInsertion.lines);
      continue;
    }
    if (skipped.has(index)) continue;

    const line = lines[index]!;
    const trimmed = line.trim();
    const lineNumber = index + 1;
    if (trimmed === '#template') {
      viewOpen = true;
      changes.push({ code: 'VX_MIGRATION_VIEW_REGION', message: 'Converted #template to #view.', line: lineNumber });
      output.push(line.replace(trimmed, '#view'));
      continue;
    }
    if (trimmed === '#end template') {
      viewOpen = false;
      changes.push({ code: 'VX_MIGRATION_VIEW_END', message: 'Converted #end template to #end view.', line: lineNumber });
      output.push(line.replace(trimmed, '#end view'));
      continue;
    }
    if (trimmed === '#view') viewOpen = true;
    if (trimmed === '#end view') viewOpen = false;
    if (trimmed === '#style' || trimmed === '#end style') {
      manual.push({
        code: 'VX_MIGRATION_VISUAL_ROLES_REQUIRED',
        message: 'Legacy style regions require manual conversion to compiler-owned visual roles.',
        line: lineNumber
      });
    }
    if (viewOpen && /<\/?[A-Za-z]/.test(trimmed)) {
      manual.push({
        code: 'VX_MIGRATION_HTML_REQUIRED',
        message: 'Legacy HTML templates require manual conversion to VX widget syntax.',
        line: lineNumber
      });
    }
    output.push(line);
  }

  const code = output.join('\n');
  return { code, changed: code !== source, changes, manual: dedupeManual(manual) };
}

function collectLegacyScriptRegions(lines: readonly string[], manual: MigrationChange[]): LegacyScriptRegion[] {
  const regions: LegacyScriptRegion[] = [];
  let active: { marker: LegacyScriptRegion['marker']; start: number; lines: string[] } | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index]!.trim();
    if (LEGACY_SCRIPT_STARTS.has(marker as LegacyScriptRegion['marker'])) {
      if (active) {
        manual.push({
          code: 'VX_MIGRATION_SCRIPT_REGION_INVALID',
          message: `Nested legacy script region ${marker} cannot be migrated automatically.`,
          line: index + 1
        });
      } else {
        active = { marker: marker as LegacyScriptRegion['marker'], start: index, lines: [] };
      }
      continue;
    }
    if (marker === '#end data' || marker === '#end state' || marker === '#end logic') {
      if (!active || marker !== `#end ${active.marker.slice(1)}`) {
        manual.push({
          code: 'VX_MIGRATION_SCRIPT_REGION_INVALID',
          message: `Unmatched legacy script marker ${marker} cannot be migrated automatically.`,
          line: index + 1
        });
      } else {
        regions.push({ marker: active.marker, start: active.start, end: index, lines: active.lines });
        active = undefined;
      }
      continue;
    }
    if (active) active.lines.push(lines[index]!);
  }

  if (active) {
    manual.push({
      code: 'VX_MIGRATION_SCRIPT_REGION_INVALID',
      message: `Legacy script region ${active.marker} is not closed.`,
      line: active.start + 1
    });
  }
  return regions;
}

function buildMergedScript(
  sourceLines: readonly string[],
  regions: readonly LegacyScriptRegion[],
  changes: MigrationChange[],
  skipped: Set<number>
): { index: number; lines: string[] } {
  const first = regions[0]!;
  const indentation = sourceLines[first.start]!.slice(0, sourceLines[first.start]!.indexOf(sourceLines[first.start]!.trim()));
  const body: string[] = [];

  for (const [regionIndex, region] of regions.entries()) {
    for (let index = region.start; index <= region.end; index += 1) skipped.add(index);
    if (regionIndex > 0 && body.length > 0 && body.at(-1) !== '' && region.lines[0] !== '') body.push('');
    body.push(...region.lines);
    changes.push({
      code: regionIndex === 0 ? 'VX_MIGRATION_SCRIPT_REGION' : 'VX_MIGRATION_MERGED_SCRIPT_REGION',
      message: regionIndex === 0
        ? `Converted ${region.marker} to the canonical #script region.`
        : `Merged ${region.marker} into the canonical #script region.`,
      line: region.start + 1
    });
    changes.push({
      code: 'VX_MIGRATION_SCRIPT_END',
      message: `Removed #end ${region.marker.slice(1)} after merging the legacy region.`,
      line: region.end + 1
    });
  }

  while (body[0] === '') body.shift();
  while (body.at(-1) === '') body.pop();
  return { index: first.start, lines: [`${indentation}#script`, ...body, `${indentation}#end script`] };
}

function dedupeManual(items: readonly MigrationChange[]): MigrationChange[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}:${item.line}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
