import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

import type { VaultPath } from '../fs/path';
import { frontmatterOf } from '../parser/frontmatter';
import { parseMarkdown } from '../parser/markdown';
import { noteTitle } from './names';

export interface NoteLink {
  target: string;
  anchor?: string;
  alias?: string;
  embed: boolean;
  /** Offsets of the whole `[[...]]` in `Note.content`. */
  start: number;
  end: number;
}

export interface Note {
  path: VaultPath;
  /** File name without the extension; a `title` in the frontmatter doesn't change it. */
  title: string;
  /** Text of the file without a byte order mark; AST positions and link offsets point into it. */
  content: string;
  frontmatter: Record<string, unknown>;
  /** Set when the frontmatter is not valid YAML; `frontmatter` is empty then. */
  frontmatterError?: string;
  ast: Root;
  links: NoteLink[];
}

export function parseNote(path: VaultPath, text: string): Note {
  const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const ast = parseMarkdown(content);
  const frontmatter = frontmatterOf(ast);
  const links: NoteLink[] = [];
  visit(ast, 'wikiLink', (node) => {
    links.push({
      target: node.target,
      anchor: node.anchor,
      alias: node.alias,
      embed: node.embed,
      start: node.position?.start.offset ?? 0,
      end: node.position?.end.offset ?? 0,
    });
  });
  return {
    path,
    title: noteTitle(path),
    content,
    frontmatter: frontmatter.data,
    frontmatterError: frontmatter.error,
    ast,
    links,
  };
}
