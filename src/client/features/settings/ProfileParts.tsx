/**
 * Settings → Overview: the profile's pieces. The picture and the name are edited in place: click
 * (or drop an image on) the picture to replace it, click the name to rename the profile.
 */
import { Icon } from "@client/icons/Icon";
import { ApiError, avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useUpdateProfile, useUploadAvatar } from "@client/lib/queries";
import { Avatar, Badge, InlineInput, Spinner, toast } from "@client/ui";
import { THEME_LABELS } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { type DragEvent, useEffect, useRef, useState } from "react";

const failed = (error: unknown, fallback: string) =>
  toast(error instanceof ApiError ? error.message : fallback, "error");

/** "generating since …" from the first run in the job log (ms), or nothing before one. */
export function Since({ since }: { since: number | null }) {
  if (!since) return null;
  return (
    <span className="text-xs text-fg-3">
      generating since {new Date(since).toLocaleDateString(undefined, { dateStyle: "medium" })}
    </span>
  );
}

export function ThemeBadge({ profile }: { profile: Profile }) {
  return <Badge tone="accent">{THEME_LABELS[profile.theme]}</Badge>;
}

const FOLDERS = ["models", "outputs", "wildcards"] as const;

/** The profile's main folders on one line: label + name (+ how many more), the paths on hover. */
export function Folders({ profile }: { profile: Profile }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-0.5 text-xs">
      {FOLDERS.map((k) => {
        const list = profile.folders[k];
        return (
          <span
            key={k}
            className="flex min-w-0 gap-1.5"
            title={list.map((f) => f.path).join("\n") || undefined}
          >
            <span className="text-fg-3 capitalize">{k}</span>
            <span className="truncate font-mono text-fg-2">{list[0]?.name ?? "not set"}</span>
            {list.length > 1 ? <span className="text-fg-4">+{list.length - 1}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** The picture as a button: hover shows a camera, click or drop an image to replace it. */
export function PictureButton({ profile, size = 64 }: { profile: Profile; size?: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const use = (file: File | undefined) => {
    if (file?.type.startsWith("image/"))
      upload.mutate(
        { id: profile.id, file },
        { onError: (e) => failed(e, "Couldn't change the picture.") },
      );
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    use(e.dataTransfer.files[0]);
  };
  return (
    <>
      <button
        type="button"
        aria-label="Change the profile picture"
        title="Change the picture"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="group relative shrink-0 rounded-full focus-ring"
      >
        <Avatar name={profile.name} src={avatarUrl(profile)} accent={profile.accent} size={size} />
        <span
          className={cn(
            "absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white",
            !upload.isPending &&
              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          {upload.isPending ? <Spinner size={18} /> : <Icon name="camera" size={20} />}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          use(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** The name, editable in place: Enter or leaving the field saves, Escape puts it back. */
export function NameField({
  profile,
  className = "-ml-2",
}: {
  profile: Profile;
  className?: string;
}) {
  const update = useUpdateProfile();
  const [draft, setDraft] = useState(profile.name);
  // Escape blurs the field too; this tells the blur not to save.
  const cancelled = useRef(false);
  useEffect(() => setDraft(profile.name), [profile.name]);

  const commit = () => {
    const name = draft.trim();
    if (cancelled.current || !name || name === profile.name) {
      cancelled.current = false;
      setDraft(profile.name);
      return;
    }
    update.mutate(
      { id: profile.id, body: { name } },
      {
        onError: (e) => {
          setDraft(profile.name);
          failed(e, "Couldn't rename the profile.");
        },
      },
    );
  };

  return (
    <InlineInput
      size="lg"
      value={draft}
      maxLength={40}
      aria-label="Profile name"
      title="Rename the profile"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}
