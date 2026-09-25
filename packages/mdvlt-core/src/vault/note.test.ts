import { describe, expect, it } from 'vitest';

import { parseNote } from './note';

describe('parseNote', () => {
  const text = [
    '---',
    'title: Другой заголовок',
    'tags: [проект]',
    '---',
    '# Идея',
    '',
    'См. [[Roadmap#Фаза 1|план]] и ![[schema.png]].',
    '',
  ].join('\n');

  it('takes the title from the file name, not from the frontmatter', () => {
    const note = parseNote('Projects/Идея.md', text);
    expect(note.title).toBe('Идея');
    expect(note.frontmatter).toEqual({ title: 'Другой заголовок', tags: ['проект'] });
  });

  it('lists wiki links with offsets into the content', () => {
    const note = parseNote('Projects/Идея.md', text);
    expect(note.links).toEqual([
      expect.objectContaining({ target: 'Roadmap', anchor: 'Фаза 1', alias: 'план', embed: false }),
      expect.objectContaining({ target: 'schema.png', embed: true }),
    ]);
    expect(note.links.map((link) => note.content.slice(link.start, link.end))).toEqual([
      '[[Roadmap#Фаза 1|план]]',
      '![[schema.png]]',
    ]);
  });

  it('keeps the syntax tree', () => {
    const note = parseNote('Idea.md', text);
    expect(note.ast.type).toBe('root');
    expect(note.ast.children.map((node) => node.type)).toEqual(['yaml', 'heading', 'paragraph']);
  });

  it('drops a byte order mark so that offsets match the content', () => {
    const note = parseNote('Idea.md', '\uFEFF---\ntags: [a]\n---\n[[Link]]');
    expect(note.content.startsWith('---')).toBe(true);
    expect(note.frontmatter).toEqual({ tags: ['a'] });
    const [link] = note.links;
    expect(link && note.content.slice(link.start, link.end)).toBe('[[Link]]');
  });

  it('still reads the note when the frontmatter is broken', () => {
    const note = parseNote('Idea.md', '---\ntags: [unclosed\n---\nBody with [[Link]]');
    expect(note.frontmatter).toEqual({});
    expect(note.frontmatterError).toEqual(expect.any(String));
    expect(note.links).toEqual([expect.objectContaining({ target: 'Link' })]);
  });
});
