/**
 * Following Civitai creators: the list lives in the profile's settings (`civitai.following`), each
 * with their name as Civitai spells it and their picture once known, so names and avatars stay
 * when the window, the browser or the app changes. Follow from a model page, a creator you're
 * looking at in Following, the search bar's creator, or by name in the Following tab. Pictures
 * come from `useCivitaiCreator` (the server saves them with a followed creator).
 */
import { qk, useSettings, useUpdateSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Chip, toast } from "@client/ui";
import { type CivitaiCreator, CivitaiUsername } from "@shared/civitai";
import { useQueryClient } from "@tanstack/react-query";

const NONE: CivitaiCreator[] = [];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function useFollowing() {
  const following = useSettings().data?.civitai.following ?? NONE;
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const save = (list: CivitaiCreator[]) =>
    update.mutate({ civitai: { following: list } }, { onError: (e) => toast(e.message, "error") });
  const has = (name: string) => following.some((f) => same(f.username, name));
  return {
    following,
    has,
    /**
     * Returns false (and says why) when the name isn't a Civitai username. `image` is the picture
     * when it's already known (a model page has it).
     */
    follow: (name: string, image: string | null = null): boolean => {
      const ok = CivitaiUsername.safeParse(name);
      if (!ok.success) {
        toast(ok.error.issues[0]?.message ?? "That isn't a Civitai username.", "error");
        return false;
      }
      if (!has(ok.data))
        void update
          .mutateAsync({ civitai: { following: [...following, { username: ok.data, image }] } })
          .then(
            () => {
              // A lookup that ran before this was saved had nothing to update; ask again so the
              // server keeps the picture and Civitai's spelling.
              if (!image)
                void qc.invalidateQueries({ queryKey: qk.civitaiCreator(profileId, ok.data) });
            },
            (e: Error) => toast(e.message, "error"),
          );
      return true;
    },
    /** The list in a new order (dragged in the Following tab). */
    reorder: (list: CivitaiCreator[]) => save(list),
    /** Says so with an Undo, which puts the list back as it was. */
    unfollow: (name: string) => {
      save(following.filter((f) => !same(f.username, name)));
      toast(`Unfollowed ${name}`, "info", { label: "Undo", run: () => save(following) });
    },
  };
}

/** Follow / Following for one creator. */
export function FollowButton({ name, image }: { name: string; image?: string | null }) {
  const f = useFollowing();
  const on = f.has(name);
  return (
    <Chip
      size="sm"
      icon={on ? "check" : "plus"}
      selected={on}
      onClick={() => {
        if (on) f.unfollow(name);
        else if (f.follow(name, image ?? null)) toast(`Following ${name}`, "success");
      }}
    >
      {on ? "Following" : "Follow"}
    </Chip>
  );
}
