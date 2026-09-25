import { FsError } from './errors';

/**
 * Path relative to the vault root: segments separated by `/`, no leading or trailing slash,
 * no `.` or `..` segments. The vault root itself is `''`.
 *
 * @example 'Projects/mdvlt/Roadmap.md'
 */
export type VaultPath = string;

/**
 * Brings any incoming path to the canonical {@link VaultPath} form.
 *
 * Backslashes count as separators: otherwise `..\secret` would pass the check below and escape
 * the vault on Windows.
 *
 * @throws {FsError} `EINVAL` if the path leaves the vault or contains a NUL character.
 */
export function normalizeVaultPath(path: string): VaultPath {
  if (path.includes('\0')) {
    throw new FsError('EINVAL', path, { description: 'path contains a NUL character' });
  }
  const segments: string[] = [];
  for (const segment of path.split(/[/\\]/)) {
    if (segment === '..') {
      if (segments.length === 0) {
        throw new FsError('EINVAL', path, { description: 'path leaves the vault' });
      }
      segments.pop();
    } else if (segment !== '' && segment !== '.') {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

export function joinVaultPath(...parts: string[]): VaultPath {
  return normalizeVaultPath(parts.join('/'));
}

/** Parent folder of a canonical path; the root is its own parent. */
export function parentPath(path: VaultPath): VaultPath {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Last segment of a canonical path: `Projects/Idea.md` → `Idea.md`. */
export function baseName(path: VaultPath): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
