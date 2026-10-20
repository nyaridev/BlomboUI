/**
 * The launch screen: pick a profile or create one. Opening a profile morphs its avatar into the
 * header (shared layoutId) while the app staggers in (see app/Shell.tsx).
 */
import { preloadShell } from "@client/app/loadShell";
import { useTheme } from "@client/app/theme";
import { Icon } from "@client/icons/Icon";
import { Wordmark } from "@client/icons/Logo";
import { ApiError, api, avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { glide, snappy } from "@client/lib/motion";
import { useDeleteProfile, useProfiles, useSystem } from "@client/lib/queries";
import { leaveProfile, openProfileOnce } from "@client/lib/session";
import { Avatar, Button, Dialog, Kbd, Menu, Skeleton, toast } from "@client/ui";
import type { Profile } from "@shared/profile";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { ProfileWizard } from "./ProfileWizard";

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
    if (!wizard) setTheme({ theme: "blombo", accent: "blue", font: "geist", customFont: "" });
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
    <div className="relative flex h-full flex-col overflow-auto bg-bg">
      {/* backdrop: accent light from above + faint dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% -8%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)",
        }}
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-fg opacity-[.035]"
        aria-hidden="true"
      >
        <defs>
          <pattern id="grid-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />
      </svg>

      <header className="relative flex items-center justify-between px-8 py-6">
        <Wordmark />
        <div className="flex items-center gap-3 text-xs text-fg-3">
          {system.data ? <span className="font-mono">v{system.data.version}</span> : null}
          <Link
            to="/lab"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-field hover:text-fg focus-ring"
          >
            <Icon name="lab" size={14} />
            Design Lab
          </Link>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={glide}
          className="mb-10 text-center"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-fg">
            {profiles.length ? "Who's creating today?" : "Welcome to BlomboUI"}
          </h1>
          <p className="mt-2 text-base text-fg-3">
            {profiles.length
              ? "Each profile keeps its own folders, workflows and settings."
              : "Create a profile to set up your folders and ComfyUI. It takes a minute."}
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex gap-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[248px] w-[200px] rounded-xl" />
            ))}
          </div>
        ) : (
          <motion.ul
            className="flex flex-wrap justify-center gap-5"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          >
            {profiles.map((p) => (
              <motion.li
                key={p.id}
                variants={{
                  hidden: { opacity: 0, y: 14, scale: 0.97 },
                  show: { opacity: 1, y: 0, scale: 1, transition: snappy },
                }}
                className="relative"
              >
                <ProfileCard
                  profile={p}
                  opening={opening === p.id}
                  dimmed={opening !== null && opening !== p.id}
                  isLaunch={data?.registry.openOnLaunch === p.id}
                  onOpen={() => open(p)}
                  onSetLaunch={(on) => setLaunch(on ? p.id : null)}
                  onDelete={() => setConfirmDelete(p)}
                />
              </motion.li>
            ))}
            <motion.li
              variants={{
                hidden: { opacity: 0, y: 14 },
                show: { opacity: 1, y: 0, transition: snappy },
              }}
            >
              <button
                type="button"
                onClick={() => setWizard(true)}
                className={cn(
                  "group flex h-[248px] w-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line-strong text-fg-3 transition-all duration-200 focus-ring",
                  "hover:-translate-y-1 hover:border-accent/60 hover:bg-accent/5 hover:text-fg",
                  !profiles.length && "w-[260px] border-accent/50 bg-accent/5 text-fg",
                )}
              >
                <span className="grid h-[88px] w-[88px] place-items-center rounded-full border border-dashed border-line-strong transition-colors group-hover:border-accent/60 group-hover:text-accent-ink">
                  <Icon name="plus" size={30} strokeWidth={1.5} />
                </span>
                <span className="text-sm font-medium">
                  {profiles.length ? "New profile" : "Create your first profile"}
                </span>
              </button>
            </motion.li>
          </motion.ul>
        )}

        {profiles.length ? (
          <div className="mt-10 flex items-center gap-4 text-xs text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>1</Kbd>–<Kbd>9</Kbd> open a profile
            </span>
            <span className="h-3 w-px bg-line" />
            <span>Hover a card for options</span>
          </div>
        ) : null}
      </main>

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
      <KeyOpen profiles={profiles} onOpen={open} disabled={wizard} />
    </div>
  );
}

function KeyOpen({
  profiles,
  onOpen,
  disabled,
}: {
  profiles: Profile[];
  onOpen: (p: Profile) => void;
  disabled: boolean;
}) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && profiles[n - 1]) onOpen(profiles[n - 1] as Profile);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profiles, onOpen, disabled]);
  return null;
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
  return (
    <div
      data-accent={profile.accent}
      className={cn("group relative transition-opacity duration-300", dimmed && "opacity-30")}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "relative flex h-[248px] w-[200px] flex-col items-center gap-4 overflow-hidden rounded-xl border bg-surface pt-9 pb-5 transition-all duration-200 focus-ring",
          "border-line hover:-translate-y-1 hover:border-accent/60",
          "hover:shadow-[0_18px_40px_-16px_color-mix(in_oklab,var(--accent)_60%,transparent)]",
          opening && "-translate-y-1 border-accent",
        )}
      >
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-60 transition-opacity group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(70% 90% at 50% 0%, color-mix(in oklab, var(--accent) 30%, transparent), transparent)",
          }}
        />
        <motion.span layoutId={`avatar-${profile.id}`} transition={glide} className="relative">
          <Avatar
            name={profile.name}
            src={avatarUrl(profile, profile.lastOpenedAt ?? profile.createdAt)}
            accent={profile.accent}
            size={92}
          />
        </motion.span>
        <span className="relative flex flex-col items-center gap-1 px-3">
          <span className="max-w-[170px] truncate text-base font-semibold text-fg">
            {profile.name}
          </span>
          <span className="text-xs text-fg-3 tabular">
            {profile.stats.images.toLocaleString()} images
          </span>
          <span className="text-2xs text-fg-4">{timeAgo(profile.lastOpenedAt)}</span>
        </span>
        {isLaunch ? (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-accent/18 px-2 py-0.5 text-2xs font-medium text-accent-ink">
            <Icon name="bolt" size={11} />
            Auto-opens
          </span>
        ) : null}
      </button>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Menu
          placement="bottom-end"
          width={220}
          trigger={
            <button
              type="button"
              aria-label={`Options for ${profile.name}`}
              className="grid h-7 w-7 place-items-center rounded-md bg-black/30 text-fg-2 hover:bg-field hover:text-fg data-[open]:opacity-100 focus-ring"
            >
              <Icon name="more-horizontal" size={16} />
            </button>
          }
          items={[
            { id: "open", label: "Open", icon: "arrow-right", onSelect: onOpen },
            {
              id: "launch",
              label: isLaunch ? "Don't auto-open" : "Open on launch",
              icon: "bolt",
              onSelect: () => onSetLaunch(!isLaunch),
            },
            { type: "separator", id: "s1" },
            { id: "delete", label: "Delete…", icon: "trash", tone: "danger", onSelect: onDelete },
          ]}
        />
      </div>
    </div>
  );
}
