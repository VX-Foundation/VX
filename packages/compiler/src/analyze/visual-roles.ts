import type { ViewBlockNode, ViewNode, VisualRoleUseNode, WidgetNode } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';
import { STRUCTURAL_ROLE_NAMES } from '../visual/catalog.js';
import { PRIMITIVE_SOURCES } from '@vx/widgets';

const CONTAINER_WIDGETS = new Set(['View', 'List', 'ScrollView', 'Form']);
const INTERACTIVE_WIDGETS = new Set(['Button', 'Input', 'TextArea', 'Select', 'Checkbox', 'Radio', 'Slider', 'Switch', 'Link']);
const INTERACTIVE_ROLES = new Set(['primary', 'secondary', 'link', 'field']);
const TEXT_ROLES = new Set(['title', 'subtitle', 'body', 'muted', 'metadata', 'price', 'code']);

/** Validates grammar-independent invariants of compiler-owned visual intent. */
export function validateVisualRoles(view: ViewBlockNode, diagnostics: DiagnosticCollector): void {
  const localRoles = new Set<string>();

  for (const role of view.roles) {
    if (STRUCTURAL_ROLE_NAMES.has(role.name)) {
      diagnostics.error(
        'VX_VISUAL_RESERVED_ROLE',
        `Local role '@${role.name}' cannot redefine a compiler-owned structural capability.`,
        role.span,
        `Choose a semantic name and attach it together with '@${role.name}'.`
      );
    }

    if (localRoles.has(role.name)) {
      diagnostics.error('VX_VISUAL_DUPLICATE_ROLE', `Local visual role '@${role.name}' is declared more than once.`, role.span);
    }
    localRoles.add(role.name);

    validateUniqueNames(role.uses.map((name) => ({ name, span: role.span })), `composed role in '@${role.name}'`, diagnostics);
    validateUniqueNames(
      role.properties.map((property) => ({ name: property.name, span: property.span })),
      `property in '@${role.name}'`,
      diagnostics
    );

    const stateNames = new Set<string>();
    for (const state of role.states) {
      const stateKey = `${state.condition.name}:${state.condition.arguments.map((argument) => `${argument.name ?? ''}=${argument.expression.text}`).join(',')}`;
      if (stateNames.has(stateKey)) {
        diagnostics.error(
          'VX_VISUAL_DUPLICATE_STATE',
          `Visual condition '${state.condition.name}' is declared more than once in '@${role.name}'.`,
          state.span
        );
      }
      stateNames.add(stateKey);
      validateUniqueNames(
        state.condition.arguments.filter((argument) => argument.name).map((argument) => ({ name: argument.name!, span: argument.span })),
        `argument in condition '${state.condition.name}'`,
        diagnostics
      );
      validateUniqueNames(
        state.properties.map((property) => ({ name: property.name, span: property.span })),
        `property in condition '${state.condition.name}' of '@${role.name}'`,
        diagnostics
      );
    }
  }

  const walk = (node: ViewNode): void => {
    if (node.kind === 'Widget') {
      validateWidgetRoles(node, diagnostics);
      node.children.forEach(walk);
      for (const region of node.contentRegions) region.children.forEach(walk);
      for (const binding of node.partBindings) validateRoleList(binding.roles, `visual part '${binding.name}'`, diagnostics);
      return;
    }
    if (node.kind === 'IfBlock') {
      node.branches.forEach((branch) => branch.children.forEach(walk));
      return;
    }
    if (node.kind === 'WhenBlock') {
      node.branches.forEach((branch) => branch.children.forEach(walk));
      node.fallback?.forEach(walk);
      return;
    }
    if (node.kind === 'KeyedCollection') {
      node.children.forEach(walk);
      node.fallbacks.forEach((branch) => branch.children.forEach(walk));
    }
  };

  view.children.forEach(walk);
}

