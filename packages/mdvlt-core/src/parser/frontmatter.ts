import type { Root } from 'mdast';
import { parseDocument } from 'yaml';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  /** Why the YAML was rejected; `data` is empty then. */
  error?: string;
}

/**
 * Parses the YAML between the `---` fences. Never throws: a broken header must not make the
 * note unreadable. Dates stay strings (`created: 2026-09-24` → `'2026-09-24'`).
 */
export function parseFrontmatter(yaml: string): ParsedFrontmatter {
  const document = parseDocument(yaml);
  const [error] = document.errors;
  if (error) return { data: {}, error: error.message };

  let data: unknown;
  try {
    data = document.toJS();
  } catch (toJsError) {
    // Thrown for alias bombs, among others.
    return { data: {}, error: toJsError instanceof Error ? toJsError.message : 'Invalid YAML' };
  }
  if (data === null || data === undefined) return { data: {} };
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { data: {}, error: 'Frontmatter must consist of "key: value" pairs' };
  }
  return { data: data as Record<string, unknown> };
}

/** Frontmatter of a tree from `parseMarkdown`, which puts it first. */
export function frontmatterOf(ast: Root): ParsedFrontmatter {
  const first = ast.children[0];
  return first?.type === 'yaml' ? parseFrontmatter(first.value) : { data: {} };
}
