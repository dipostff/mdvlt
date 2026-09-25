import { isFsError } from '../fs/errors';
import {
  baseName,
  joinVaultPath,
  normalizeVaultPath,
  parentPath,
  type VaultPath,
} from '../fs/path';
import { foldName } from './names';

interface IndexedFile {
  path: VaultPath;
  key: string;
}

/**
 * Finds the file a wiki link points to, the way Obsidian does: by file name, ignoring letter
 * case, with `.md` implied for notes.
 */
export class LinkResolver {
  private readonly filesByName = new Map<string, IndexedFile[]>();

  constructor(files: Iterable<VaultPath> = []) {
    for (const path of files) this.add(path);
  }

  add(path: VaultPath): void {
    const key = foldName(path);
    const files = this.filesByName.get(baseName(key));
    if (!files) this.filesByName.set(baseName(key), [{ path, key }]);
    else if (!files.some((file) => file.path === path)) files.push({ path, key });
  }

  delete(path: VaultPath): void {
    const name = baseName(foldName(path));
    const files = this.filesByName.get(name)?.filter((file) => file.path !== path) ?? [];
    if (files.length > 0) this.filesByName.set(name, files);
    else this.filesByName.delete(name);
  }

  /**
   * Returns the path of the linked file, or `null` if there is none.
   *
   * When several files match, the one in the source note's folder wins, then the one at exactly
   * `target` from the vault root, then the one with the shortest path; exact letter case breaks
   * ties. Targets starting with `./` or `../` only match relative to the source note.
   *
   * @param target link target without the `#anchor`: `Idea`, `Projects/Idea`, `../Idea`,
   *   `photo.png`; empty for a link within the same note
   * @param source the note that contains the link
   */
  resolve(target: string, source: VaultPath): VaultPath | null {
    if (target.trim() === '') return source;
    const relative = /^\.\.?[/\\]/.test(target);
    let path: VaultPath;
    try {
      path = relative ? joinVaultPath(parentPath(source), target) : normalizeVaultPath(target);
    } catch (error) {
      if (isFsError(error, 'EINVAL')) return null;
      throw error;
    }
    if (path === '') return null;
    return this.find(`${path}.md`, source, relative) ?? this.find(path, source, relative);
  }

  private find(path: VaultPath, source: VaultPath, relative: boolean): VaultPath | null {
    const key = foldName(path);
    const localKey = foldName(joinVaultPath(parentPath(source), path));
    const candidates = (this.filesByName.get(baseName(key)) ?? []).filter(
      (file) => file.key === key || (!relative && file.key.endsWith(`/${key}`)),
    );
    const tier = (file: IndexedFile) => (file.key === localKey ? 0 : file.key === key ? 1 : 2);
    const caseMismatch = (file: IndexedFile) => (endsWithSegments(file.path, path) ? 0 : 1);
    const [best] = candidates.toSorted(
      (a, b) =>
        tier(a) - tier(b) ||
        caseMismatch(a) - caseMismatch(b) ||
        a.path.length - b.path.length ||
        compareCodePoints(a.path, b.path),
    );
    return best?.path ?? null;
  }
}

// Unlike localeCompare, gives the same order on every device, so a link resolves the same way.
function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function endsWithSegments(path: VaultPath, suffix: VaultPath): boolean {
  const [whole, end] = [path.normalize('NFC'), suffix.normalize('NFC')];
  return whole === end || whole.endsWith(`/${end}`);
}
