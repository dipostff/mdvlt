import type { Root } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkWikiLink } from './wikilinks';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkGfm)
  .use(remarkWikiLink)
  .freeze();

/** Parses Markdown the way Obsidian reads it: GFM, YAML frontmatter and wiki links. */
export function parseMarkdown(text: string): Root {
  return processor.parse(text);
}
