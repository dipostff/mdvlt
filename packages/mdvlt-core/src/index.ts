export type {
  EntryType,
  FileEntry,
  FileStat,
  FileSystemAdapter,
  Unsubscribe,
  WatchEvent,
  WatchEventKind,
} from './fs/adapter';
export { FsError, isFsError, type FsErrorCode, type FsErrorOptions } from './fs/errors';
export { MemoryFileSystemAdapter } from './fs/memory-adapter';
export { joinVaultPath, normalizeVaultPath, parentPath, type VaultPath } from './fs/path';
