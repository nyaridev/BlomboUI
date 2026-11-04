/**
 * Line mode for a .txt file: one list, one option per line, comments and blank lines kept as
 * rows. YAML files are edited through yamlEdit.ts.
 */

export function toLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function fromLines(lines: string[]): string {
  return lines.length ? `${lines.join("\n")}\n` : "";
}
