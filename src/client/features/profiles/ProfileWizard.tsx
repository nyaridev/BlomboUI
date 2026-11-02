/**
 * Create-profile wizard (ADR-0006): profile → folders → ComfyUI → look & workflows.
 * Folders come from one folder (Models, Output and Wildcards inside it, made when missing) or
 * one by one; only the three paths are saved. ComfyUI is a managed install or your own folder.
 */
import { useTheme } from "@client/app/theme";
import { Icon, type IconName } from "@client/icons/Icon";
import { ApiError, api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useDebounced } from "@client/lib/hooks";
import { snappy } from "@client/lib/motion";
import { useCreateProfile, usePresets, useUploadAvatar } from "@client/lib/queries";
import {
  Avatar,
  Button,
  Checkbox,
  Dialog,
  Field,
  IconButton,
  Notice,
  Segmented,
  Select,
  TextField,
  toast,
} from "@client/ui";
import { ACCENTS, type AccentId, THEME_LABELS, THEMES, type ThemeId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { WORKFLOW_KIND_LABELS, WORKFLOW_KINDS } from "@shared/workflow/manifest";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { FolderField } from "./FolderField";
import { OwnComfyNotice } from "./OwnComfyNotice";

const STEPS: Array<{ id: string; title: string; icon: IconName }> = [
  { id: "you", title: "Profile", icon: "user" },
  { id: "folders", title: "Folders", icon: "folder" },
  { id: "comfy", title: "ComfyUI", icon: "workflow" },
  { id: "start", title: "Look and workflows", icon: "sparkle" },
];

const SUBFOLDERS = [
  { key: "models", name: "Models" },
  { key: "outputs", name: "Output" },
  { key: "wildcards", name: "Wildcards" },
] as const;

/** `root` + `name` with the separator the root already uses. */
function inside(root: string, name: string): string {
  const base = root.trim().replace(/[\\/]+$/, "");
  return base ? `${base}${base.includes("/") && !base.includes("\\") ? "/" : "\\"}${name}` : "";
}

export function ProfileWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (profile: Profile) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [accent, setAccent] = useState<AccentId>("blue");
  const [theme, setTheme] = useState<ThemeId>("blombo");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [folderMode, setFolderMode] = useState<"one" | "each">("one");
  const [root, setRoot] = useState("");
  const [models, setModels] = useState("");
  const [outputs, setOutputs] = useState("");
  const [wildcards, setWildcards] = useState("");
  const [comfyMode, setComfyMode] = useState<"managed" | "local">("managed");
  const [slot, setSlot] = useState("latest");
  const [comfyDir, setComfyDir] = useState("");
  const [presets, setPresets] = useState<string[]>(["illustrious", "sdxl"]);
  const available = usePresets().data ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateProfile();
  const upload = useUploadAvatar();
  const previewTheme = useTheme((s) => s.set);

  useEffect(() => {
    if (!avatar) {
      setAvatarUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatar);
    setAvatarUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  // Live-preview the chosen accent and theme while the wizard is open.
  useEffect(() => {
    if (open) previewTheme({ accent, theme });
  }, [open, accent, theme, previewTheme]);

  const reset = () => {
    setStep(0);
    setName("");
    setAvatar(null);
    previewTheme({ accent: "blue", theme: "blombo" });
  };

  const paths =
    folderMode === "one"
      ? {
          models: inside(root, "Models"),
          outputs: inside(root, "Output"),
          wildcards: inside(root, "Wildcards"),
        }
      : { models: models.trim(), outputs: outputs.trim(), wildcards: wildcards.trim() };

  const canNext =
    step === 0
      ? name.trim().length > 0
      : step === 2
        ? comfyMode !== "local" || !!comfyDir.trim()
        : true;
  const last = step === STEPS.length - 1;

  const submit = async () => {
    try {
      const profile = await create.mutateAsync({
        name: name.trim(),
        accent,
        theme,
        paths,
        comfy:
          comfyMode === "managed"
            ? { mode: "managed", slot }
            : { mode: "local", dir: comfyDir.trim() },
        presets,
      });
      let final = profile;
      if (avatar) final = await upload.mutateAsync({ id: profile.id, file: avatar });
      toast(`Profile "${final.name}" created`, "success");
      onCreated(final);
      reset();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Couldn't create the profile.", "error");
    }
  };

  const next = () => {
    if (!canNext) return;
    if (last) void submit();
    else setStep(step + 1);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) setAvatar(file);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      width={860}
      bare
      className="h-[min(88vh,620px)]"
    >
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        {/* step rail */}
        <aside className="flex flex-col gap-1 border-r border-line bg-surface p-3">
          <div className="mb-3 flex items-center gap-3 px-2 pt-1">
            <Avatar name={name || "New profile"} src={avatarUrl} accent={accent} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{name || "New profile"}</div>
              <div className="text-xs text-fg-3">
                Step {step + 1} of {STEPS.length}
              </div>
            </div>
          </div>
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = i < step;
            const reachable = i <= step || canNext;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!reachable}
                onClick={() => setStep(i)}
                className={cn(
                  "relative flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors focus-ring",
                  active ? "text-fg" : "text-fg-3 hover:bg-fg/5 hover:text-fg-2",
                  !reachable && "opacity-50",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="wizard-step"
                    transition={snappy}
                    className="absolute inset-0 z-0 rounded-md bg-fg/8"
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 grid h-6 w-6 place-items-center rounded-full text-xs",
                    active
                      ? "bg-accent text-on-accent"
                      : done
                        ? "bg-accent/15 text-accent-ink"
                        : "border border-line-strong",
                  )}
                >
                  <Icon
                    name={done ? "check" : s.icon}
                    size={13}
                    strokeWidth={done ? 2.4 : undefined}
                  />
                </span>
                <span className="relative z-10 font-medium">{s.title}</span>
              </button>
            );
          })}
        </aside>

        {/* step body */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 px-7 pt-5 pb-1">
            <h2 className="flex-1 text-lg font-semibold tracking-tight text-fg">
              {STEPS[step]?.title}
            </h2>
            <IconButton icon="x" label="Close" size="sm" onClick={() => onOpenChange(false)} />
          </div>
          <div className="scroll-quiet min-h-0 flex-1 overflow-auto px-7 pt-4 pb-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col gap-6"
              >
                {step === 0 ? (
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-7">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDrop}
                        aria-label="Choose a picture"
                        className="group relative h-[180px] w-[120px] overflow-hidden rounded-lg border border-line focus-ring hover:border-accent/70"
                      >
                        <Avatar
                          shape="card"
                          name={name || "?"}
                          src={avatarUrl}
                          accent={accent}
                          size={120}
                        />
                        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100">
                          <Icon name="camera" size={22} />
                        </span>
                      </button>
                      {avatar ? (
                        <Button size="sm" variant="ghost" onClick={() => setAvatar(null)}>
                          Remove
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="upload"
                          onClick={() => fileRef.current?.click()}
                        >
                          Picture
                        </Button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          setAvatar(e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-6">
                      <Field label="Name">
                        {(id) => (
                          <TextField
                            id={id}
                            autoFocus
                            size="lg"
                            value={name}
                            maxLength={40}
                            placeholder="e.g. Anime, Client work"
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && next()}
                          />
                        )}
                      </Field>
                      <Field label="Color">
                        <div className="flex flex-wrap gap-2">
                          {ACCENTS.map((a) => (
                            <button
                              key={a}
                              type="button"
                              aria-label={a}
                              aria-pressed={a === accent}
                              onClick={() => setAccent(a)}
                              className={cn(
                                "grid h-8 w-8 place-items-center rounded-full transition-transform focus-ring",
                                a === accent
                                  ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface-2"
                                  : "hover:scale-105",
                              )}
                              style={{
                                background: `linear-gradient(135deg, var(--${a}-ink), var(--${a}))`,
                              }}
                            >
                              {a === accent ? (
                                <Icon
                                  name="check"
                                  size={14}
                                  strokeWidth={2.6}
                                  className="text-white"
                                />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </Field>
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <>
                    <Segmented
                      full
                      value={folderMode}
                      onChange={setFolderMode}
                      options={[
                        { value: "one", label: "One folder for everything", icon: "folder" },
                        { value: "each", label: "Each folder separately", icon: "layers" },
                      ]}
                    />
                    {folderMode === "one" ? (
                      <>
                        <Field label="Folder">
                          {(id) => (
                            <FolderField
                              id={id}
                              value={root}
                              onChange={setRoot}
                              pickTitle="Choose a folder for models, outputs and wildcards"
                              placeholder="D:\AI"
                            />
                          )}
                        </Field>
                        {root.trim() ? (
                          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                            {SUBFOLDERS.map((f) => (
                              <SubfolderRow key={f.key} label={f.name} path={paths[f.key]} />
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Field
                          label="Models folder"
                          hint="ComfyUI-style folder with checkpoints/, loras/, vae/ … inside."
                        >
                          {(id) => (
                            <FolderField
                              id={id}
                              value={models}
                              onChange={setModels}
                              pickTitle="Choose your models folder"
                              placeholder="D:\AI\Models"
                              expectModels
                            />
                          )}
                        </Field>
                        <Field label="Output folder">
                          {(id) => (
                            <FolderField
                              id={id}
                              value={outputs}
                              onChange={setOutputs}
                              pickTitle="Choose where images are saved"
                              placeholder="D:\AI\Output"
                            />
                          )}
                        </Field>
                        <Field label="Wildcards folder">
                          {(id) => (
                            <FolderField
                              id={id}
                              value={wildcards}
                              onChange={setWildcards}
                              pickTitle="Choose your wildcards folder"
                              placeholder="D:\AI\Wildcards"
                            />
                          )}
                        </Field>
                      </>
                    )}
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <Segmented
                      full
                      value={comfyMode}
                      onChange={setComfyMode}
                      options={[
                        { value: "managed", label: "Managed install", icon: "workflow" },
                        { value: "local", label: "My own ComfyUI", icon: "folder" },
                      ]}
                    />
                    {comfyMode === "managed" ? (
                      <>
                        <Field label="Version">
                          <Select
                            value={slot}
                            onChange={setSlot}
                            options={[
                              { value: "latest", label: "Latest", hint: "recommended" },
                              { value: "0.28.0", label: "0.28.0", hint: "pinned" },
                            ]}
                            className="w-64"
                          />
                        </Field>
                        <Notice tone="info">
                          Installs on first use into runtime/comfyui/, with its own Python and
                          PyTorch. Progress shows in the app.
                        </Notice>
                      </>
                    ) : (
                      <>
                        <Field label="ComfyUI folder">
                          {(id) => (
                            <FolderField
                              id={id}
                              value={comfyDir}
                              onChange={setComfyDir}
                              pickTitle="Choose your ComfyUI folder"
                              placeholder="D:\ComfyUI_windows_portable"
                              checkComfy
                            />
                          )}
                        </Field>
                        <OwnComfyNotice />
                      </>
                    )}
                  </>
                ) : null}

                {step === 3 ? (
                  <>
                    <Field label="Theme">
                      <div className="grid grid-cols-3 gap-2">
                        {THEMES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            data-theme={t}
                            data-accent={accent}
                            aria-pressed={t === theme}
                            onClick={() => setTheme(t)}
                            className={cn(
                              "flex flex-col gap-2 rounded-lg border bg-bg p-2 text-left transition-[box-shadow,border-color] focus-ring",
                              t === theme
                                ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                                : "border-line hover:border-line-strong",
                            )}
                          >
                            <div className="flex h-12 gap-1.5 rounded-md border border-line bg-surface p-1.5">
                              <div className="w-6 rounded-sm bg-surface-2" />
                              <div className="flex flex-1 flex-col gap-1">
                                <div className="h-2 w-3/4 rounded-xs bg-field" />
                                <div className="h-2 w-1/2 rounded-xs bg-field" />
                                <div className="mt-auto h-2.5 w-8 rounded-sm bg-accent" />
                              </div>
                            </div>
                            <span className="px-0.5 text-xs font-medium text-fg">
                              {THEME_LABELS[t]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Starter workflows">
                      <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface p-3">
                        {WORKFLOW_KINDS.map((kind) => (
                          <div key={kind} className="flex flex-col gap-2.5">
                            <span className="label-caps">{WORKFLOW_KIND_LABELS[kind]}</span>
                            {available
                              .filter((p) => p.kind === kind)
                              .map((p) => (
                                <Checkbox
                                  key={p.id}
                                  checked={presets.includes(p.id)}
                                  onCheckedChange={(c) =>
                                    setPresets(
                                      c ? [...presets, p.id] : presets.filter((x) => x !== p.id),
                                    )
                                  }
                                  label={p.name}
                                />
                              ))}
                          </div>
                        ))}
                      </div>
                    </Field>
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 border-t border-line bg-surface px-7 py-3">
            {step > 0 ? (
              <Button variant="ghost" icon="arrow-left" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : null}
            <span className="ml-auto" />
            <Button
              variant="primary"
              icon={last ? "check" : undefined}
              iconRight={last ? undefined : "arrow-right"}
              disabled={!canNext}
              loading={create.isPending || upload.isPending}
              onClick={next}
            >
              {last ? "Create profile" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** One of Models / Output / Wildcards inside the chosen folder: there already, or to be made. */
function SubfolderRow({ label, path: typed }: { label: string; path: string }) {
  const path = useDebounced(typed, 300);
  const check = useQuery({
    queryKey: ["check-path", path],
    queryFn: () => api.checkPath(path),
    staleTime: 5_000,
  });
  const found = check.data?.exists && check.data.isDirectory;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Icon name="folder" size={15} className="text-fg-3" />
      <span className="flex-1 text-sm font-medium text-fg">{label}</span>
      {check.data ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-xs",
            found ? "text-success" : "text-fg-3",
          )}
        >
          <Icon name={found ? "check-circle" : "plus"} size={13} />
          {found ? "Found" : "Will be created"}
        </span>
      ) : null}
    </li>
  );
}
