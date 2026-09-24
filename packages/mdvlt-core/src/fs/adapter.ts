import type { VaultPath } from './path';

export type EntryType = 'file' | 'folder';

export interface FileStat {
  type: EntryType;
  /** Size in bytes, `0` for folders. */
  size: number;
  /** Last modification time in milliseconds since the Unix epoch. */
  mtime: number;
}

export interface FileEntry extends FileStat {
  path: VaultPath;
}

export type WatchEventKind = 'created' | 'modified' | 'deleted';

export interface WatchEvent {
  kind: WatchEventKind;
  type: EntryType;
  path: VaultPath;
}

export type Unsubscribe = () => void;

/**
 * Access to the files of one vault, implemented once per platform: Node `fs` on desktop,
 * `@capacitor/filesystem` on Android, memory in tests.
 *
 * Every implementation must pass `describeFileSystemAdapterContract` from `@mdvlt/core/testing`:
 * - paths are vault-relative and go through `normalizeVaultPath`, so a path that leaves the vault
 *   is rejected with `EINVAL`;
 * - failures are thrown as `FsError`; besides the codes listed per method, any call may throw
 *   `EACCES` or `EIO` with the platform error as `cause`;
 * - text is read and written as UTF-8.
 */
export interface FileSystemAdapter {
  /** Returns `null` if nothing exists at `path`. */
  stat(path: VaultPath): Promise<FileStat | null>;
  exists(path: VaultPath): Promise<boolean>;
  /** Immediate children of a folder, in no particular order. Throws `ENOENT`, `ENOTDIR`. */
  list(folder: VaultPath): Promise<FileEntry[]>;

  /** Throws `ENOENT`, `EISDIR`. */
  readFile(path: VaultPath): Promise<string>;
  /** Throws `ENOENT`, `EISDIR`. */
  readBinary(path: VaultPath): Promise<Uint8Array>;
  /**
   * Creates or replaces the file, creating missing parent folders.
   * Throws `EISDIR` if `path` is a folder, `ENOTDIR` if one of the parents is a file.
   */
  writeFile(path: VaultPath, content: string): Promise<void>;
  /** `writeFile` for binary content such as attachments. */
  writeBinary(path: VaultPath, data: Uint8Array): Promise<void>;

  /**
   * Creates the folder with missing parents; does nothing if it already exists.
   * Throws `EEXIST` if `path` is a file, `ENOTDIR` if one of the parents is a file.
   */
  createFolder(path: VaultPath): Promise<void>;
  /**
   * Moves a file or a folder, creating missing parent folders of `to`.
   * Never overwrites: throws `EEXIST` if `to` exists, unless it is `from` itself spelled in
   * different letter case (`note.md` → `Note.md` must work on case-insensitive file systems).
   * Also throws `ENOENT`, `ENOTDIR`, and `EINVAL` for the vault root or a folder moved into itself.
   */
  rename(from: VaultPath, to: VaultPath): Promise<void>;
  /** Throws `ENOENT`, `EISDIR`. */
  deleteFile(path: VaultPath): Promise<void>;
  /** Throws `ENOENT`, `ENOTDIR`, `ENOTEMPTY` unless `recursive`, `EINVAL` for the vault root. */
  deleteFolder(path: VaultPath, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Reports every change in the vault, including changes made through this adapter, starting
   * right after the call. Absent where the platform has no file watcher (Android): the app
   * rescans the vault instead, e.g. when it comes back to the foreground.
   */
  watch?(listener: (event: WatchEvent) => void): Unsubscribe;
}
