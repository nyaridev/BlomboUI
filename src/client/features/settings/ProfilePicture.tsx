/** Settings → Appearance: the profile picture, previewed as the profile screen shows it. */
import { ApiError, avatarUrl } from "@client/lib/api";
import { useRemoveAvatar, useUploadAvatar } from "@client/lib/queries";
import { Avatar, Button, Field, toast } from "@client/ui";
import type { Profile } from "@shared/profile";
import { type DragEvent, useRef } from "react";

export function ProfilePicture({ profile }: { profile: Profile }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const failed = (error: unknown) =>
    toast(error instanceof ApiError ? error.message : "Couldn't change the picture.", "error");

  const use = (file: File | undefined) => {
    if (file) upload.mutate({ id: profile.id, file }, { onError: failed });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) use(file);
  };

  return (
    <Field label="Profile picture" layout="left">
      <div className="flex items-end gap-4">
        <div
          className="relative h-[120px] w-[80px] overflow-hidden rounded-lg border border-line"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <Avatar
            shape="card"
            name={profile.name}
            src={avatarUrl(profile)}
            accent={profile.accent}
            size={80}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            icon="upload"
            loading={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            Choose image
          </Button>
          {profile.hasAvatar ? (
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending}
              onClick={() => remove.mutate(profile.id, { onError: failed })}
            >
              Remove
            </Button>
          ) : null}
        </div>
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
      </div>
    </Field>
  );
}
