/**
 * Models → Civitai → Following: the creators you follow down the left (add one by name, remove
 * one with ×, drag one or press Alt+↑/↓ to reorder), and their models on the right with the browser's filter (shared with Browse:
 * types, base model, sort, period, category, search, recent searches). "Everyone" merges each
 * creator's first page in the filter's order (the server's feed); one creator lists all of
 * theirs in that order.
 * A creator's name clicked anywhere opens them here, pinned at the top with Follow and ×, without
 * following them (`visit` in state.ts). Avatars are the saved pictures, or looked up once.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useCivitaiCreator, useCivitaiFeed, useCivitaiModels } from "@client/lib/queries";
import { DRAG_LIFT, moveItem, NO_DRAG, type Sortable, useSortableRow } from "@client/lib/sortable";
import { Avatar, Button, EmptyState, IconButton, TextField } from "@client/ui";
import type { BrowseFilter, CivitaiCreator } from "@shared/civitai";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CardSkeletons, FilterBar, Results } from "./Browse";
import { FollowButton, useFollowing } from "./follow";
import { useCivitai } from "./state";

export function Following() {
  const filter = useCivitai((s) => s.filter);
  const picked = useCivitai((s) => s.creator);
  const visiting = useCivitai((s) => s.visiting);
  const { following, has } = useFollowing();
  const users = useMemo(() => following.map((f) => f.username), [following]);
  const creator =
    picked && (has(picked) || picked.toLowerCase() === visiting?.toLowerCase()) ? picked : null;
  return (
    <div className="flex min-h-0 flex-1">
      <Creators creator={creator} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!filter ? (
          <CardSkeletons count={10} />
        ) : !following.length && !creator ? (
          <EmptyState
            icon="user"
            title="Follow creators to see their new models here"
            text="Click a creator's name on a model's page to look at their models, then press Follow. Or add one by name on the left."
          />
        ) : (
          <>
            <FilterBar filter={filter} following={creator ?? true} />
            {creator ? (
              <CreatorResults creator={creator} filter={filter} />
            ) : (
              <FeedResults users={users} filter={filter} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FeedResults({ users, filter }: { users: string[]; filter: BrowseFilter }) {
  const q = useCivitaiFeed(users, filter);
  return <Results q={q} empty={<NothingNew />} />;
}

function CreatorResults({ creator, filter }: { creator: string; filter: BrowseFilter }) {
  const q = useCivitaiModels({ ...filter, username: creator });
  return <Results q={q} empty={<NothingNew creator={creator} />} />;
}

function NothingNew({ creator }: { creator?: string }) {
  const setFilter = useCivitai((s) => s.setFilter);
  return (
    <EmptyState
      icon="search"
      title={creator ? `Nothing from ${creator} matches` : "Nothing new matches"}
      text="The filter above applies here too. Try fewer types, another category or a longer period."
      action={
        <Button
          onClick={() =>
            setFilter({ query: "", types: [], baseModels: [], tag: "", period: "AllTime" })
          }
        >
          Show everything
        </Button>
      }
    />
  );
}

const rowClass = (active: boolean) =>
  cn(
    "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-ring",
    active ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60 hover:text-fg",
  );

function Creators({ creator }: { creator: string | null }) {
  const pick = useCivitai((s) => s.pickCreator);
  const visiting = useCivitai((s) => s.visiting);
  const endVisit = useCivitai((s) => s.endVisit);
  const { following, has, follow, unfollow, reorder } = useFollowing();
  const [name, setName] = useState("");
  const is = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();
  // While a drag runs, the new order stays here and is saved once on drop: a save per swap
  // would have each answer put an older order back under the pointer.
  const [draft, setDraft] = useState<CivitaiCreator[] | null>(null);
  const list = draft ?? following;
  const sortable = useSortableRow(list.length, (from, to) =>
    setDraft((d) => moveItem(d ?? following, from, to)),
  );
  const dragging = list.some((_, i) => sortable(i).dragging);
  useEffect(() => {
    if (!draft || dragging) return;
    const order = (l: CivitaiCreator[]) => l.map((f) => f.username).join("\n");
    if (order(draft) !== order(following)) reorder(draft);
    setDraft(null);
  }, [draft, dragging, following, reorder]);
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line max-lg:w-44">
      <form
        className="border-b border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && follow(name.trim())) setName("");
        }}
      >
        <TextField
          size="sm"
          icon="plus"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Follow by username"
          aria-label="Follow a creator by Civitai username"
          // Not a login: keep password managers (Bitwarden, 1Password, LastPass) out of it.
          autoComplete="off"
          data-bwignore
          data-1p-ignore
          data-lpignore="true"
        />
      </form>
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-1.5">
        {visiting && !has(visiting) ? (
          <div className="mb-1 flex flex-col gap-1 border-b border-line pb-2">
            <span className="px-2 pt-1 label-caps">Looking at</span>
            <CreatorRow
              creator={{ username: visiting, image: null }}
              active={is(creator, visiting)}
              onPick={() => pick(visiting)}
              end={<IconButton icon="x" size="xs" label={`Close ${visiting}`} onClick={endVisit} />}
              follow
            />
          </div>
        ) : null}
        <div className="flex">
          <button type="button" className={rowClass(creator === null)} onClick={() => pick(null)}>
            <Icon name="user" size={15} className="shrink-0 text-fg-3" />
            <span className="flex-1 truncate">Everyone</span>
            <span className="font-mono text-2xs text-fg-3 tabular">{following.length}</span>
          </button>
        </div>
        {following.length ? <div className="mx-2 my-1 border-t border-line" /> : null}
        {list.map((f, i) => (
          <CreatorRow
            key={f.username}
            creator={f}
            active={is(creator, f.username)}
            onPick={() => pick(f.username)}
            sortable={sortable(i)}
            end={
              <IconButton
                icon="x"
                size="xs"
                label={`Unfollow ${f.username}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => {
                  unfollow(f.username);
                  if (is(creator, f.username)) pick(null);
                }}
              />
            }
          />
        ))}
      </div>
    </aside>
  );
}

/**
 * One creator: their avatar (saved, or looked up once while none is saved) and name; dimmed when
 * Civitai has no models by that name. `follow` adds a Follow chip (the creator you're looking at).
 */
