import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileEntry, FileSystemAdapter, WatchEvent } from '../fs/adapter';
import type { FsErrorCode } from '../fs/errors';

/**
 * Behaviour shared by every `FileSystemAdapter`. Call it inside the implementation's own
 * `describe` with a factory that returns an adapter over an empty vault.
 */
export function describeFileSystemAdapterContract(
  createEmptyVault: () => FileSystemAdapter | Promise<FileSystemAdapter>,
): void {
  describe('FileSystemAdapter contract', () => {
    let fs: FileSystemAdapter;

    beforeEach(async () => {
      fs = await createEmptyVault();
    });

    describe('text files', () => {
      it('round-trips UTF-8 content unchanged', async () => {
        const content = '---\ntags: [идея]\n---\r\n# Заметка 🚀\n\n[[Другая заметка|alias]]\n';
        await fs.writeFile('Заметка.md', content);
        expect(await fs.readFile('Заметка.md')).toBe(content);
      });

      it('creates missing parent folders', async () => {
        await fs.writeFile('a/b/c.md', 'x');
        expect(await fs.stat('a')).toMatchObject({ type: 'folder' });
        expect(await fs.stat('a/b')).toMatchObject({ type: 'folder' });
      });

      it('replaces the content of an existing file', async () => {
        await fs.writeFile('a.md', 'old');
        await fs.writeFile('a.md', 'new');
        expect(await fs.readFile('a.md')).toBe('new');
      });

      it('throws ENOENT for a missing file', async () => {
        await expectFsError(fs.readFile('missing.md'), 'ENOENT');
      });

      it('throws EISDIR when a folder is used as a file', async () => {
        await fs.createFolder('folder');
        await expectFsError(fs.readFile('folder'), 'EISDIR');
        await expectFsError(fs.writeFile('folder', 'x'), 'EISDIR');
      });

      it('throws ENOTDIR when a parent is a file', async () => {
        await fs.writeFile('a.md', 'x');
        await expectFsError(fs.writeFile('a.md/b.md', 'x'), 'ENOTDIR');
      });
    });

    describe('binary files', () => {
      it('round-trips bytes that are not valid UTF-8', async () => {
        const bytes = [0x89, 0x50, 0x00, 0xff];
        await fs.writeBinary('attachments/image.png', new Uint8Array(bytes));
        expect([...(await fs.readBinary('attachments/image.png'))]).toEqual(bytes);
      });

      it('reads text files as UTF-8 bytes', async () => {
        await fs.writeFile('a.md', 'я');
        expect([...(await fs.readBinary('a.md'))]).toEqual([0xd1, 0x8f]);
      });
    });

    describe('stat and exists', () => {
      it('describe files and folders', async () => {
        await fs.writeFile('notes/a.md', 'я');
        const stat = await fs.stat('notes/a.md');
        expect(stat).toMatchObject({ type: 'file', size: 2 });
        // Loose enough for coarse file system clocks, strict enough to catch seconds instead of ms.
        expect(Math.abs((stat?.mtime ?? 0) - Date.now())).toBeLessThan(60_000);
        expect(await fs.stat('notes')).toMatchObject({ type: 'folder', size: 0 });
        expect(await fs.stat('')).toMatchObject({ type: 'folder' });
        expect(await fs.exists('notes/a.md')).toBe(true);
      });

      it('return null and false for missing paths', async () => {
        expect(await fs.stat('missing.md')).toBeNull();
        expect(await fs.exists('missing.md')).toBe(false);
      });
    });

    describe('list', () => {
      it('returns the immediate children with their stats', async () => {
        await fs.writeFile('a.md', 'x');
        await fs.writeFile('folder/b.md', 'x');
        expect(sortByPath(await fs.list(''))).toEqual([
          expect.objectContaining({ path: 'a.md', type: 'file', size: 1 }),
          expect.objectContaining({ path: 'folder', type: 'folder' }),
        ]);
        expect(await fs.list('folder')).toEqual([
          expect.objectContaining({ path: 'folder/b.md', type: 'file' }),
        ]);
      });

      it('throws ENOENT for a missing folder and ENOTDIR for a file', async () => {
        await fs.writeFile('a.md', 'x');
        await expectFsError(fs.list('missing'), 'ENOENT');
        await expectFsError(fs.list('a.md'), 'ENOTDIR');
      });
    });

    describe('createFolder', () => {
      it('creates nested folders and tolerates existing ones', async () => {
        await fs.createFolder('a/b');
        await fs.createFolder('a/b');
        expect(await fs.stat('a/b')).toMatchObject({ type: 'folder' });
      });

      it('throws EEXIST when a file is in the way', async () => {
        await fs.writeFile('a.md', 'x');
        await expectFsError(fs.createFolder('a.md'), 'EEXIST');
      });
    });

    describe('rename', () => {
      it('moves a file into a new folder', async () => {
        await fs.writeFile('a.md', 'content');
        await fs.rename('a.md', 'archive/2026/a.md');
        expect(await fs.exists('a.md')).toBe(false);
        expect(await fs.readFile('archive/2026/a.md')).toBe('content');
      });

      it('moves a folder with everything inside', async () => {
        await fs.writeFile('projects/mdvlt/roadmap.md', 'x');
        await fs.rename('projects', 'archive');
        expect(await fs.exists('projects')).toBe(false);
        expect(await fs.readFile('archive/mdvlt/roadmap.md')).toBe('x');
      });

      it('changes only the letter case', async () => {
        await fs.writeFile('note.md', 'x');
        await fs.rename('note.md', 'Note.md');
        expect((await fs.list('')).map((entry) => entry.path)).toEqual(['Note.md']);
      });

      it('never overwrites an existing entry', async () => {
        await fs.writeFile('a.md', 'a');
        await fs.writeFile('b.md', 'b');
        await expectFsError(fs.rename('a.md', 'b.md'), 'EEXIST');
        expect(await fs.readFile('b.md')).toBe('b');
      });

      it('throws ENOENT for a missing source', async () => {
        await expectFsError(fs.rename('missing.md', 'b.md'), 'ENOENT');
      });

      it('throws EINVAL for the vault root and for a folder moved into itself', async () => {
        await fs.createFolder('a');
        await expectFsError(fs.rename('a', 'a/b'), 'EINVAL');
        await expectFsError(fs.rename('', 'b'), 'EINVAL');
      });
    });

    describe('delete', () => {
      it('deletes files and empty folders', async () => {
        await fs.writeFile('a.md', 'x');
        await fs.createFolder('empty');
        await fs.deleteFile('a.md');
        await fs.deleteFolder('empty');
        expect(await fs.list('')).toEqual([]);
      });

      it('keeps a non-empty folder unless deleting recursively', async () => {
        await fs.writeFile('a/b.md', 'x');
        await expectFsError(fs.deleteFolder('a'), 'ENOTEMPTY');
        expect(await fs.exists('a/b.md')).toBe(true);
        await fs.deleteFolder('a', { recursive: true });
        expect(await fs.exists('a')).toBe(false);
      });

      it('throws EISDIR and ENOTDIR for the wrong kind of entry', async () => {
        await fs.writeFile('a.md', 'x');
        await fs.createFolder('folder');
        await expectFsError(fs.deleteFile('folder'), 'EISDIR');
        await expectFsError(fs.deleteFolder('a.md'), 'ENOTDIR');
      });

      it('throws ENOENT for missing paths', async () => {
        await expectFsError(fs.deleteFile('missing.md'), 'ENOENT');
        await expectFsError(fs.deleteFolder('missing'), 'ENOENT');
      });

      it('never deletes the vault root', async () => {
        await expectFsError(fs.deleteFolder('', { recursive: true }), 'EINVAL');
      });
    });

    describe('paths', () => {
      it('accepts non-canonical spellings of the same path', async () => {
        await fs.writeFile('/notes//./a.md', 'x');
        expect(await fs.readFile('notes/a.md')).toBe('x');
        expect(await fs.readFile('notes\\a.md')).toBe('x');
      });

      it('throws EINVAL for paths that leave the vault', async () => {
        await expectFsError(fs.writeFile('../outside.md', 'x'), 'EINVAL');
        await expectFsError(fs.readFile('notes/../../outside.md'), 'EINVAL');
        await expectFsError(fs.stat('..\\outside.md'), 'EINVAL');
      });
    });

    describe('watch', () => {
      it('reports created, modified and deleted files', async ({ skip }) => {
        if (!fs.watch) return skip('the adapter has no watch()');
        const events: WatchEvent[] = [];
        const unsubscribe = fs.watch((event) => events.push(event));
        try {
          await fs.writeFile('a.md', '1');
          await waitForEvent(events, { kind: 'created', type: 'file', path: 'a.md' });
          await fs.writeFile('a.md', '2');
          await waitForEvent(events, { kind: 'modified', type: 'file', path: 'a.md' });
          await fs.deleteFile('a.md');
          await waitForEvent(events, { kind: 'deleted', type: 'file', path: 'a.md' });
        } finally {
          unsubscribe();
        }
      });
    });
  });
}

async function expectFsError(operation: Promise<unknown>, code: FsErrorCode): Promise<void> {
  await expect(operation).rejects.toMatchObject({ name: 'FsError', code });
}

async function waitForEvent(events: WatchEvent[], expected: WatchEvent): Promise<void> {
  await vi.waitFor(() => expect(events).toContainEqual(expected), { timeout: 5_000 });
}

function sortByPath(entries: FileEntry[]): FileEntry[] {
  return entries.toSorted((a, b) => a.path.localeCompare(b.path));
}
