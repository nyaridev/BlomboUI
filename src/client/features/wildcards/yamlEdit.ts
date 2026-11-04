/**
 * The Sections editor's model of a YAML wildcard file: keys holding a list (a wildcard) or more
 * keys (a group). Edits go through the YAML document, so comments and the rest of the file stay
 * as they were. A key is addressed by its position at each level, never by its name, because two
 * keys can look alike ("1" and 1) and a name is what a rename changes.
 */
import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  Pair,
  parseDocument,
  type Scalar,
  YAMLMap,
  YAMLSeq,
} from "yaml";

export type SectionValue =
  | { kind: "list"; items: string[] }
  | { kind: "group"; children: YamlSection[] }
  | { kind: "empty" }
  /** Anything else (a single value, a list holding lists): shown, edited in Raw. */
  | { kind: "other"; preview: string; scalar: boolean };

export interface YamlSection {
  key: string;
  /** Index of the key at each level. */
  path: number[];
  value: SectionValue;
}

export type ReadSections =
  | { sections: YamlSection[]; error: null }
  | { sections: null; error: string };

export function readSections(text: string): ReadSections {
  const doc = parseDocument(text);
  if (doc.errors.length)
    return { sections: null, error: doc.errors[0]?.message.split("\n")[0] ?? "Invalid YAML" };
  if (doc.contents === null || (isScalar(doc.contents) && doc.contents.value === null))
    return { sections: [], error: null };
  if (!isMap(doc.contents))
    return { sections: null, error: "The file isn't a set of keys at the top." };
  return { sections: readMap(doc.contents, []), error: null };
}

function readMap(map: YAMLMap, at: number[]): YamlSection[] {
  return map.items.map((pair, i) => {
    const path = [...at, i];
    const key = isScalar(pair.key) ? String(pair.key.value ?? "") : String(pair.key ?? "");
    return { key, path, value: readValue(pair.value, path) };
  });
}

function readValue(node: unknown, path: number[]): SectionValue {
  if (node === null || node === undefined || (isScalar(node) && node.value === null))
    return { kind: "empty" };
  if (isMap(node)) return { kind: "group", children: readMap(node, path) };
  if (isSeq(node) && node.items.every((v) => isScalar(v)))
    return {
      kind: "list",
      items: node.items.map((v) => String((v as Scalar).value ?? "")),
    };
  return isScalar(node)
    ? { kind: "other", preview: String(node.value), scalar: true }
    : { kind: "other", preview: String(node), scalar: false };
}

/** Parse, change, print. The text comes back as it was when it doesn't parse or `change`
 * returns false (nothing to do). */
function edit(text: string, change: (doc: Document, root: YAMLMap) => undefined | false): string {
  const doc = parseDocument(text);
  if (doc.errors.length) return text;
  if (doc.contents === null || (isScalar(doc.contents) && doc.contents.value === null))
    doc.contents = new YAMLMap() as never;
  if (!isMap(doc.contents)) return text;
  if (change(doc, doc.contents) === false) return text;
  return doc.toString({ lineWidth: 0 });
}

/** The map holding the key at `path` and the key's pair. */
function locate(root: YAMLMap, path: number[]): { map: YAMLMap; pair: Pair; index: number } {
  let map = root;
  for (let d = 0; d < path.length - 1; d++) {
    const value = (map.items[path[d] as number] as Pair | undefined)?.value;
    if (!isMap(value)) throw new Error("No group at that path.");
    map = value;
  }
  const index = path[path.length - 1] as number;
  const pair = map.items[index] as Pair | undefined;
  if (!pair) throw new Error("No key at that path.");
  return { map, pair, index };
}

/** The list at `path`, made one when it's empty. */
function listAt(root: YAMLMap, path: number[]): YAMLSeq {
  const { pair } = locate(root, path);
  if (isSeq(pair.value)) return pair.value;
  const seq = new YAMLSeq();
  pair.value = seq;
  return seq;
}

const keyOf = (pair: Pair) =>
  isScalar(pair.key) ? String(pair.key.value ?? "") : String(pair.key ?? "");

/** `base`, or `base_2`, `base_3`… when a sibling already has it. */
export function uniqueKey(taken: Iterable<string>, base: string): string {
  const names = new Set(taken);
  const name = base.trim() || "wildcard";
  if (!names.has(name)) return name;
  let i = 2;
  while (names.has(`${name}_${i}`)) i++;
  return `${name}_${i}`;
}

export const setItem = (text: string, path: number[], index: number, value: string) =>
  edit(text, (doc, root) => {
    const seq = listAt(root, path);
    const item = seq.items[index];
    // Keep the scalar (and its comment); only its text changes.
    if (isScalar(item)) {
      // An empty item needed quotes (""); once it has text, let it be plain again.
      if (item.value === "") item.type = undefined;
      item.value = value;
    } else seq.items[index] = doc.createNode(value);
  });

