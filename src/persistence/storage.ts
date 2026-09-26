import type { WorldData } from "../world/world";

const KEY = "virtual-world:current";

export function saveLocal(data: WorldData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): WorldData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseWorld(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Parse and shape-check a world file. Throws with a readable message on bad input. */
export function parseWorld(text: string): WorldData {
  const data = JSON.parse(text) as Partial<WorldData>;
  if (data.version !== 1) throw new Error("Not a virtual-world file (missing version 1 header)");
  if (!data.graph || !Array.isArray(data.graph.points) || !Array.isArray(data.graph.segments)) {
    throw new Error("World file has no graph");
  }
  const n = data.graph.points.length;
  for (const [a, b] of data.graph.segments) {
    if (!(a >= 0 && a < n && b >= 0 && b < n)) throw new Error("World file has a segment pointing at a missing point");
  }
  return { markings: [], seed: 1, ...data } as WorldData;
}

export function downloadWorld(data: WorldData, name = "world"): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.world`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}
