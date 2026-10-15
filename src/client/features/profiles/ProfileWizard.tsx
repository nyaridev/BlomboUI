/**
 * Create-profile wizard (ADR-0006): identity → folders → ComfyUI → look & workflows.
 * Everything except the name can be changed later in Settings.
 */
import { useTheme } from "@client/app/theme";
import { Icon, type IconName } from "@client/icons/Icon";
import { ApiError } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { useCreateProfile, useUploadAvatar } from "@client/lib/queries";
import {
  Avatar,
  Button,
  Checkbox,
  Dialog,
  Field,
  Segmented,
  Select,
  TextField,
  toast,
} from "@client/ui";
import { ACCENTS, type AccentId, THEME_LABELS, THEMES, type ThemeId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { FolderField } from "./FolderField";

const STEPS: Array<{ id: string; title: string; hint: string; icon: IconName }> = [
  { id: "you", title: "Profile", hint: "Name, picture, color", icon: "user" },
  { id: "folders", title: "Folders", hint: "Models, outputs, wildcards", icon: "folder" },
  { id: "comfy", title: "ComfyUI", hint: "Engine for generation", icon: "workflow" },
  { id: "start", title: "Start", hint: "Look and workflows", icon: "sparkle" },
];

const PRESETS = [
  { id: "illustrious", label: "Illustrious", hint: "Anime / illustration, SDXL-based" },
  { id: "noobai", label: "NoobAI", hint: "Illustrious family, v-pred" },
  { id: "sdxl", label: "SDXL", hint: "General purpose" },
  { id: "sd15", label: "SD 1.5", hint: "Classic, fast" },
  { id: "anima", label: "Anima", hint: "Diffusion model + Qwen encoder" },
  { id: "krea2", label: "Krea 2", hint: "Diffusion model" },
  { id: "rembg", label: "Background removal", hint: "RMBG 2.0 / BiRefNet" },
  { id: "upscale", label: "Image upscale", hint: "Upscale models or SeedVR2" },
  { id: "caption", label: "Captioning", hint: "WD14 tagger / Qwen-VL" },
  { id: "dataset", label: "Dataset prep", hint: "Crop and pad sprites" },
];

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
  const [models, setModels] = useState("");
  const [outputs, setOutputs] = useState("");
  const [wildcards, setWildcards] = useState("");
  const [comfyMode, setComfyMode] = useState<"managed" | "external">("managed");
  const [slot, setSlot] = useState("latest");
  const [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188");
  const [presets, setPresets] = useState<string[]>(["illustrious", "sdxl", "rembg", "upscale"]);
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

  const canNext = step === 0 ? name.trim().length > 0 : true;

  const submit = async () => {
    try {
      const profile = await create.mutateAsync({
        name: name.trim(),
        accent,
        theme,
        paths: { models: models.trim(), outputs: outputs.trim(), wildcards: wildcards.trim() },
        comfy:
          comfyMode === "managed"
            ? { mode: "managed", slot }
            : { mode: "external", url: comfyUrl.trim() },
        presets,
      });
      let final = profile;
      if (avatar) final = await upload.mutateAsync({ id: profile.id, file: avatar });
      toast(`Profile "${final.name}" created`, "success");
      onCreated(final);
      setStep(0);
      setName("");
      setAvatar(null);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Couldn't create the profile.", "error");
    }
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
      width={820}
      className="h-[min(88vh,640px)]"
    >
      <div className="-mx-5 -my-4 grid h-full min-h-[560px] grid-cols-[230px_minmax(0,1fr)]">
        {/* step rail */}
        <aside className="flex flex-col gap-1 border-r border-line bg-surface p-4">
          <div className="mb-4 flex items-center gap-3 px-1">
            <Avatar name={name || "New profile"} src={avatarUrl} accent={accent} size={40} />
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
            return (
              <button
                key={s.id}
                type="button"
                disabled={i > step && !canNext}
                onClick={() => (i <= step || canNext ? setStep(i) : undefined)}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors focus-ring",
                  active ? "text-fg" : "text-fg-3 hover:bg-field hover:text-fg-2",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="wizard-step"
                    transition={snappy}
                    className="absolute inset-0 z-0 rounded-md bg-field ring-1 ring-line-strong"
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 grid h-7 w-7 place-items-center rounded-full border text-xs transition-colors",
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : done
                        ? "border-accent/50 text-accent-ink"
                        : "border-line-strong",
                  )}
                >
                  {done ? (
                    <Icon name="check" size={14} strokeWidth={2.4} />
                  ) : (
                    <Icon name={s.icon} size={14} />
                  )}
                </span>
                <span className="relative z-10 flex flex-col">
                  <span className="text-sm font-medium">{s.title}</span>
                  <span className="text-2xs text-fg-3">{s.hint}</span>
                </span>
              </button>
            );
          })}
          <p className="mt-auto px-1 text-2xs leading-relaxed text-fg-4">
            Everything except the name can be changed later in Settings.
          </p>
        </aside>

        {/* step body */}
        <div className="flex min-h-0 flex-col">
          <div className="scroll-quiet min-h-0 flex-1 overflow-auto px-7 pt-6 pb-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.16 }}
                className="flex flex-col gap-6"
              >
                {step === 0 ? (
                  <>
                    <Header
                      title="Create a profile"
                      text="A profile keeps its own folders, workflows, layouts and settings."
                    />
                    <div className="flex items-center gap-6">
                      <div
                        className="group relative"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDrop}
                      >
                        <Avatar name={name || "?"} src={avatarUrl} accent={accent} size={96} />
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="absolute inset-0 grid place-items-center rounded-full bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100 focus-ring"
                          aria-label="Upload a picture"
                        >
                          <Icon name="camera" size={22} />
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-2">
                          <Button size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                            Upload picture
                          </Button>
                          {avatar ? (
                            <Button size="sm" variant="ghost" onClick={() => setAvatar(null)}>
                              Remove
                            </Button>
                          ) : null}
                        </div>
                        <span className="text-xs text-fg-3">
                          PNG, JPG or WebP. Drop an image on the circle too.
                        </span>
                      </div>
                    </div>
                    <Field label="Name">
                      {(id) => (
                        <TextField
                          id={id}
                          autoFocus
                          size="lg"
                          value={name}
                          maxLength={40}
                          placeholder="e.g. Anime, Client work, Experiments"
                          onChange={(e) => setName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)}
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
                  </>
                ) : null}

                {step === 1 ? (
                  <>
                    <Header
                      title="Folders"
                      text="Point BlomboUI at your files. Several profiles can share the same folders."
                    />
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
                          placeholder="B:\AI\Models"
                          expectModels
                        />
                      )}
                    </Field>
                    <Field
                      label="Outputs folder"
                      hint="Generated images are saved here, sorted by date."
                    >
                      {(id) => (
                        <FolderField
                          id={id}
                          value={outputs}
                          onChange={setOutputs}
                          pickTitle="Choose where images are saved"
                          placeholder="B:\AI\Outputs"
                        />
                      )}
                    </Field>
                    <Field label="Wildcards folder" hint=".txt and .yaml wildcard files.">
                      {(id) => (
                        <FolderField
                          id={id}
                          value={wildcards}
                          onChange={setWildcards}
                          pickTitle="Choose your wildcards folder"
                          placeholder="B:\AI\Wildcards"
                        />
                      )}
                    </Field>
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <Header
                      title="ComfyUI"
                      text="BlomboUI drives ComfyUI to generate. Let it manage an install, or connect to yours."
                    />
                    <Segmented
                      full
                      value={comfyMode}
                      onChange={setComfyMode}
                      options={[
                        { value: "managed", label: "Managed install", icon: "workflow" },
                        { value: "external", label: "My own ComfyUI", icon: "link" },
                      ]}
                    />
                    {comfyMode === "managed" ? (
                      <div className="flex flex-col gap-4">
                        <Field
                          label="Version"
                          hint="Slots live in runtime/comfyui/<slot>/ with their own Python and Torch."
                        >
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
                        <Note icon="info">
                          The slot installs on first use, with progress shown in the app. The Save
                          to Blombo extension is added automatically.
                        </Note>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <Field label="ComfyUI address">
                          {(id) => (
                            <TextField
                              id={id}
                              value={comfyUrl}
                              onChange={(e) => setComfyUrl(e.target.value)}
                              mono
                              icon="globe"
                            />
                          )}
                        </Field>
                        <Note icon="info">
                          To edit workflows round-trip, install the blombo-bridge extension from
                          Settings → ComfyUI after creating the profile.
                        </Note>
                      </div>
                    )}
                  </>
                ) : null}

                {step === 3 ? (
                  <>
                    <Header
                      title="Look and starter workflows"
                      text="Pick a theme and the workflows to start with. You can import more anytime."
                    />
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
                                <div className="h-2 w-3/4 rounded-full bg-field" />
                                <div className="h-2 w-1/2 rounded-full bg-field" />
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
                    <Field
                      label="Starter workflows"
                      hint="Copied into this profile. Each one is yours to change."
                    >
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-line bg-surface p-3">
                        {PRESETS.map((p) => (
                          <Checkbox
                            key={p.id}
                            checked={presets.includes(p.id)}
                            onCheckedChange={(c) =>
                              setPresets(c ? [...presets, p.id] : presets.filter((x) => x !== p.id))
                            }
                            label={p.label}
                            description={p.hint}
                          />
                        ))}
                      </div>
                    </Field>
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 border-t border-line bg-surface px-7 py-3.5">
            {step > 0 ? (
              <Button variant="ghost" icon="arrow-left" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : null}
            <span className="ml-auto" />
            {step < STEPS.length - 1 ? (
              <Button
                variant="primary"
                iconRight="arrow-right"
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="check"
                loading={create.isPending || upload.isPending}
                onClick={submit}
              >
                Create profile
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Header({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
      <p className="text-sm text-fg-3">{text}</p>
    </div>
  );
}

function Note({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg-2">
      <Icon name={icon} size={16} className="mt-0.5 text-accent-ink" />
      <span>{children}</span>
    </div>
  );
}
