/** Small pure helpers for prompt text that the editor and its tools share. */

/**
 * The text to insert at the cursor so tags stay comma separated: "a" + "b" → ", b";
 * "a," + "b" → " b"; "a" + "b" + " c" → ", b, ".
 */
export function joinAtCursor(before: string, text: string, after: string): string {
  const t = text.trim().replace(/^,\s*|,\s*$/g, "");
  if (!t) return "";
  const lead =
    before.trim() === "" ? "" : /,\s*$/.test(before) ? (/\s$/.test(before) ? "" : " ") : ", ";
  const trail = after.trim() !== "" && !/^\s*,/.test(after) ? ", " : "";
  return `${lead}${t}${trail}`;
}

/** Add text to the end of a prompt, comma separated. */
export function appendToPrompt(prompt: string, text: string): string {
  return `${prompt}${joinAtCursor(prompt, text, "")}`;
}
