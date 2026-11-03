/**
 * The launch screen: pick a profile or create one. Each profile is a portrait card filled with
 * its picture, so a generated image can stand in for the profile.
 */
import { preloadShell } from "@client/app/loadShell";
import { useTheme } from "@client/app/theme";
import { Icon } from "@client/icons/Icon";
import { ApiError, api, avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { glide } from "@client/lib/motion";
import { openWindow } from "@client/lib/platform";
import { useDeleteProfile, useProfiles, useSystem } from "@client/lib/queries";
import { leaveProfile, openProfileOnce } from "@client/lib/session";
import { Avatar, Button, Dialog, Menu, type MenuEntry, openContextMenu, toast } from "@client/ui";
import type { Profile } from "@shared/profile";
import { DEFAULT_UI_FONT } from "@shared/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { ProfileWizard } from "./ProfileWizard";

const REPO = "https://github.com/nyaridev/BlomboUI";

// 2:3, the shape of a portrait SDXL image, so generated pictures fill the card without cropping.
const CARD = "h-[336px] w-[224px]";

function timeAgo(iso: string | null): string {
  if (!iso) return "never opened";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "opened just now";
  if (s < 3600) return `opened ${Math.round(s / 60)}m ago`;
  if (s < 86400) return `opened ${Math.round(s / 3600)}h ago`;
  return `opened ${Math.round(s / 86400)}d ago`;
}

export function ProfileScreen() {
  const { data, isLoading } = useProfiles();
  const system = useSystem();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setTheme = useTheme((s) => s.set);
  const [wizard, setWizard] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const remove = useDeleteProfile();
  const profiles = data?.profiles ?? [];

  useEffect(() => preloadShell(), []);

  useEffect(() => {
    if (!wizard)
      setTheme({
        theme: "blombo",
        accent: "blue",
        font: DEFAULT_UI_FONT,
        customFont: "",
        contrast: false,
      });
  }, [wizard, setTheme]);

  const open = async (p: Profile) => {
    if (opening) return;
    setOpening(p.id);
    try {
      leaveProfile();
      await openProfileOnce(p.id);
      setTheme({ theme: p.theme, accent: p.accent });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      navigate({ to: "/p/$profileId", params: { profileId: p.id } });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Couldn't open that profile.", "error");
      setOpening(null);
    }
  };

  const setLaunch = async (id: string | null) => {
    await api.setOpenOnLaunch(id);
    await qc.invalidateQueries({ queryKey: ["profiles"] });
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-bg">
      <main className="flex flex-1 items-center justify-center p-8">
        {/* The local list answers in milliseconds: placeholders would only flash. */}
        {isLoading ? null : (
          <motion.ul
            className="flex max-w-6xl flex-wrap justify-center gap-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={glide}
          >
            {profiles.map((p) => (
              <li key={p.id}>
                <ProfileCard
                  profile={p}
                  opening={opening === p.id}
                  dimmed={opening !== null && opening !== p.id}
                  isLaunch={data?.registry.openOnLaunch === p.id}
                  onOpen={() => open(p)}
                  onSetLaunch={(on) => setLaunch(on ? p.id : null)}
                  onDelete={() => setConfirmDelete(p)}
                />
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setWizard(true)}
                className={cn(
                  CARD,
                  "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong text-fg-3 transition-colors hover:border-accent/60 hover:text-fg focus-ring",
                )}
              >
                <Icon name="plus" size={28} strokeWidth={1.5} />
                <span className="text-sm font-medium">New profile</span>
              </button>
            </li>
          </motion.ul>
        )}
      </main>

      <footer className="flex shrink-0 justify-end px-4 pb-3">
        {system.data ? (
          <Button
            variant="ghost"
            size="sm"
            iconRight="github"
            className="font-mono"
            aria-label={`BlomboUI v${system.data.version} on GitHub`}
            onClick={() => openWindow(REPO, "BlomboUI on GitHub")}
          >
            v{system.data.version}
          </Button>
        ) : null}
      </footer>

      <ProfileWizard
        open={wizard}
        onOpenChange={setWizard}
        onCreated={(p) => {
          setWizard(false);
          void open(p);
        }}
      />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="The profile folder moves to data/trash, so you can restore it by hand. Your models, outputs and wildcards are not touched."
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={remove.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                await remove.mutateAsync(confirmDelete.id);
                toast(`Moved "${confirmDelete.name}" to trash`, "success");
                setConfirmDelete(null);
              }}
            >
              Delete profile
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          Workflows, layouts and settings of this profile go with it.
        </p>
      </Dialog>
    </div>
  );
}

function ProfileCard({
  profile,
  opening,
  dimmed,
  isLaunch,
  onOpen,
  onSetLaunch,
  onDelete,
}: {
  profile: Profile;
  opening: boolean;
  dimmed: boolean;
  isLaunch: boolean;
  onOpen: () => void;
  onSetLaunch: (on: boolean) => void;
  onDelete: () => void;
}) {
  // The ⋯ button and a right-click show the same menu.
  const items: MenuEntry[] = [
    { id: "open", label: "Open", icon: "arrow-right", onSelect: onOpen },
    {
      id: "launch",
      label: isLaunch ? "Don't auto-open" : "Open on launch",
      icon: "bolt",
      onSelect: () => onSetLaunch(!isLaunch),
    },
    { type: "separator", id: "s1" },
    { id: "delete", label: "Delete…", icon: "trash", tone: "danger", onSelect: onDelete },
  ];
  return (
    <div
      data-accent={profile.accent}
      onContextMenu={(e) => openContextMenu(e, items)}
      className={cn("group relative transition-opacity duration-150", dimmed && "opacity-30")}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          CARD,
          "relative block overflow-hidden rounded-xl border bg-surface text-left transition-colors focus-ring",
          opening ? "border-accent" : "border-line group-hover:border-accent/80",
        )}
      >
        <Avatar
          shape="card"
          name={profile.name}
          src={avatarUrl(profile)}
          accent={profile.accent}
          size={224}
          className="transition-transform duration-200 ease-out group-hover:scale-[1.04]"
        />
        {/* Scrims keep the name and the menu readable on any picture. */}
        <span className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/50 to-transparent opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100" />
        <span className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/85 via-black/45 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4">
          <span className="truncate text-base font-semibold text-white">{profile.name}</span>
          <span className="truncate text-xs text-white/70 tabular">
            {profile.stats.images.toLocaleString()} images · {timeAgo(profile.lastOpenedAt)}
          </span>
        </span>
        {isLaunch ? (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-xs bg-black/55 px-1.5 py-0.5 text-2xs font-medium text-white">
            <Icon name="bolt" size={11} />
            Auto-opens
          </span>
        ) : null}
      </button>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 focus-within:opacity-100">
        <Menu
          placement="bottom-end"
          width={220}
          trigger={
            <button
              type="button"
              aria-label={`Options for ${profile.name}`}
              className="grid h-7 w-7 place-items-center rounded-md bg-black/40 text-white hover:bg-black/60 focus-ring"
            >
              <Icon name="more-horizontal" size={16} />
            </button>
          }
          items={items}
        />
      </div>
    </div>
  );
}
