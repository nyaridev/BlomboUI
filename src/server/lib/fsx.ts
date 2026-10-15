/**
 * File helpers. Every write of app state is atomic (temp file + rename) so a crash never
 * leaves half a JSON file behind. Paths from requests go through resolveInside().
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { HttpError } from "./http.ts";

export async function readJsonFile<S extends z.ZodType>(
  file: string,
  schema: S,
  fallback: z.input<S>,
): Promise<z.output<S>> {
  try {
    const text = await fs.readFile(file, "utf8");
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return schema.parse(fallback);
    throw error;
  }
}

/**
 * Writes to the same file are queued, so two requests never race on one rename. On Windows a
 * rename onto a file that another handle (indexer, antivirus, a reader) holds open fails with
 * EPERM/EBUSY for a moment, so the rename retries briefly before giving up.
 */
const queues = new Map<string, Promise<unknown>>();
const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

function enqueue<T>(file: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(file).toLowerCase();
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(key, next);
  // Cleanup only; the caller handles the result (a failed task must not be an unhandled rejection).
  const forget = () => {
    if (queues.get(key) === next) queues.delete(key);
  };
  next.then(forget, forget);
  return next;
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!RETRY_CODES.has(code) || attempt >= 6) {
        await fs.rm(from, { force: true });
        throw error;
      }
      await new Promise((r) => setTimeout(r, 15 * 2 ** attempt));
    }
  }
}

function tmpName(file: string): string {
  return `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
}

export function writeFileAtomic(file: string, data: Uint8Array | string): Promise<void> {
  return enqueue(file, async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = tmpName(file);
    await fs.writeFile(tmp, data);
    await renameWithRetry(tmp, file);
  });
}

export function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Move a file or folder: rename when possible, copy then remove across drives. Never replaces
 * an existing target (throws 409), so user files can't be overwritten by a move. Queued on both
 * paths like writes, and retried through Windows' brief file locks.
 */
export function movePath(from: string, to: string): Promise<void> {
  // A case-only rename ("foo" → "Foo") is the same file on Windows: allowed, queued once.
  const sameFile = path.resolve(from).toLowerCase() === path.resolve(to).toLowerCase();
  const task = async () => {
    if (!sameFile && (await exists(to)))
      throw new HttpError(409, `"${path.basename(to)}" already exists there.`, "exists");
    await fs.mkdir(path.dirname(to), { recursive: true });
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(from, to);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        if (code === "EXDEV") {
          await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
          await fs.rm(from, { recursive: true, force: true });
          return;
        }
        if (!RETRY_CODES.has(code) || attempt >= 6) throw error;
        await new Promise((r) => setTimeout(r, 15 * 2 ** attempt));
      }
    }
  };
  return sameFile ? enqueue(from, task) : enqueue(from, () => enqueue(to, task));
}

/**
 * Write a new file, never replacing one: resolves false (and writes nothing) when `file` already
 * exists. For sidecars saved next to user files (a downloaded model's preview and info).
 */
export function writeFileIfAbsent(file: string, data: Uint8Array | string): Promise<boolean> {
  return enqueue(file, async () => {
    if (await exists(file)) return false;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = tmpName(file);
    await fs.writeFile(tmp, data);
    await renameWithRetry(tmp, file);
    return true;
  });
}

/* ── downloads ──────────────────────────────────────────────────────────────
 * A download is written to "<target>.part" next to where it lands (same drive, so finishing is
 * a rename) and appended to as bytes arrive, so an interrupted download resumes where it
 * stopped. Finishing moves it into place without ever replacing a file.
 */

export const PART_SUFFIX = ".part";

export interface PartFile {
  path: string;
  /** Bytes already in the file (0 for a fresh start). */
  offset: number;
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** Open `<target>.part`: appended to when `resume` and it exists, else started empty. */
export async function openPartFile(target: string, resume: boolean): Promise<PartFile> {
  const file = target + PART_SUFFIX;
  await fs.mkdir(path.dirname(file), { recursive: true });
  let offset = 0;
  if (resume)
    offset = await fs.stat(file).then(
      (s) => s.size,
      () => 0,
    );
  const handle = await fs.open(file, offset > 0 ? "a" : "w");
  return {
    path: file,
    offset,
    write: async (chunk) => {
      let done = 0;
      while (done < chunk.byteLength) {
        const { bytesWritten } = await handle.write(chunk, done, chunk.byteLength - done);
        done += bytesWritten;
      }
    },
    close: () => handle.close(),
  };
}

/** Move a finished `.part` into place at `target`, or a free name next to it. Returns the path. */
export async function commitPart(part: string, target: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const final = await freePath(target);
    try {
      await movePath(part, final);
      return final;
    } catch (error) {
      // Someone took the name between the check and the move: pick the next free one.
      if (!(error instanceof HttpError && error.code === "exists") || attempt >= 3) throw error;
    }
  }
}

/** Remove a download's own partial file (only ever a `.part`). */
export async function removePart(part: string): Promise<void> {
  if (!part.endsWith(PART_SUFFIX)) return;
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rm(part, { force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!RETRY_CODES.has(code) || attempt >= 6) throw error;
      await new Promise((r) => setTimeout(r, 15 * 2 ** attempt));
    }
  }
}

/** `target`, or "name (2).ext", "name (3).ext"… when it's taken. */
export async function freePath(target: string): Promise<string> {
  if (!(await exists(target))) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new HttpError(409, "Too many files with that name.", "exists");
}

/** Resolve `rel` inside `root`, refusing anything that escapes it. */
export function resolveInside(root: string, rel: string): string {
  const target = path.resolve(root, rel);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "Path is outside the allowed folder.", "path_outside");
  }
  return target;
}

export async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