function CreatorRow({
  creator,
  active,
  onPick,
  end,
  follow,
  sortable,
}: {
  creator: CivitaiCreator;
  active: boolean;
  onPick: () => void;
  end: ReactNode;
  follow?: boolean;
  /** A followed creator: the row drags into another place (Alt+↑/↓ on it too). */
  sortable?: Sortable;
}) {
  const looked = useCivitaiCreator(creator.image ? null : creator.username);
  const missing = looked.data === null;
  const image = creator.image ?? looked.data?.image ?? null;
  return (
    <div
      ref={sortable?.ref}
      {...sortable?.handle}
      className={cn(
        "group flex flex-col gap-1 rounded-md transition-[scale,box-shadow] duration-150",
        sortable?.dragging && cn(DRAG_LIFT, "bg-surface-2"),
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          className={cn(rowClass(active), missing && "text-fg-3")}
          onClick={onPick}
          onKeyDown={sortable?.onKeyDown}
          aria-keyshortcuts={sortable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
          title={missing ? `Civitai has no models by ${creator.username}` : creator.username}
        >
          <Avatar name={creator.username} src={image} size={18} ring={false} />
          <span className="flex-1 truncate">{looked.data?.username ?? creator.username}</span>
          {missing ? <Icon name="info" size={13} className="shrink-0 text-fg-4" /> : null}
        </button>
        <span {...{ [NO_DRAG]: "" }} className="flex">
          {end}
        </span>
      </div>
      {follow ? (
        <div className="pl-8">
          <FollowButton name={looked.data?.username ?? creator.username} image={image} />
        </div>
      ) : null}
    </div>
  );
}
