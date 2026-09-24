export type FsErrorCode =
  'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY' | 'EINVAL' | 'EACCES' | 'EIO';

const DESCRIPTIONS: Record<FsErrorCode, string> = {
  ENOENT: 'no such file or folder',
  EEXIST: 'already exists',
  ENOTDIR: 'not a folder',
  EISDIR: 'is a folder',
  ENOTEMPTY: 'folder is not empty',
  EINVAL: 'invalid path',
  EACCES: 'permission denied',
  EIO: 'input/output error',
};

export interface FsErrorOptions {
  description?: string;
  /** The platform error behind an `EACCES` or `EIO`. */
  cause?: unknown;
}

/**
 * The error every file system adapter throws, so the core handles failures the same way on all
 * platforms.
 */
export class FsError extends Error {
  override readonly name = 'FsError';
  readonly code: FsErrorCode;
  readonly path: string;

  constructor(code: FsErrorCode, path: string, options: FsErrorOptions = {}) {
    super(`${code}: ${options.description ?? DESCRIPTIONS[code]}, '${path}'`, options);
    this.code = code;
    this.path = path;
  }
}

export function isFsError(error: unknown, code?: FsErrorCode): error is FsError {
  return error instanceof FsError && (code === undefined || error.code === code);
}
