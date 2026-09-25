import { describe, expect, it } from 'vitest';

import { MemoryFileSystemAdapter } from '../fs/memory-adapter';
import type { VaultPath } from '../fs/path';
import { Vault } from './vault';

function vaultWith(files: Record<string, string>) {
  const adapter = new MemoryFileSystemAdapter(files);
  return { adapter, vault: new Vault(adapter) };
}

describe('Vault', () => {
  describe('listEntries', () => {
    it('lists files and folders recursively, sorted, without hidden entries', async () => {
      const { vault } = vaultWith({
        'Projects/mdvlt/Roadmap.md': '',
        'Inbox.md': '',
        'attachments/photo.png': '',
        '.git/HEAD': '',
        '.obsidian/app.json': '',
        'Projects/.draft.md': '',
      });
      expect((await vault.listEntries()).map((entry) => `${entry.type} ${entry.path}`)).toEqual([
        'file Inbox.md',
        'folder Projects',
        'folder Projects/mdvlt',
        'file Projects/mdvlt/Roadmap.md',
        'folder attachments',
        'file attachments/photo.png',
      ]);
    });

    it('skips folders that disappear while it walks the vault', async () => {
      class VanishingFolder extends MemoryFileSystemAdapter {
        override async list(folder: VaultPath) {
          const entries = await super.list(folder);
          if (folder === '') await this.deleteFolder('Gone', { recursive: true });
          return entries;
        }
      }
      const vault = new Vault(new VanishingFolder({ 'Gone/a.md': '', 'Kept.md': '' }));
      expect((await vault.listEntries()).map((entry) => entry.path)).toEqual(['Gone', 'Kept.md']);
    });
  });

  it('lists only Markdown files as notes', async () => {
    const { vault } = vaultWith({ 'a.md': '', 'B.MD': '', 'photo.png': '', 'Folder/c.md': '' });
    expect((await vault.listNotes()).map((note) => note.path)).toEqual([
      'B.MD',
      'Folder/c.md',
      'a.md',
    ]);
  });

  it('reads and parses a note', async () => {
    const { vault } = vaultWith({ 'Projects/Idea.md': '---\ntags: [a]\n---\nSee [[Roadmap]]' });
    const note = await vault.readNote('/Projects//Idea.md');
    expect(note).toMatchObject({
      path: 'Projects/Idea.md',
      title: 'Idea',
      frontmatter: { tags: ['a'] },
    });
    expect(note.links).toEqual([expect.objectContaining({ target: 'Roadmap' })]);
  });

  it('saves a note', async () => {
    const { adapter, vault } = vaultWith({ 'Idea.md': 'old' });
    await vault.saveNote('Idea.md', 'new');
    expect(await adapter.readFile('Idea.md')).toBe('new');
  });

  describe('createNote', () => {
    it('creates a note, with its folder if needed', async () => {
      const { adapter, vault } = vaultWith({});
      expect(await vault.createNote('Projects/mdvlt', 'Идея', '# Идея')).toBe(
        'Projects/mdvlt/Идея.md',
      );
      expect(await adapter.readFile('Projects/mdvlt/Идея.md')).toBe('# Идея');
    });

    it('refuses a name that is taken in any letter case', async () => {
      const { adapter, vault } = vaultWith({ 'Projects/idea.md': 'keep me' });
      await expect(vault.createNote('Projects', 'Idea')).rejects.toMatchObject({
        code: 'EEXIST',
        path: 'Projects/idea.md',
      });
      await expect(vault.createNote('Projects', 'idea')).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await adapter.readFile('Projects/idea.md')).toBe('keep me');
    });

    it('refuses names that are not portable', async () => {
      const { vault } = vaultWith({});
      await expect(vault.createNote('', 'What?')).rejects.toMatchObject({
        name: 'InvalidNoteNameError',
        problem: 'forbidden-character',
      });
    });
  });

  describe('renameNote', () => {
    it('renames a note within its folder', async () => {
      const { adapter, vault } = vaultWith({ 'Projects/Idea.md': 'content' });
      expect(await vault.renameNote('Projects/Idea.md', 'Plan')).toBe('Projects/Plan.md');
      expect(await adapter.exists('Projects/Idea.md')).toBe(false);
      expect(await adapter.readFile('Projects/Plan.md')).toBe('content');
    });

    it('changes only the letter case', async () => {
      const { adapter, vault } = vaultWith({ 'idea.md': 'content' });
      expect(await vault.renameNote('idea.md', 'Idea')).toBe('Idea.md');
      expect((await adapter.list('')).map((entry) => entry.path)).toEqual(['Idea.md']);
    });

    it('refuses a taken or invalid name', async () => {
      const { vault } = vaultWith({ 'Idea.md': '', 'Plan.md': '' });
      await expect(vault.renameNote('Idea.md', 'PLAN')).rejects.toMatchObject({ code: 'EEXIST' });
      await expect(vault.renameNote('Idea.md', '')).rejects.toMatchObject({ problem: 'empty' });
    });
  });

  describe('deleteNote', () => {
    it('moves the note to the trash, keeping earlier deleted copies', async () => {
      const { adapter, vault } = vaultWith({ 'Idea.md': 'first', 'Projects/Idea.md': 'second' });
      expect(await vault.deleteNote('Idea.md')).toBe('.trash/Idea.md');
      expect(await vault.deleteNote('Projects/Idea.md')).toBe('.trash/Idea 1.md');
      expect(await adapter.readFile('.trash/Idea.md')).toBe('first');
      expect(await adapter.readFile('.trash/Idea 1.md')).toBe('second');
      expect(await vault.listNotes()).toEqual([]);
    });
  });
});