export const addItem = (text: string, path: number[], at?: number) =>
  edit(text, (doc, root) => {
    const seq = listAt(root, path);
    // An empty list reads back as `[]` (inline); filling it writes it as lines.
    if (!seq.items.length) seq.flow = false;
    seq.items.splice(at ?? seq.items.length, 0, doc.createNode(""));
  });

export const removeItem = (text: string, path: number[], index: number) =>
  edit(text, (_doc, root) => {
    listAt(root, path).items.splice(index, 1);
  });

export const moveListItem = (text: string, path: number[], from: number, to: number) =>
  edit(text, (_doc, root) => {
    const items = listAt(root, path).items;
    const [item] = items.splice(from, 1);
    if (item !== undefined) items.splice(to, 0, item);
  });

/** Rename a key; a name a sibling has gets a number. An empty name changes nothing. */
export const renameKey = (text: string, path: number[], name: string) =>
  edit(text, (doc, root) => {
    const { map, pair } = locate(root, path);
    const wanted = name.trim();
    if (!wanted || wanted === keyOf(pair)) return false;
    const next = uniqueKey(map.items.filter((p) => p !== pair).map(keyOf), wanted);
    if (isScalar(pair.key)) pair.key.value = next;
    else pair.key = doc.createNode(next);
  });

export const removeKey = (text: string, path: number[]) =>
  edit(text, (_doc, root) => {
    const { map, index } = locate(root, path);
    map.items.splice(index, 1);
  });

/** Remove a group's key but keep what's in it, one level up, where the group was. */
export const liftKey = (text: string, path: number[]) =>
  edit(text, (doc, root) => {
    const { map, pair, index } = locate(root, path);
    if (!isMap(pair.value)) return false;
    const taken = map.items.filter((p) => p !== pair).map(keyOf);
    const moved = pair.value.items.map((child) => {
      const name = uniqueKey(taken, keyOf(child));
      taken.push(name);
      if (isScalar(child.key)) child.key.value = name;
      else child.key = doc.createNode(name);
      return child;
    });
    map.items.splice(index, 1, ...moved);
  });

/**
 * Add a key at the top (`parent` []) or inside a key: a wildcard with one empty line, or an empty
 * group. An empty key or a wildcard becomes a group for it (a wildcard keeps its lines in a
 * wildcard of its own name inside). Returns the new text and the new key's path.
 */
export function addSection(
  text: string,
  parent: number[],
  kind: "list" | "group",
): { text: string; path: number[] } {
  let path: number[] = [];
  const next = edit(text, (doc, root) => {
    let map = root;
    if (parent.length) {
      const { pair } = locate(root, parent);
      if (!isMap(pair.value)) {
        const group = new YAMLMap();
        // A wildcard's lines can't sit beside keys: they move into a wildcard inside it, named
        // like it ("colors" → "colors/colors").
        const lines = pair.value;
        if (isSeq(lines) && lines.items.some((i) => !isScalar(i) || String(i.value ?? "").trim()))
          group.items.push(new Pair(doc.createNode(keyOf(pair)), lines));
        pair.value = group;
      }
      map = pair.value as YAMLMap;
    }
    // An empty group reads back as `{}` (inline); its first key writes it as a block.
    if (!map.items.length) map.flow = false;
    const name = uniqueKey(map.items.map(keyOf), kind === "list" ? "wildcard" : "group");
    const value = kind === "list" ? doc.createNode([""]) : new YAMLMap();
    map.items.push(doc.createPair(name, value));
    path = [...parent, map.items.length - 1];
  });
  return { text: next, path };
}

/** Turn an empty key or a single value into a wildcard (the value's lines) or an empty group. */
export const convertKey = (text: string, path: number[], kind: "list" | "group") =>
  edit(text, (doc, root) => {
    const { pair } = locate(root, path);
    if (kind === "group") {
      pair.value = new YAMLMap();
      return;
    }
    const lines =
      isScalar(pair.value) && pair.value.value !== null
        ? String(pair.value.value)
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
        : [];
    pair.value = doc.createNode(lines.length ? lines : [""]);
  });

/** The reference a prompt uses for the key at `path` ("outfits/fantasy"). */
export function referenceOf(sections: YamlSection[], path: number[]): string {
  const names: string[] = [];
  let level = sections;
  for (const i of path) {
    const s = level[i];
    if (!s) break;
    names.push(s.key);
    level = s.value.kind === "group" ? s.value.children : [];
  }
  return names.join("/");
}
