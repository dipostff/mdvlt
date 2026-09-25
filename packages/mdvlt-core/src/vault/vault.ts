import type { FileEntry, FileSystemAdapter } from '../fs/adapter';
import { FsError, isFsError } from '../fs/errors';
import {
  baseName,
  joinVaultPath,
  normalizeVaultPath,
  parentPath,
  type VaultPath,
} from '../fs/path';
import { foldName, InvalidNoteNameError, isNotePath, noteNameProblem, noteTitle } from './names';
import { parseNote, type Note } from './note';

/** Hidden folder that deleted notes are moved to, the same one Obsidian uses. */
export const TRASH_FOLDER = '.trash';

/** A folder with notes, accessed through the platform's `FileSystemAdapter`. */
export class Vault {
  readonly adapter: FileSystemAdapter;

  constructor(adapter: FileSystemAdapter) {
    this.adapter = adapter;
  }

  /**
   * All files and folders, sorted by path. Entries whose name starts with a dot (`.git`,
   * `.obsidian`, `.trash`) are skipped together with their content.
   */
  async listEntries(): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    const walk = async (folder: VaultPath): Promise<void> => {
      let children: FileEntry[];
      try {
        children = await this.adapter.list(folder);
      } catch (error) {
        // A sync tool may delete a folder while we are walking the vault.
        if (folder !== '' && isFsError(error, 'ENOENT')) return;
        throw error;
      }
      const visible = children.filter((child) => !baseName(child.path).startsWith('.'));
      entries.push(...visible);
      await Promise.all(
        visible.filter((child) => child.type === 'folder').map((child) => walk(child.path)),
      );
    };
    await walk('');
    return entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  async listNotes(): Promise<FileEntry[]> {
    const entries = await this.listEntries();
    return entries.filter((entry) => entry.type === 'file' && isNotePath(entry.path));
  }

  async readNote(path: VaultPath): Promise<Note> {
    const notePath = normalizeVaultPath(path);
    return parseNote(notePath, await this.adapter.readFile(notePath));
  }

  async saveNote(path: VaultPath, content: string): Promise<void> {
    await this.adapter.writeFile(path, content);
  }

  /**
   * Creates `<title>.md` in `folder` and returns its path.
   *
   * @throws {InvalidNoteNameError} if `title` can't be a file name on every platform.
   * @throws {FsError} `EEXIST` if the folder has an entry with this name in any letter case.
   */
  async createNote(folder: VaultPath, title: string, content = ''): Promise<VaultPath> {
    const path = notePath(folder, title);
    await this.assertNameIsFree(path);
    await this.adapter.writeFile(path, content);
    return path;
  }

  /** Gives a note a new title within its folder and returns the new path. Throws like `createNote`. */
  async renameNote(path: VaultPath, title: string): Promise<VaultPath> {
    const source = normalizeVaultPath(path);
    const target = notePath(parentPath(source), title);
    if (target !== source) {
      await this.assertNameIsFree(target, source);
      await this.adapter.rename(source, target);
    }
    return target;
  }

  /** Moves a note to the vault's trash folder and returns its path there. */
  async deleteNote(path: VaultPath): Promise<VaultPath> {
    const source = normalizeVaultPath(path);
    let target = joinVaultPath(TRASH_FOLDER, baseName(source));
    for (let copy = 1; await this.adapter.exists(target); copy++) {
      target = joinVaultPath(TRASH_FOLDER, `${noteTitle(source)} ${copy}.md`);
    }
    await this.adapter.rename(source, target);
    return target;
  }

  // Names differing only in letter case can't coexist on Windows and Android, so a vault synced
  // there must not have them anywhere.
  private async assertNameIsFree(path: VaultPath, renamedFrom?: VaultPath): Promise<void> {
    let siblings: FileEntry[];
    try {
      siblings = await this.adapter.list(parentPath(path));
    } catch (error) {
      if (isFsError(error, 'ENOENT')) return;
      throw error;
    }
    const key = foldName(path);
    const taken = siblings.find(
      (entry) => entry.path !== renamedFrom && foldName(entry.path) === key,
    );
    if (taken) throw new FsError('EEXIST', taken.path);
  }
}

function notePath(folder: VaultPath, title: string): VaultPath {
  const problem = noteNameProblem(title);
  if (problem) throw new InvalidNoteNameError(title, problem);
  return joinVaultPath(folder, `${title}.md`);
}
