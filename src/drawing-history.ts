import type { Value } from './board';
type Change = { id: string; before: Value | null; after: Value | null };
type Entry = { changes: Change[]; key?: string; time: number };
// Object key order may change after server validation; array order remains significant.
export function sameValue(a: unknown, b: unknown): boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]));
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(right,k)&&sameValue(left[k],right[k]));
}
const same = sameValue;
export class DrawingHistory {
  past: Entry[] = [];
  future: Entry[] = [];
  private aliases = new Map<string, string>();
  resolve(id: string): string { while (this.aliases.has(id)) id = this.aliases.get(id)!; return id; }
  record(changes: Change[], key?: string) {
    changes = changes.filter(c => !same(c.before, c.after));
    if (!changes.length) return;
    const last = this.past.at(-1), time = Date.now();
    const mergeable = key !== undefined && changes.length === 1 && last?.changes.length === 1 && last.changes[0].id === changes[0].id;
    if (mergeable && ((last.key === key && time - last.time < 800) || (key?.startsWith('typing:') && last.changes[0].before === null)) && same(last.changes[0].after, changes[0].before)) {
      last.changes[0].after = changes[0].after; last.time = time;
    } else this.past.push({ changes, key, time });
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }
  apply(redo: boolean, read: (id: string) => Value | null, write: (id: string, value: Value | null) => void, fresh: () => string): 'empty' | 'conflict' | 'ok' {
    const source = redo ? this.future : this.past, target = redo ? this.past : this.future;
    const entry = source.at(-1);
    if (!entry) return 'empty';
    if (entry.changes.some(c => !same(read(this.resolve(c.id)), redo ? c.before : c.after))) return 'conflict';
    for (const c of entry.changes) {
      let id = this.resolve(c.id);
      const value = redo ? c.after : c.before;
      if (value && !read(id)) { const previousId = id; id = fresh(); this.aliases.set(previousId, id); }
      write(id, value);
    }
    source.pop(); target.push(entry);
    return 'ok';
  }
}
