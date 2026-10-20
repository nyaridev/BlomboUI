/**
 * Prompt snippets: reusable fragments ("masterpiece, best quality", a character's look) saved
 * in the profile's snippets.json. Human-readable state, so it's a JSON file next to
 * settings.json rather than a database table (ADR-0006).
 */
import path from "node:path";
import { type SaveSnippetBody, type Snippet, SnippetsFile } from "../../shared/history.ts";
import { slugId } from "../../shared/settings.ts";
import { readJsonFile, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";

export class SnippetService {
  private readonly profiles: ProfileService;

  constructor(profiles: ProfileService) {
    this.profiles = profiles;
  }

  private file(): string {
    const id = this.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return path.join(this.profiles.dir(id), "snippets.json");
  }

  async list(): Promise<Snippet[]> {
    try {
      return (await readJsonFile(this.file(), SnippetsFile, {})).snippets;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        500,
        "snippets.json couldn't be read. Fix or remove it in the profile folder.",
        "bad_snippets",
      );
    }
  }

  /** Add a snippet, or replace the one with the same id. */
  async save(body: SaveSnippetBody): Promise<Snippet> {
    const list = await this.list();
    let id = body.id;
    if (!id || !list.some((s) => s.id === id)) {
      const base = slugId(body.name, "snippet");
      id = base;
      for (let n = 2; list.some((s) => s.id === id); n++) id = `${base}-${n}`;
    }
    const snippet: Snippet = { id, name: body.name, text: body.text };
    const next = list.some((s) => s.id === id)
      ? list.map((s) => (s.id === id ? snippet : s))
      : [...list, snippet];
    if (next.length > 500)
      throw new HttpError(400, "That's 500 snippets already. Remove some first.", "too_many");
    await writeJsonAtomic(this.file(), { format: "blombo.snippets/1", snippets: next });
    return snippet;
  }

  async remove(id: string): Promise<void> {
    const list = await this.list();
    if (!list.some((s) => s.id === id))
      throw new HttpError(404, "That snippet is already gone.", "no_snippet");
    await writeJsonAtomic(this.file(), {
      format: "blombo.snippets/1",
      snippets: list.filter((s) => s.id !== id),
    });
  }
}
