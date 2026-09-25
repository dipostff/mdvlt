import { baseName, type VaultPath } from '../fs/path';

const NOTE_EXTENSION = '.md';

export function isNotePath(path: VaultPath): boolean {
  return path.toLowerCase().endsWith(NOTE_EXTENSION);
}

/** A note's title is its file name without the extension: `Projects/Idea.md` → `Idea`. */
export function noteTitle(path: VaultPath): string {
  const name = baseName(path);
  return isNotePath(name) ? name.slice(0, -NOTE_EXTENSION.length) : name;
}

/** Key for comparing names the way Windows and Android do: ignoring case and Unicode form. */
export function foldName(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

export type NoteNameProblem =
  | 'empty'
  | 'forbidden-character'
  | 'leading-dot'
  | 'trailing-dot-or-space'
  | 'reserved'
  | 'too-long';

// \ / : * ? " < > | are not allowed in file names on Windows and Android; # ^ [ ] | break links.
const FORBIDDEN_CHARACTER = /[\\/:*?"<>|#^[\]]|\p{Cc}/u;
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_FILE_NAME_BYTES = 255;
const encoder = new TextEncoder();

/**
 * Why `title` can't name a note in a vault synced between Linux, Windows and Android,
 * or `null` if it can.
 */
export function noteNameProblem(title: string): NoteNameProblem | null {
  if (title.trim() === '') return 'empty';
  if (FORBIDDEN_CHARACTER.test(title)) return 'forbidden-character';
  if (title.startsWith('.')) return 'leading-dot';
  if (title.endsWith('.') || title.endsWith(' ')) return 'trailing-dot-or-space';
  if (RESERVED_ON_WINDOWS.test(title.split('.')[0] ?? '')) return 'reserved';
  if (encoder.encode(title + NOTE_EXTENSION).length > MAX_FILE_NAME_BYTES) return 'too-long';
  return null;
}

export class InvalidNoteNameError extends Error {
  override readonly name = 'InvalidNoteNameError';
  readonly title: string;
  readonly problem: NoteNameProblem;

  constructor(title: string, problem: NoteNameProblem) {
    super(`Invalid note name '${title}': ${problem}`);
    this.title = title;
    this.problem = problem;
  }
}
