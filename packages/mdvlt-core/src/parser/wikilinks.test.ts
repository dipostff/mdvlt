import type { Nodes } from 'mdast';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { parseMarkdown } from './markdown';
import { parseWikiLinkContent, type WikiLink } from './wikilinks';

function wikiLinkNodes(markdown: string): WikiLink[] {
  const found: WikiLink[] = [];
  visit(parseMarkdown(markdown), 'wikiLink', (node) => {
    found.push(node);
  });
  return found;
}

/** Wiki links of a document without their positions. */
function links(markdown: string) {
  return wikiLinkNodes(markdown).map(({ target, anchor, alias, embed }) => ({
    target,
    anchor,
    alias,
    embed,
  }));
}

/** Inline content as text, with wiki links shown as `⟦target#anchor|alias⟧`. */
function render(markdown: string): string {
  return renderNode(parseMarkdown(markdown));
}

function renderNode(node: Nodes): string {
  switch (node.type) {
    case 'wikiLink': {
      const anchor = node.anchor === undefined ? '' : `#${node.anchor}`;
      const alias = node.alias === undefined ? '' : `|${node.alias}`;
      return `${node.embed ? '!' : ''}⟦${node.target}${anchor}${alias}⟧`;
    }
    case 'text':
      return node.value;
    case 'inlineCode':
      return `\`${node.value}\``;
    case 'emphasis':
      return `*${node.children.map(renderNode).join('')}*`;
    case 'link':
      return `[${node.children.map(renderNode).join('')}](${node.url})`;
    default:
      return 'children' in node ? node.children.map(renderNode).join('') : '';
  }
}

describe('wiki links', () => {
  it.each([
    ['[[Note]]', { target: 'Note' }],
    ['[[Note|Shown text]]', { target: 'Note', alias: 'Shown text' }],
    ['[[Note#Heading]]', { target: 'Note', anchor: 'Heading' }],
    ['[[Note#Heading#Sub|Alias]]', { target: 'Note', anchor: 'Heading#Sub', alias: 'Alias' }],
    ['[[Note#^block-id]]', { target: 'Note', anchor: '^block-id' }],
    ['[[#Heading]]', { target: '', anchor: 'Heading' }],
    ['[[Projects/mdvlt/Roadmap]]', { target: 'Projects/mdvlt/Roadmap' }],
    ['[[Note.md]]', { target: 'Note.md' }],
    ['[[ Заметка про идею | псевдоним ]]', { target: 'Заметка про идею', alias: 'псевдоним' }],
    ['[[a|b|c]]', { target: 'a', alias: 'b|c' }],
    ['[[https://example.com]]', { target: 'https://example.com' }],
    ['[[_draft_ *and* `code`]]', { target: '_draft_ *and* `code`' }],
  ])('parses %j', (markdown, expected) => {
    expect(links(markdown)).toEqual([{ embed: false, ...expected }]);
  });

  it.each([
    ['![[photo.png]]', { target: 'photo.png' }],
    ['![[photo.png|300]]', { target: 'photo.png', alias: '300' }],
    ['![[Note#Heading]]', { target: 'Note', anchor: 'Heading' }],
    ['Wow![[photo.png]]', { target: 'photo.png' }],
  ])('parses the embed %j', (markdown, expected) => {
    expect(links(markdown)).toEqual([{ embed: true, ...expected }]);
  });

  it.each([
    ['[[]]'],
    ['[[ ]]'],
    ['[[|alias]]'],
    ['[[\\|alias]]'],
    ['[[#]]'],
    ['[[Note]'],
    ['[[Note\nNext]]'],
    ['[[a]b]]'],
    ['\\[[Note]]'],
    ['`[[Note]]`'],
    ['```\n[[Note]]\n```'],
    ['    [[Note]]'],
  ])('leaves %j as text', (markdown) => {
    expect(links(markdown)).toEqual([]);
  });

  it('turns an escaped embed into text followed by a link', () => {
    expect(links('\\![[photo.png]]')).toEqual([{ target: 'photo.png', embed: false }]);
  });

  it.each([
    ['[[[Note]]]', '[⟦Note⟧]'],
    ['[[a [[b]] c]]', '[[a ⟦b⟧ c]]'],
    ['[[a]][[b]]', '⟦a⟧⟦b⟧'],
    ['[[Note]]s!', '⟦Note⟧s!'],
    ['*[[Note]]* and `[[code]]`', '*⟦Note⟧* and `[[code]]`'],
    ['[[Note]](https://example.com)', '⟦Note⟧([https://example.com](https://example.com))'],
  ])('splits %j into %j', (markdown, expected) => {
    expect(render(markdown)).toBe(expected);
  });

  it('keeps a wiki link inside the text of a Markdown link', () => {
    expect(render('[see [[Note]]](https://example.com)')).toBe('[see ⟦Note⟧](https://example.com)');
  });

  it('wins over a link reference definition with the same label', () => {
    expect(render('[[note]]\n\n[note]: https://example.com')).toBe('⟦note⟧');
  });

  it('works in headings, lists, tasks and next to footnotes', () => {
    const markdown = '# About [[A]]\n\n- [ ] task with [[B]]\n\n[^1] and [[C]]\n\n[^1]: Footnote.';
    expect(links(markdown).map((link) => link.target)).toEqual(['A', 'B', 'C']);
    expect(parseMarkdown(markdown).children.map((node) => node.type)).toEqual([
      'heading',
      'list',
      'paragraph',
      'footnoteDefinition',
    ]);
  });

  it('takes the alias after an escaped pipe, which tables need', () => {
    const table = '| Link |\n| --- |\n| [[Note\\|Alias]] |';
    expect(links(table)).toEqual([{ target: 'Note', alias: 'Alias', embed: false }]);
  });

  it('is split by a bare pipe in a table, as in Obsidian', () => {
    expect(links('| Link |\n| --- |\n| [[Note|Alias]] |')).toEqual([]);
  });

  it('records the position of the whole link', () => {
    const [link] = wikiLinkNodes('Text [[Note|Alias]] more');
    expect(link?.position).toMatchObject({ start: { offset: 5 }, end: { offset: 19 } });
  });
});

describe('parseWikiLinkContent', () => {
  it('treats an escaped pipe as the alias separator and unescapes pipes in the alias', () => {
    expect(parseWikiLinkContent('Note\\|a\\|b')).toEqual({ target: 'Note', alias: 'a|b' });
  });
});
