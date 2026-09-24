/* eslint-disable @typescript-eslint/require-await -- the operations are synchronous, the interface is not */
import type {
  EntryType,
  FileEntry,
  FileStat,
  FileSystemAdapter,
  Unsubscribe,
  WatchEvent,
  WatchEventKind,
} from './adapter';
import { FsError } from './errors';
import { normalizeVaultPath, parentPath, type VaultPath } from './path';

interface StoredFile {
  type: 'file';
  data: Uint8Array;
  mtime: number;
}

interface StoredFolder {
  type: 'folder';
  mtime: number;
}

type Stored = StoredFile | StoredFolder;

const encoder = new TextEncoder();
// Keeps a leading BOM in the text, like Node's `fs.readFile(path, 'utf8')`.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

/**
 * Vault kept in memory: for tests and for running the UI without a real file system.
 * Paths are case-sensitive, as on Linux.
 */
export class MemoryFileSystemAdapter implements FileSystemAdapter {
  private readonly entries = new Map<VaultPath, Stored>([['', folder()]]);
  private readonly listeners = new Set<(event: WatchEvent) => void>();

  /** @param files initial text files, e.g. `{ 'Notes/Idea.md': '# Idea' }` */
  constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) {
      this.write(normalizeVaultPath(path), encoder.encode(content));
    }
  }

  async stat(path: VaultPath): Promise<FileStat | null> {
    const entry = this.entries.get(normalizeVaultPath(path));
    return entry ? toStat(entry) : null;
  }

  async exists(path: VaultPath): Promise<boolean> {
    return this.entries.has(normalizeVaultPath(path));
  }

  async list(folder: VaultPath): Promise<FileEntry[]> {
    const target = normalizeVaultPath(folder);
    this.assertFolder(target);
    const children: FileEntry[] = [];
    for (const [path, entry] of this.entries) {
      if (path !== '' && parentPath(path) === target) {
        children.push({ path, ...toStat(entry) });
      }
    }
    return children;
  }

  async readFile(path: VaultPath): Promise<string> {
    return decoder.decode(this.getFile(normalizeVaultPath(path)).data);
  }

  async readBinary(path: VaultPath): Promise<Uint8Array> {
    return this.getFile(normalizeVaultPath(path)).data.slice();
  }

  async writeFile(path: VaultPath, content: string): Promise<void> {
    this.write(normalizeVaultPath(path), encoder.encode(content));
  }

  async writeBinary(path: VaultPath, data: Uint8Array): Promise<void> {
    this.write(normalizeVaultPath(path), data.slice());
  }

  async createFolder(path: VaultPath): Promise<void> {
    const target = normalizeVaultPath(path);
    const existing = this.entries.get(target);
    if (existing?.type === 'folder') return;
    if (existing) throw new FsError('EEXIST', target);
    this.createParents(target);
    this.entries.set(target, folder());
    this.emit('created', 'folder', target);
  }

  async rename(from: VaultPath, to: VaultPath): Promise<void> {
    const source = normalizeVaultPath(from);
    const target = normalizeVaultPath(to);
    if (source === '' || target === '') {
      throw new FsError('EINVAL', source === '' ? from : to, {
        description: 'the vault root cannot be renamed',
      });
    }
    if (!this.entries.has(source)) throw new FsError('ENOENT', source);
    if (source === target) return;
    if (target.startsWith(`${source}/`)) {
      throw new FsError('EINVAL', target, { description: 'a folder cannot be moved into itself' });
    }
    if (this.entries.has(target)) throw new FsError('EEXIST', target);
    this.createParents(target);

    const moved = this.subtree(source);
    const movedPath = (path: VaultPath) => target + path.slice(source.length);
    for (const [path] of moved) this.entries.delete(path);
    for (const [path, entry] of moved) this.entries.set(movedPath(path), entry);
    for (const [path, entry] of moved.toReversed()) this.emit('deleted', entry.type, path);
    for (const [path, entry] of moved) this.emit('created', entry.type, movedPath(path));
  }

  async deleteFile(path: VaultPath): Promise<void> {
    const target = normalizeVaultPath(path);
    this.getFile(target);
    this.entries.delete(target);
    this.emit('deleted', 'file', target);
  }

  async deleteFolder(path: VaultPath, options: { recursive?: boolean } = {}): Promise<void> {
    const target = normalizeVaultPath(path);
    if (target === '') {
      throw new FsError('EINVAL', path, { description: 'the vault root cannot be deleted' });
    }
    this.assertFolder(target);
    const removed = this.subtree(target);
    if (removed.length > 1 && !options.recursive) throw new FsError('ENOTEMPTY', target);
    for (const [entryPath, entry] of removed.toReversed()) {
      this.entries.delete(entryPath);
      this.emit('deleted', entry.type, entryPath);
    }
  }

  watch(listener: (event: WatchEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private write(path: VaultPath, data: Uint8Array): void {
    const existing = this.entries.get(path);
    if (existing?.type === 'folder') throw new FsError('EISDIR', path);
    this.createParents(path);
    this.entries.set(path, { type: 'file', data, mtime: Date.now() });
    this.emit(existing ? 'modified' : 'created', 'file', path);
  }

  /** Creates the missing ancestors of `path` as folders. */
  private createParents(path: VaultPath): void {
    const missing: VaultPath[] = [];
    let ancestor = parentPath(path);
    let existing = this.entries.get(ancestor);
    while (!existing) {
      missing.push(ancestor);
      ancestor = parentPath(ancestor);
      existing = this.entries.get(ancestor);
    }
    if (existing.type === 'file') throw new FsError('ENOTDIR', path);
    for (const folderPath of missing.toReversed()) {
      this.entries.set(folderPath, folder());
      this.emit('created', 'folder', folderPath);
    }
  }

  /** `root` and everything inside it, parents before children. */
  private subtree(root: VaultPath): [VaultPath, Stored][] {
    return [...this.entries]
      .filter(([path]) => path === root || path.startsWith(`${root}/`))
      .sort(([a], [b]) => a.length - b.length);
  }

  private getFile(path: VaultPath): StoredFile {
    const entry = this.entries.get(path);
    if (!entry) throw new FsError('ENOENT', path);
    if (entry.type !== 'file') throw new FsError('EISDIR', path);
    return entry;
  }

  private assertFolder(path: VaultPath): void {
    const entry = this.entries.get(path);
    if (!entry) throw new FsError('ENOENT', path);
    if (entry.type !== 'folder') throw new FsError('ENOTDIR', path);
  }

  private emit(kind: WatchEventKind, type: EntryType, path: VaultPath): void {
    const event: WatchEvent = { kind, type, path };
    for (const listener of this.listeners) {
      // Delivered asynchronously, like events from a real file watcher.
      queueMicrotask(() => {
        if (this.listeners.has(listener)) listener(event);
      });
    }
  }
}

function folder(): StoredFolder {
  return { type: 'folder', mtime: Date.now() };
}

function toStat(entry: Stored): FileStat {
  return {
    type: entry.type,
    size: entry.type === 'file' ? entry.data.byteLength : 0,
    mtime: entry.mtime,
  };
}
