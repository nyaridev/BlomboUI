/**
 * Line mode: wildcard files edited as lists. A .txt file is one list (one option per line,
 * comments and blank lines kept as rows). A YAML file is a list per key; edits go through the
 * YAML document model so comments and the rest of the file stay as they were.
 */
import { flattenYamlWildcards } from "@shared/wildcards";
import { Document, isMap, isSeq, parseDocument } from "yaml";

export function toLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function fromLines(lines: string[]): string {
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export interface YamlList {
  /** Reference name ("outfits/fantasy"). */
  path: string;
  items: string[];
}

/** The lists in a YAML file, or the first error when it doesn't parse. */
export function yamlLists(text: string): { lists: YamlList[]; error: string | null } {
  const doc = parseDocument(text);
  if (doc.errors.length)
    return { lists: [], error: doc.errors[0]?.message.split("\n")[0] ?? "Invalid YAML" };
  const map = flattenYamlWildcards(doc.toJS());
  return { lists: [...map].map(([path, items]) => ({ path, items })), error: null };
}

/** Replace one key's list, keeping comments and formatting elsewhere. */
export function setYamlList(text: string, path: string, items: string[]): string {
  const doc = parseDocument(text);
  const keys = path.split("/");
  const existing = doc.getIn(keys, true);
  if (isSeq(existing)) {
    // Keep the sequence node (and its comments); replace its items.
    existing.items = items.map((v) => doc.createNode(v));
  } else {
    doc.setIn(keys, doc.createNode(items));
  }
  return doc.toString({ lineWidth: 0 });
}

/** Add an empty list under a new key path. */
export function addYamlList(text: string, path: string): string {
  const keys = path.split("/").filter(Boolean);
  const parsed = parseDocument(text);
  // An empty or non-map file starts a fresh mapping.
  const doc = isMap(parsed.contents) ? parsed : new Document({});
  if (doc.hasIn(keys)) return text;
  doc.setIn(keys, doc.createNode([]));
  return doc.toString({ lineWidth: 0 });
}
