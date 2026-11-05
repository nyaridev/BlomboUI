/**
 * Following Civitai creators: the list lives in the profile's settings (`civitai.following`), so
 * the names stay when the window, the browser or the app changes. Follow from the search bar's
 * creator, a model page, or by name in the Following tab.
 */
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Chip, toast } from "@client/ui";
import { CivitaiUsername } from "@shared/civitai";

const NONE: string[] = [];

export function useFollowing() {
  const following = useSettings().data?.civitai.following ?? NONE;
  const update = useUpdateSettings();
  const save = (list: string[]) =>
    update.mutate({ civitai: { following: list } }, { onError: (e) => toast(e.message, "error") });
  const has = (name: string) => following.some((f) => f.toLowerCase() === name.toLowerCase());
  return {
    following,
    has,
    /** Returns false (and says why) when the name isn't a Civitai username. */
    follow: (name: string): boolean => {
      const ok = CivitaiUsername.safeParse(name);
      if (!ok.success) {
        toast(ok.error.issues[0]?.message ?? "That isn't a Civitai username.", "error");
        return false;
      }
      if (!has(ok.data)) save([...following, ok.data]);
      return true;
    },
    /** Says so with an Undo, which puts the list back as it was. */
    unfollow: (name: string) => {
      save(following.filter((f) => f.toLowerCase() !== name.toLowerCase()));
      toast(`Unfollowed ${name}`, "info", { label: "Undo", run: () => save(following) });
    },
  };
}

/** Follow / Following for one creator. */
export function FollowButton({ name }: { name: string }) {
  const f = useFollowing();
  const on = f.has(name);
  return (
    <Chip
      size="sm"
      icon={on ? "check" : "plus"}
      selected={on}
      onClick={() => {
        if (on) f.unfollow(name);
        else if (f.follow(name)) toast(`Following ${name}`, "success");
      }}
    >
      {on ? "Following" : "Follow"}
    </Chip>
  );
}
