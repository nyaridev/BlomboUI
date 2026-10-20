/**
 * Your marks on an image, in the lightbox's details: stars, your own tags and the collections it
 * is in. They live in the profile database keyed by library + path (gallery service), so a
 * rebuilt index keeps them and the trash carries them along.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import {
  qk,
  useCollections,
  useGalleryTags,
  useRateImages,
  useTagImages,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Checkbox, IconButton, Popover, StarRating, TextField, toast } from "@client/ui";
import type { GalleryImage, ImageDetails } from "@shared/gallery";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function Marks({
  image,
  details,
}: {
  image: GalleryImage;
  details: ImageDetails | undefined;
}) {
  const rate = useRateImages();
  const tagImages = useTagImages();
  const [draft, setDraft] = useState("");
  const allTags = useGalleryTags().data ?? [];
  const tags = details?.tags ?? [];
  const suggestions = draft.trim()
    ? allTags
        .filter((t) => t.tag.includes(draft.trim().toLowerCase()) && !tags.includes(t.tag))
        .slice(0, 6)
    : [];

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return setDraft("");
    if (t.includes(",")) return toast("Tags can't contain commas.", "warning");
    tagImages.mutate({ ids: [image.id], add: [t] }, { onError: (e) => toast(e.message, "error") });
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <span className="w-16 text-xs text-fg-3">Rating</span>
        <StarRating
          value={image.rating}
          onChange={(rating) =>
            rate.mutate({ ids: [image.id], rating }, { onError: (e) => toast(e.message, "error") })
          }
          label="Your rating"
        />
        <span className="ml-auto text-2xs text-fg-4">1–5 · 0 clears</span>
      </div>
      <div className="flex items-start gap-2">
        <span className="w-16 pt-1 text-xs text-fg-3">Tags</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {tags.length ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-field pr-1 pl-2.5 text-xs text-fg-2"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => tagImages.mutate({ ids: [image.id], remove: [t] })}
                    className="grid h-4 w-4 place-items-center rounded-full text-fg-3 hover:bg-field-hover hover:text-fg focus-ring"
                  >
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addTag(draft);
            }}
          >
            <TextField
              size="sm"
              icon="tag"
              placeholder="Add a tag and press Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Add a tag"
            />
          </form>
          {suggestions.length ? (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <button
                  key={s.tag}
                  type="button"
                  onClick={() => addTag(s.tag)}
                  className="rounded-full border border-dashed border-line px-2 py-0.5 text-2xs text-fg-3 hover:border-line-strong hover:text-fg focus-ring"
                >
                  + {s.tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 text-xs text-fg-3">Albums</span>
        <CollectionsPicker image={image} inIds={details?.collections ?? []} />
      </div>
    </div>
  );
}

function CollectionsPicker({ image, inIds }: { image: GalleryImage; inIds: string[] }) {
  const collections = useCollections().data ?? [];
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const [name, setName] = useState("");
  const names = collections.filter((c) => inIds.includes(c.id)).map((c) => c.name);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.gallery(profileId) });

  const toggle = async (id: string, on: boolean) => {
    try {
      await api.collectImages(id, [image.id], !on);
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  const create = async () => {
    if (!name.trim()) return;
    try {
      const c = await api.createCollection(name.trim());
      await api.collectImages(c.id, [image.id]);
      setName("");
      void refresh();
      toast(`Added to “${c.name}”`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <Popover
      placement="bottom-start"
      className="w-64 p-1.5"
      trigger={
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line bg-field px-2 py-1 text-left text-xs text-fg-2 hover:border-line-strong focus-ring"
        >
          <Icon name="stack" size={13} className="shrink-0 text-fg-3" />
          <span className="truncate">
            {names.length ? names.join(", ") : "Add to a collection"}
          </span>
          <Icon name="chevron-down" size={11} className="ml-auto shrink-0 text-fg-3" />
        </button>
      }
    >
      <div className="flex flex-col gap-0.5">
        {collections.length === 0 ? (
          <span className="px-2 py-2 text-xs text-fg-3">No collections yet. Name one below.</span>
        ) : (
          collections.map((c) => (
            <div
              key={c.id}
              className="flex h-8 items-center gap-2 rounded-sm px-2 text-sm text-fg-2 hover:bg-field"
            >
              <div className="min-w-0 flex-1 truncate">
                <Checkbox
                  checked={inIds.includes(c.id)}
                  onCheckedChange={(on) => void toggle(c.id, on)}
                  label={c.name}
                />
              </div>
              <span className="font-mono text-2xs text-fg-4 tabular">{c.count}</span>
            </div>
          ))
        )}
        <form
          className="mt-1 flex items-center gap-1 border-t border-line pt-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <TextField
            size="sm"
            placeholder="New collection"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex-1"
            aria-label="New collection name"
          />
          <IconButton
            icon="plus"
            size="sm"
            type="submit"
            label="Create and add"
            disabled={!name.trim()}
          />
        </form>
      </div>
    </Popover>
  );
}
