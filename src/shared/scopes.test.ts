import { describe, expect, it } from "vitest";
import {
  autoScopes,
  cleanKey,
  effectivePick,
  keyLabel,
  newScopeId,
  pickPicture,
  pictureKey,
  promptTags,
  type ScopeDef,
  ScopesFile,
  togglePick,
} from "./scopes.ts";

const SKIRT = "aaaaaaaaaaaa";
const HIGHS = "bbbbbbbbbbbb";
const ANIME = "cccccccccccc";
const PHOTO = "dddddddddddd";
const scopes: ScopeDef[] = [
  { id: SKIRT, name: "Skirt", group: "", tags: ["skirt", "miniskirt"] },
  { id: HIGHS, name: "Thighhighs", group: "", tags: ["thighhighs"] },
  { id: ANIME, name: "Anime", group: "Style", tags: ["anime", "anime coloring"] },
  { id: PHOTO, name: "Photo", group: "Style", tags: ["photorealistic"] },
];
const pic = (key: string, mtime = 1) => ({ key, mtime });

describe("picture keys", () => {
  it("sorts ids, so a combination has one name whatever order it was picked in", () => {
    expect(pictureKey([HIGHS, SKIRT])).toBe(`${SKIRT}+${HIGHS}`);
    expect(pictureKey([])).toBe("global");
    expect(cleanKey(`${HIGHS}+${SKIRT}`)).toBe(`${SKIRT}+${HIGHS}`);
    expect(cleanKey(undefined)).toBe("global");
    expect(cleanKey("GLOBAL")).toBe("global");
    for (const bad of ["../x", `${SKIRT}+${SKIRT}`, "abc", `${SKIRT}+`, "thumb"])
      expect(cleanKey(bad)).toBeNull();
    expect(
      cleanKey(
        Array(7)
          .fill(SKIRT)
          .map((s, i) => s.slice(0, 11) + i)
          .join("+"),
      ),
    ).toBeNull();
    expect(newScopeId()).toMatch(/^[a-f0-9]{12}$/);
    expect(keyLabel(`${HIGHS}+${SKIRT}`, scopes)).toBe("Skirt + Thighhighs");
    expect(keyLabel(`eeeeeeeeeeee`, scopes)).toBe("Unknown scope");
  });
});

describe("pickPicture", () => {
  const all = [pic(SKIRT), pic(HIGHS), pic(`${SKIRT}+${HIGHS}`), pic("global")];

  it("shows nothing scoped while no scope is picked", () => {
    expect(pickPicture(all, [])).toBeNull();
  });

  it("prefers the exact picture, then one with the fewest other scopes", () => {
    expect(pickPicture(all, [SKIRT])?.key).toBe(SKIRT);
    expect(pickPicture([pic(`${SKIRT}+${HIGHS}`)], [SKIRT])?.key).toBe(`${SKIRT}+${HIGHS}`);
    expect(pickPicture(all, [SKIRT, HIGHS])?.key).toBe(`${SKIRT}+${HIGHS}`);
  });

  it("needs every required scope; optional ones only rank", () => {
    expect(pickPicture([pic(SKIRT), pic(HIGHS)], [SKIRT, HIGHS])).toBeNull();
    expect(pickPicture([pic(SKIRT), pic(HIGHS)], [SKIRT, HIGHS], [HIGHS])?.key).toBe(SKIRT);
    expect(pickPicture(all, [SKIRT, HIGHS], [HIGHS])?.key).toBe(`${SKIRT}+${HIGHS}`);
    // All optional: any one of them will do.
    expect(pickPicture([pic(HIGHS)], [SKIRT, HIGHS], [SKIRT, HIGHS])?.key).toBe(HIGHS);
    expect(pickPicture([pic(ANIME)], [SKIRT], [SKIRT])).toBeNull();
  });

  it("takes the newest of equal matches", () => {
    expect(
      pickPicture([pic(`${SKIRT}+${ANIME}`, 1), pic(`${SKIRT}+${PHOTO}`, 5)], [SKIRT])?.key,
    ).toBe(`${SKIRT}+${PHOTO}`);
  });
});

describe("picking and Auto", () => {
  it("replaces a scope of the same group and toggles off", () => {
    const view = { ids: [SKIRT, ANIME], optional: [ANIME], auto: false };
    expect(togglePick(view, PHOTO, scopes)).toEqual({
      ids: [SKIRT, PHOTO],
      optional: [],
      auto: false,
    });
    expect(togglePick(view, SKIRT, scopes)).toEqual({
      ids: [ANIME],
      optional: [ANIME],
      auto: false,
    });
    expect(togglePick(view, HIGHS, scopes).ids).toEqual([SKIRT, ANIME, HIGHS]);
  });

  it("reads scopes from the prompt's tags, one per group", () => {
    expect([...promptTags("(Miniskirt:1.2), <lora:x:1>, thigh_highs BREAK anime")]).toEqual([
      "miniskirt",
      "thigh highs",
      "anime",
    ]);
    expect(autoScopes("1girl, miniskirt, thighhighs, anime, photorealistic", scopes)).toEqual([
      SKIRT,
      HIGHS,
      ANIME,
    ]);
    expect(autoScopes("", scopes)).toEqual([]);
  });

  it("shows nothing scoped while scopes are off, and Auto's picks are optional", () => {
    const file = ScopesFile.parse({ scopes, view: { ids: [SKIRT] } });
    expect(effectivePick(file, "")).toEqual({ ids: [], optional: [] });
    expect(effectivePick({ ...file, enabled: true }, "")).toEqual({ ids: [SKIRT], optional: [] });
    const auto = { ...file, enabled: true, view: { ...file.view, auto: true } };
    expect(effectivePick(auto, "skirt, thighhighs")).toEqual({
      ids: [SKIRT, HIGHS],
      optional: [SKIRT, HIGHS],
    });
    // A picked scope that was deleted is left out.
    const gone = {
      ...file,
      enabled: true,
      view: { ids: ["eeeeeeeeeeee"], optional: [], auto: false },
    };
    expect(effectivePick(gone, "")).toEqual({ ids: [], optional: [] });
  });
});
