import { describe, expect, it } from 'vitest';

import { LinkResolver } from './links';

describe('LinkResolver', () => {
  const resolver = new LinkResolver([
    'Idea.md',
    'Archive/Idea.md',
    'Projects/Roadmap.md',
    'Projects/mdvlt/Roadmap.md',
    'Projects/mdvlt/Идея про граф.md',
    'attachments/photo.png',
    'v1.2 release.md',
  ]);

  it.each([
    ['Idea', 'Inbox.md', 'Idea.md'],
    ['idea', 'Inbox.md', 'Idea.md'],
    ['ИДЕЯ ПРО ГРАФ', 'Inbox.md', 'Projects/mdvlt/Идея про граф.md'],
    ['Idea.md', 'Inbox.md', 'Idea.md'],
    ['photo.png', 'Inbox.md', 'attachments/photo.png'],
    ['v1.2 release', 'Inbox.md', 'v1.2 release.md'],
    ['Projects/Roadmap', 'Inbox.md', 'Projects/Roadmap.md'],
    ['mdvlt/Roadmap', 'Inbox.md', 'Projects/mdvlt/Roadmap.md'],
  ])('resolves %j from %j to %j', (target, source, expected) => {
    expect(resolver.resolve(target, source)).toBe(expected);
  });

  it('prefers the source folder, then the vault root, then the shortest path', () => {
    expect(resolver.resolve('Idea', 'Archive/2025.md')).toBe('Archive/Idea.md');
    expect(resolver.resolve('Idea', 'Projects/Plan.md')).toBe('Idea.md');
    expect(resolver.resolve('Roadmap', 'Inbox.md')).toBe('Projects/Roadmap.md');
  });

  it('resolves ./ and ../ only relative to the source note', () => {
    expect(resolver.resolve('./Idea', 'Archive/2025.md')).toBe('Archive/Idea.md');
    expect(resolver.resolve('../Idea', 'Archive/2025.md')).toBe('Idea.md');
    expect(resolver.resolve('./Roadmap', 'Inbox.md')).toBeNull();
    expect(resolver.resolve('../../Idea', 'Archive/2025.md')).toBeNull();
  });

  it('points a link without a target to the source note itself', () => {
    expect(resolver.resolve('', 'Projects/Plan.md')).toBe('Projects/Plan.md');
  });

  it('matches whole path segments only', () => {
    expect(resolver.resolve('dea', 'Inbox.md')).toBeNull();
    expect(resolver.resolve('jects/Roadmap', 'Inbox.md')).toBeNull();
    expect(resolver.resolve('Missing', 'Inbox.md')).toBeNull();
  });

  it('prefers the exact letter case when names differ only in case', () => {
    const caseSensitive = new LinkResolver(['note.md', 'Note.md']);
    expect(caseSensitive.resolve('Note', 'Inbox.md')).toBe('Note.md');
    expect(caseSensitive.resolve('note', 'Inbox.md')).toBe('note.md');
  });

  it('matches names regardless of their Unicode normalization form', () => {
    const decomposed = new LinkResolver(['Йогурт.md'.normalize('NFD')]);
    expect(decomposed.resolve('йогурт', 'Inbox.md')).toBe('Йогурт.md'.normalize('NFD'));
  });

  it('follows added and deleted files', () => {
    const changing = new LinkResolver(['Idea.md', 'Archive/Idea.md']);
    changing.delete('Idea.md');
    expect(changing.resolve('Idea', 'Inbox.md')).toBe('Archive/Idea.md');
    changing.add('Idea.md');
    expect(changing.resolve('Idea', 'Inbox.md')).toBe('Idea.md');
  });
});
