import { describe, expect, it } from 'vitest';

import { joinVaultPath, normalizeVaultPath, parentPath } from './path';

describe('normalizeVaultPath', () => {
  it.each([
    ['Notes/Idea.md', 'Notes/Idea.md'],
    ['/Notes/Idea.md/', 'Notes/Idea.md'],
    ['Notes//./Idea.md', 'Notes/Idea.md'],
    ['Notes\\Idea.md', 'Notes/Idea.md'],
    ['Notes/Drafts/../Idea.md', 'Notes/Idea.md'],
    ['Заметки/Идея.md', 'Заметки/Идея.md'],
    ['', ''],
    ['/', ''],
    ['.', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeVaultPath(input)).toBe(expected);
  });

  it.each(['..', '../Idea.md', 'Notes/../../Idea.md', '..\\Idea.md', 'Idea\0.md'])(
    'rejects %j with EINVAL',
    (input) => {
      expect(() => normalizeVaultPath(input)).toThrow(
        expect.objectContaining({ name: 'FsError', code: 'EINVAL' }),
      );
    },
  );
});

describe('joinVaultPath', () => {
  it('joins and normalizes the parts', () => {
    expect(joinVaultPath('', 'Notes', 'Idea.md')).toBe('Notes/Idea.md');
    expect(joinVaultPath('Notes/', '/Idea.md')).toBe('Notes/Idea.md');
  });
});

describe('parentPath', () => {
  it.each([
    ['Notes/Drafts/Idea.md', 'Notes/Drafts'],
    ['Idea.md', ''],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(parentPath(input)).toBe(expected);
  });
});
