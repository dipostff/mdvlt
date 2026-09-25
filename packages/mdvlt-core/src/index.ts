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
export { baseName, joinVaultPath, normalizeVaultPath, parentPath, type VaultPath } from './fs/path';
export { parseFrontmatter, type ParsedFrontmatter } from './parser/frontmatter';
export { parseMarkdown } from './parser/markdown';
export { parseWikiLinkContent, remarkWikiLink, type WikiLink } from './parser/wikilinks';
export { LinkResolver } from './vault/links';
export {
  foldName,
  InvalidNoteNameError,
  isNotePath,
  noteNameProblem,
  noteTitle,
  type NoteNameProblem,
} from './vault/names';
export { parseNote, type Note, type NoteLink } from './vault/note';
export { TRASH_FOLDER, Vault } from './vault/vault';
