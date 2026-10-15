/**
 * Settings → Folders: the profile's models, outputs and wildcards folders. The gallery, Models
 * and the Wildcard Manager read from these; a managed ComfyUI needs a restart to see a new
 * models folder (the header says so).
 */
import { useUpdateProfile } from "@client/lib/queries";
import { Button, Field, toast } from "@client/ui";
import type { Profile } from "@shared/profile";
import { useEffect, useState } from "react";
import { FolderField } from "../profiles/FolderField";

export function FoldersPage({ profile }: { profile: Profile | undefined }) {
  const update = useUpdateProfile();
  const [paths, setPaths] = useState(profile?.paths ?? { models: "", outputs: "", wildcards: "" });
  useEffect(() => {
    if (profile) setPaths(profile.paths);
  }, [profile]);
  const dirty =
    profile &&
    (paths.models !== profile.paths.models ||
      paths.outputs !== profile.paths.outputs ||
      paths.wildcards !== profile.paths.wildcards);
  const save = () => {
    if (!profile) return;
    update.mutate(
      {
        id: profile.id,
        body: {
          paths: {
            models: paths.models.trim(),
            outputs: paths.outputs.trim(),
            wildcards: paths.wildcards.trim(),
          },
        },
      },
      {
        onSuccess: () => toast("Folders saved", "success"),
        onError: (e) => toast(e.message, "error"),
      },
    );
  };
  return (
    <div className="flex flex-col gap-8">
      <Field
        label="Models"
        layout="left"
        hint="The folder with checkpoints/, loras/, vae/… ComfyUI reads it at start, so a managed ComfyUI restarts to use a new one."
      >
        {(id) => (
          <FolderField
            id={id}
            value={paths.models}
            onChange={(models) => setPaths((p) => ({ ...p, models }))}
            pickTitle="Choose your models folder"
            placeholder="D:\AI\Models"
            expectModels
          />
        )}
      </Field>
      <Field
        label="Outputs"
        layout="left"
        hint="Where generated images are saved. The gallery shows this folder first."
      >
        {(id) => (
          <FolderField
            id={id}
            value={paths.outputs}
            onChange={(outputs) => setPaths((p) => ({ ...p, outputs }))}
            pickTitle="Choose where images are saved"
            placeholder="D:\AI\Outputs"
          />
        )}
      </Field>
      <Field
        label="Wildcards"
        layout="left"
        hint=".txt and .yaml files for __wildcards__ in prompts."
      >
        {(id) => (
          <FolderField
            id={id}
            value={paths.wildcards}
            onChange={(wildcards) => setPaths((p) => ({ ...p, wildcards }))}
            pickTitle="Choose your wildcards folder"
            placeholder="D:\AI\Wildcards"
          />
        )}
      </Field>
      <div className="flex gap-2 pl-[204px]">
        <Button variant="primary" disabled={!dirty} loading={update.isPending} onClick={save}>
          Save folders
        </Button>
        {dirty ? (
          <Button variant="ghost" onClick={() => profile && setPaths(profile.paths)}>
            Undo changes
          </Button>
        ) : null}
      </div>
    </div>
  );
}
