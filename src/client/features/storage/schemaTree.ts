/**
 * A JSON schema (from `z.toJSONSchema`) as indented rows for the Saved data view: each field's name,
 * type in words ("text", "yes / no", "list of numbers") and default, nested groups and list items
 * below their field. `$ref`s to `$defs` are followed once per branch (layouts nest), then shown
 * by name.
 */
type Schema = Record<string, unknown>;

export interface SchemaRow {
  depth: number;
  name: string;
  type: string;
  /** The default as JSON, when there is one. */
  def: string | null;
  required: boolean;
}

const MAX_DEPTH = 8;

const WORDS: Record<string, [one: string, many: string]> = {
  string: ["text", "texts"],
  number: ["number", "numbers"],
  integer: ["whole number", "whole numbers"],
  boolean: ["yes / no", "yes / no values"],
  object: ["group", "groups"],
  null: ["empty", "empties"],
};

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** A schema's type in words; `many` for list items ("list of texts"). */
export function typeOf(s: Schema, many = false): string {
  if (typeof s.$ref === "string") return s.$ref.split("/").pop() ?? "group";
  if ("const" in s) return `always ${show(s.const)}`;
  if (Array.isArray(s.enum)) return `one of: ${s.enum.map(show).join(", ")}`;
  const options = (s.anyOf ?? s.oneOf) as Schema[] | undefined;
  if (Array.isArray(options)) return orEmpty(options.map((o) => typeOf(o, many)));
  const t = s.type;
  if (Array.isArray(t)) return orEmpty(t.map((x) => WORDS[String(x)]?.[many ? 1 : 0] ?? String(x)));
  if (t === "array")
    return s.items && typeof s.items === "object"
      ? `list of ${typeOf(s.items as Schema, true)}`
      : "list";
  if (t === "object" && s.additionalProperties && typeof s.additionalProperties === "object")
    return `${typeOf(s.additionalProperties as Schema, true)} by name`;
  return typeof t === "string" ? (WORDS[t]?.[many ? 1 : 0] ?? t) : "anything";
}

/** "text or empty" rather than "text, empty". */
function orEmpty(parts: string[]): string {
  const empty = parts.filter((p) => p === "empty" || p === "empties");
  const rest = parts.filter((p) => p !== "empty" && p !== "empties");
  return [rest.join(" or "), empty.length ? "or empty" : ""].filter(Boolean).join(" ");
}

/** The object schema to list fields of, if this one (or its array items) has any. */
function fieldsOf(s: Schema, defs: Record<string, Schema>, seen: Set<string>): Schema | null {
  if (typeof s.$ref === "string") {
    const name = s.$ref.split("/").pop() ?? "";
    const def = defs[name];
    if (!def || seen.has(name)) return null;
    seen.add(name);
    return fieldsOf(def, defs, seen);
  }
  if (s.properties && typeof s.properties === "object") return s;
  if (s.type === "array" && s.items && typeof s.items === "object")
    return fieldsOf(s.items as Schema, defs, seen);
  const options = (s.anyOf ?? s.oneOf) as Schema[] | undefined;
  if (Array.isArray(options)) {
    const objects = options.filter((o) => o.properties || o.$ref);
    if (objects.length === 1) return fieldsOf(objects[0] as Schema, defs, seen);
  }
  return null;
}

export function schemaRows(schema: Schema): SchemaRow[] {
  const defs = (schema.$defs ?? {}) as Record<string, Schema>;
  const rows: SchemaRow[] = [];
  const visit = (s: Schema, depth: number, seen: Set<string>) => {
    if (depth > MAX_DEPTH) return;
    const required = new Set((s.required ?? []) as string[]);
    for (const [name, child] of Object.entries((s.properties ?? {}) as Record<string, Schema>)) {
      rows.push({
        depth,
        name,
        type: typeOf(child),
        def: "default" in child ? JSON.stringify(child.default) : null,
        required: required.has(name),
      });
      const branch = new Set(seen);
      const inner = fieldsOf(child, defs, branch);
      if (inner) visit(inner, depth + 1, branch);
    }
  };
  const root = fieldsOf(schema, defs, new Set());
  if (root) visit(root, 0, new Set());
  return rows;
}
