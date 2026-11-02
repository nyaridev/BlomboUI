/**
 * Settings → Overview: the profile card. The picture and the name are edited in place: click (or
 * drop an image on) the circle to replace the picture, click the name to rename the profile.
 */
import { Icon } from "@client/icons/Icon";
import { ApiError, avatarUrl } from "@client/lib/api";
import { useUpdateProfile, useUploadAvatar } from "@client/lib/queries";
import { Avatar, Badge, Button, InlineInput, Panel, Spinner, toast } from "@client/ui";
import { THEME_LABELS } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { type DragEvent, useEffect, useRef, useState } from "react";

const failed = (error: unknown, fallback: string) =>
  toast(error instanceof ApiError ? error.message : fallback, "error");

export function ProfileCard({
  profile,
  since,
  onEditFolders,
}: {
  profile: Profile;
  /** When the profile's first run happened, in ms (from the job log). */
  since: number | null;
  onEditFolders: () => void;
}) {
  return (
    <Panel className="mb-6 flex items-center gap-5 p-5 max-lg:flex-wrap max-lg:gap-4 max-lg:p-4">
      <PictureButton profile={profile} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <NameField profile={profile} />
          <Badge tone="accent">{THEME_LABELS[profile.theme]}</Badge>
          {since ? (
            <span className="text-xs text-fg-3">
              generating since{" "}
              {new Date(since).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {(["models", "outputs", "wildcards"] as const).map((k) => (
            <div key={k} className="contents">
              <span className="text-fg-3 capitalize">{k}</span>
              <span className="truncate font-mono text-fg-2">{profile.paths[k] || "not set"}</span>
            </div>
          ))}
        </div>
      </div>
      <Button icon="edit" onClick={onEditFolders} className="max-lg:w-full">
        Edit folders
      </Button>
    </Panel>
  );
}

/** The avatar as a button: hover shows a camera, click or drop an image to replace it. */
function PictureButton({ profile }: { profile: Profile }) {
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
        <Avatar name={profile.name} src={avatarUrl(profile)} accent={profile.accent} size={64} />
        <span
          className={
            upload.isPending
              ? "absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white"
              : "absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          }
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
function NameField({ profile }: { profile: Profile }) {
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
      className="-ml-2"
    />
  );
}
