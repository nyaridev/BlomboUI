/** Terminal color codes (ESC [ … m) that ComfyUI and uv print even when their output is piped. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC is the point
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}