function validateWidgetRoles(widget: WidgetNode, diagnostics: DiagnosticCollector): void {
  const roles = widget.roles;
  let structuralCount = 0;
  let semanticCount = 0;
  const seen = new Set<string>();

  for (const role of roles) {
    if (seen.has(role.name)) {
      diagnostics.error('VX_VISUAL_DUPLICATE_USE', `Role '@${role.name}' is attached to the same widget more than once.`, role.span);
    }
    seen.add(role.name);

    if (STRUCTURAL_ROLE_NAMES.has(role.name)) structuralCount += 1;
    else semanticCount += 1;

    validateUniqueNames(
      role.arguments.map((argument) => ({ name: argument.name, span: argument.span })),
      `argument of '@${role.name}'`,
      diagnostics
    );

    if (widget.tagName in PRIMITIVE_SOURCES && STRUCTURAL_ROLE_NAMES.has(role.name) && !CONTAINER_WIDGETS.has(widget.tagName)) {
      diagnostics.error(
        'VX_VISUAL_LAYOUT_ON_LEAF',
        `Structural capability '@${role.name}' cannot be attached to leaf widget '${widget.tagName}'.`,
        role.span,
        'Attach layout intent to a container such as View or ScrollView.'
      );
    }

    if (widget.tagName in PRIMITIVE_SOURCES && INTERACTIVE_ROLES.has(role.name) && !INTERACTIVE_WIDGETS.has(widget.tagName)) {
      diagnostics.warning(
        'VX_VISUAL_INTERACTIVE_ROLE_MISMATCH',
        `Semantic role '@${role.name}' is normally interactive, but '${widget.tagName}' is not an interactive primitive.`,
        role.span
      );
    }

    if (widget.tagName in PRIMITIVE_SOURCES && TEXT_ROLES.has(role.name) && !['Text', 'Title', 'Link', 'Button'].includes(widget.tagName)) {
      diagnostics.warning(
        'VX_VISUAL_TEXT_ROLE_MISMATCH',
        `Text role '@${role.name}' is attached to '${widget.tagName}'.`,
        role.span,
        'Use a textual primitive unless the component explicitly exposes textual semantics.'
      );
    }
  }

  if (structuralCount > 1) {
    diagnostics.error(
      'VX_VISUAL_MULTIPLE_STRUCTURAL_ROLES',
      'A widget may use at most one structural capability.',
      roles.find((role) => STRUCTURAL_ROLE_NAMES.has(role.name))?.span ?? roles[0]!.span,
      'Compose structural behavior through one capability with typed parameters.'
    );
  }

  if (semanticCount > 1) {
    diagnostics.error(
      'VX_VISUAL_MULTIPLE_SEMANTIC_ROLES',
      'A widget may use at most one semantic role.',
      roles.find((role) => !STRUCTURAL_ROLE_NAMES.has(role.name))?.span ?? roles[0]!.span,
      'Create one meaningful semantic role instead of a utility-style role list.'
    );
  }
}

function validateRoleList(
  roles: VisualRoleUseNode[],
  owner: string,
  diagnostics: DiagnosticCollector
): void {
  let structural = 0;
  let semantic = 0;
  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.name)) {
      diagnostics.error('VX_VISUAL_DUPLICATE_USE', `Role '@${role.name}' is attached to ${owner} more than once.`, role.span);
    }
    seen.add(role.name);
    if (STRUCTURAL_ROLE_NAMES.has(role.name)) structural += 1;
    else semantic += 1;
    validateUniqueNames(
      role.arguments.map((argument) => ({ name: argument.name, span: argument.span })),
      `argument of '@${role.name}'`,
      diagnostics
    );
  }
  if (structural > 1) {
    diagnostics.error('VX_VISUAL_MULTIPLE_STRUCTURAL_ROLES', `${owner} may use at most one structural capability.`, roles[0]!.span);
  }
  if (semantic > 1) {
    diagnostics.error('VX_VISUAL_MULTIPLE_SEMANTIC_ROLES', `${owner} may use at most one semantic role.`, roles[0]!.span);
  }
}

function validateUniqueNames(
  entries: Array<{ name: string; span: VisualRoleUseNode['span'] }>,
  label: string,
  diagnostics: DiagnosticCollector
): void {
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) diagnostics.error('VX_VISUAL_DUPLICATE_MEMBER', `Duplicate ${label} '${entry.name}'.`, entry.span);
    names.add(entry.name);
  }
}
