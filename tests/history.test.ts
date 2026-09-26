import { describe, expect, it } from "vitest";
import { History } from "../src/editor/history";

function setup() {
  const state = { v: 0 };
  const h = new History(
    () => String(state.v),
    (s) => (state.v = Number(s)),
  );
  return { state, h };
}

describe("History", () => {
  it("undoes and redoes recorded steps in order", () => {
    const { state, h } = setup();
    h.record(() => (state.v = 1));
    h.record(() => (state.v = 2));
    expect(h.undo()).toBe(true);
    expect(state.v).toBe(1);
    expect(h.undo()).toBe(true);
    expect(state.v).toBe(0);
    expect(h.undo()).toBe(false);
    h.redo();
    h.redo();
    expect(state.v).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it("a whole drag is one step, and a drag that changed nothing is none", () => {
    const { state, h } = setup();
    h.begin();
    state.v = 5;
    state.v = 9;
    h.end();
    h.begin();
    h.end();
    h.undo();
    expect(state.v).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it("a new edit after undo drops the redo branch", () => {
    const { state, h } = setup();
    h.record(() => (state.v = 1));
    h.undo();
    h.record(() => (state.v = 7));
    expect(h.canRedo).toBe(false);
  });
});
