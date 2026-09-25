import { describe, expect, it } from 'vitest';

import { foldName, isNotePath, noteNameProblem, noteTitle } from './names';

describe('noteTitle', () => {
  it.each([
    ['Projects/Идея.md', 'Идея'],
    ['v1.2 release.md', 'v1.2 release'],
    ['README.MD', 'README'],
    ['attachments/photo.png', 'photo.png'],
  ])('%j → %j', (path, title) => {
    expect(noteTitle(path)).toBe(title);
  });
});

describe('isNotePath', () => {
  it('recognizes Markdown files regardless of the extension case', () => {
    expect(isNotePath('Notes/a.md')).toBe(true);
    expect(isNotePath('a.MD')).toBe(true);
    expect(isNotePath('photo.png')).toBe(false);
    expect(isNotePath('md')).toBe(false);
  });
});

describe('foldName', () => {
  it('ignores letter case and Unicode normalization form', () => {
    expect(foldName('Йогурт'.normalize('NFD'))).toBe(foldName('йогурт'));
  });
});

describe('noteNameProblem', () => {
  it.each(['Идея', 'Meeting 2026-09-24', 'v1.2 release', 'C++ & Rust', '  leading spaces'])(
    'accepts %j',
    (title) => {
      expect(noteNameProblem(title)).toBeNull();
    },
  );

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['a/b', 'forbidden-character'],
    ['a\\b', 'forbidden-character'],
    ['Why?', 'forbidden-character'],
    ['C# notes', 'forbidden-character'],
    ['[[link]]', 'forbidden-character'],
    ['a|b', 'forbidden-character'],
    ['tab\there', 'forbidden-character'],
    ['.hidden', 'leading-dot'],
    ['ends with dot.', 'trailing-dot-or-space'],
    ['ends with space ', 'trailing-dot-or-space'],
    ['CON', 'reserved'],
    ['nul.backup', 'reserved'],
    ['lpt1', 'reserved'],
    ['я'.repeat(127), 'too-long'],
  ])('rejects %j as %s', (title, problem) => {
    expect(noteNameProblem(title)).toBe(problem);
  });

  it('counts the length limit in UTF-8 bytes, extension included', () => {
    expect(noteNameProblem('я'.repeat(126))).toBeNull();
    expect(noteNameProblem('a'.repeat(252))).toBeNull();
    expect(noteNameProblem('a'.repeat(253))).toBe('too-long');
  });
});
