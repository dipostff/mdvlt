import { describe, expect, it } from 'vitest';

import { describeFileSystemAdapterContract } from '../testing';
import type { WatchEvent } from './adapter';
import { MemoryFileSystemAdapter } from './memory-adapter';

describe('MemoryFileSystemAdapter', () => {
  describeFileSystemAdapterContract(() => new MemoryFileSystemAdapter());

  it('starts with the given files', async () => {
    const fs = new MemoryFileSystemAdapter({ 'Notes/Idea.md': '# Idea', 'Inbox.md': '' });
    expect(await fs.readFile('Notes/Idea.md')).toBe('# Idea');
    expect(await fs.stat('Notes')).toMatchObject({ type: 'folder' });
  });

  it('reports every entry of a moved folder', async () => {
    const fs = new MemoryFileSystemAdapter({ 'a/b.md': '' });
    const events: WatchEvent[] = [];
    fs.watch((event) => events.push(event));
    await fs.rename('a', 'c');
    expect(events).toEqual([
      { kind: 'deleted', type: 'file', path: 'a/b.md' },
      { kind: 'deleted', type: 'folder', path: 'a' },
      { kind: 'created', type: 'folder', path: 'c' },
      { kind: 'created', type: 'file', path: 'c/b.md' },
    ]);
  });

  it('stops reporting after unsubscribe', async () => {
    const fs = new MemoryFileSystemAdapter();
    const events: WatchEvent[] = [];
    const unsubscribe = fs.watch((event) => events.push(event));
    unsubscribe();
    await fs.writeFile('a.md', '');
    expect(events).toEqual([]);
  });

  it('does not share binary buffers with callers', async () => {
    const fs = new MemoryFileSystemAdapter();
    const data = new Uint8Array([1, 2, 3]);
    await fs.writeBinary('a.bin', data);
    data[0] = 9;
    (await fs.readBinary('a.bin'))[1] = 9;
    expect([...(await fs.readBinary('a.bin'))]).toEqual([1, 2, 3]);
  });
});
