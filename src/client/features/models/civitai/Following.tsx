/**
 * Models → Civitai → Following: the creators you follow down the left (add one by name, remove
 * one with ×), and their models on the right with the browser's filter (shared with Browse:
 * types, base model, period, category, search). "Everyone" merges each creator's newest models
 * (the server's feed, one page per creator); one creator lists all of theirs, newest first.
 */

import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useCivitaiFeed, useCivitaiModels } from "@client/lib/queries";
import { Avatar, Button, EmptyState, IconButton, TextField } from "@client/ui";
import type { BrowseFilter } from "@shared/civitai";
import { useState } from "react";
import { CardSkeletons, FilterBar, Results } from "./Browse";
import { useFollowing } from "./follow";
import { useCivitai } from "./state";

export function Following() {
  const filter = useCivitai((s) => s.filter);
  const picked = useCivitai((s) => s.creator);
  const { following, has } = useFollowing();
  const creator = picked && has(picked) ? picked : null;
  return (
    <div className="flex min-h-0 flex-1">
      <Creators creator={creator} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!filter ? (
          <CardSkeletons count={10} />
        ) : !following.length ? (
          <EmptyState
            icon="user"
            title="Follow creators to see their new models here"
            text="Press Follow next to a creator on a model's page or in the search bar, or add one by name on the left."
          />
        ) : (
          <>
            <FilterBar filter={filter} following />
            {creator ? (
              <CreatorResults creator={creator} filter={filter} />
            ) : (
              <FeedResults users={following} filter={filter} />
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
  const q = useCivitaiModels({ ...filter, username: creator, sort: "Newest" });
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

function Creators({ creator }: { creator: string | null }) {
  const pick = useCivitai((s) => s.pickCreator);
  const { following, follow, unfollow } = useFollowing();
  const [name, setName] = useState("");
  const row = (active: boolean) =>
    cn(
      "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-ring",
      active ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60 hover:text-fg",
    );
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
        <div className="flex">
          <button type="button" className={row(creator === null)} onClick={() => pick(null)}>
            <Icon name="user" size={15} className="shrink-0 text-fg-3" />
            <span className="flex-1 truncate">Everyone</span>
            <span className="font-mono text-2xs text-fg-3 tabular">{following.length}</span>
          </button>
        </div>
        {following.length ? <div className="mx-2 my-1 border-t border-line" /> : null}
        {following.map((f) => (
          <div key={f} className="group flex items-center">
            <button type="button" className={row(creator === f)} onClick={() => pick(f)}>
              <Avatar name={f} size={18} ring={false} />
              <span className="flex-1 truncate" title={f}>
                {f}
              </span>
            </button>
            <IconButton
              icon="x"
              size="xs"
              label={`Unfollow ${f}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              onClick={() => {
                unfollow(f);
                if (creator === f) pick(null);
              }}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
