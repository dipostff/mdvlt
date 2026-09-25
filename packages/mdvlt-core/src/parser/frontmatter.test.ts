import { describe, expect, it } from 'vitest';

import { frontmatterOf, parseFrontmatter } from './frontmatter';
import { parseMarkdown } from './markdown';

describe('parseFrontmatter', () => {
  it('reads a mapping with lists and nested values', () => {
    const yaml = 'title: Моя заметка\ntags: [проект, идея]\nrating: 5\nsource:\n  url: https://x.y';
    expect(parseFrontmatter(yaml)).toEqual({
      data: {
        title: 'Моя заметка',
        tags: ['проект', 'идея'],
        rating: 5,
        source: { url: 'https://x.y' },
      },
    });
  });

  it('keeps dates as written', () => {
    expect(parseFrontmatter('created: 2026-09-24').data).toEqual({ created: '2026-09-24' });
  });

  it.each(['', '# only a comment', '~'])('reads %j as empty', (yaml) => {
    expect(parseFrontmatter(yaml)).toEqual({ data: {} });
  });

  it.each([
    ['broken YAML', 'tags: [unclosed'],
    ['duplicate keys', 'a: 1\na: 2'],
    ['a list', '- a\n- b'],
    ['a scalar', 'just text'],
  ])('rejects %s without throwing', (_, yaml) => {
    const result = parseFrontmatter(yaml);
    expect(result.data).toEqual({});
    expect(result.error).toEqual(expect.any(String));
  });
});

describe('frontmatterOf', () => {
  const frontmatter = (markdown: string) => frontmatterOf(parseMarkdown(markdown)).data;

  it('reads the block at the very start of the note', () => {
    expect(frontmatter('---\ntags: [a]\n---\n# Heading')).toEqual({ tags: ['a'] });
  });

  it('accepts Windows line endings', () => {
    expect(frontmatter('---\r\ntags: [a]\r\n---\r\nText')).toEqual({ tags: ['a'] });
  });

  it.each([
    ['not at the start', 'Text\n\n---\ntags: [a]\n---'],
    ['not closed', '---\ntags: [a]\n\nText'],
  ])('ignores a block %s', (_, markdown) => {
    expect(frontmatter(markdown)).toEqual({});
  });

  it.each(['---\ntitle: A\n---\nText', '---\n---\nText'])(
    'does not let %j turn into a heading or a thematic break',
    (markdown) => {
      expect(parseMarkdown(markdown).children.map((node) => node.type)).toEqual([
        'yaml',
        'paragraph',
      ]);
    },
  );
});
