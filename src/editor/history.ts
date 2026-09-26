/**
 * Snapshot-based undo/redo. Snapshots are opaque strings (serialised world state), so
 * restoring never has to reason about object identity. `begin`/`end` bracket a gesture
 * such as a drag; the gesture becomes one undo step, and only if it changed something.
 */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  private pending: string | null = null;

  constructor(
    private readonly capture: () => string,
    private readonly apply: (snapshot: string) => void,
    private readonly limit = 200,
  ) {}

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  begin(): void {
    this.pending ??= this.capture();
  }

  end(): void {
    if (this.pending === null) return;
    const before = this.pending;
    this.pending = null;
    if (before === this.capture()) return;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Run `fn` as a single undo step. */
  record(fn: () => void): void {
    this.begin();
    fn();
    this.end();
  }

  undo(): boolean {
    const snap = this.past.pop();
    if (snap === undefined) return false;
    this.future.push(this.capture());
    this.apply(snap);
    return true;
  }

  redo(): boolean {
    const snap = this.future.pop();
    if (snap === undefined) return false;
    this.past.push(this.capture());
    this.apply(snap);
    return true;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.pending = null;
  }
}
