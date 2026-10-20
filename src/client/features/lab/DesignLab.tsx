/**
 * Design Lab: every token, icon and control in one place, in every theme and accent.
 * Rule (ADR-0007): a control or variant isn't finished until it's shown here.
 */
import { useTheme } from "@client/app/theme";
import { PromptEditor } from "@client/features/generate/PromptEditor";
import { MOCK_PROMPT } from "@client/features/preview/mock";
import { Icon } from "@client/icons/Icon";
import { Logo, Wordmark } from "@client/icons/Logo";
import { ICON_NAMES } from "@client/icons/paths";
import { cn } from "@client/lib/cn";
import { dismissErrors, useLive } from "@client/lib/live";
import {
  Art,
  Avatar,
  Badge,
  Button,
  Carousel,
  type CarouselImage,
  Checkbox,
  Chip,
  Collapsible,
  CopyButton,
  Dialog,
  DropZone,
  EmptyState,
  Field,
  IconButton,
  InheritRow,
  InlineInput,
  Kbd,
  Menu,
  Meter,
  ModelCard,
  Notice,
  NumberField,
  Popover,
  ProgressBar,
  ProgressRing,
  PropertyList,
  ScrubField,
  Segmented,
  Select,
  Skeleton,
  Slider,
  Spinner,
  StageProgress,
  StatusDot,
  Switch,
  Tabs,
  TextArea,
  TextField,
  Tooltip,
  TreeRow,
  toast,
  UnitTabs,
  Veil,
} from "@client/ui";
import { ACCENTS, THEME_LABELS, THEMES } from "@shared/constants";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

const SECTIONS = [
  ["brand", "Brand"],
  ["color", "Color"],
  ["type", "Type"],
  ["icons", "Icons"],
  ["buttons", "Buttons"],
  ["inputs", "Inputs"],
  ["numbers", "Numbers"],
  ["toggles", "Toggles"],
  ["nav", "Navigation"],
  ["overlays", "Overlays"],
  ["feedback", "Feedback"],
  ["surfaces", "Surfaces"],
  ["stages", "Stages"],
  ["cards", "Cards"],
  ["library", "Library"],
  ["prompt", "Prompt editor"],
] as const;

/**
 * Sample images for the carousel, drawn from the palette tokens (so the Lab needs no image
 * files and no raw colors).
 */
function useSampleImages(): CarouselImage[] {
  const [images, setImages] = useState<CarouselImage[]>([]);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const make = (a: string, b: string, w: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = Math.round(w * 1.25);
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      const g = ctx.createLinearGradient(0, 0, w, canvas.height);
      g.addColorStop(0, css.getPropertyValue(`--${a}`).trim());
      g.addColorStop(1, css.getPropertyValue(`--${b}`).trim());
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, canvas.height);
      return canvas.toDataURL("image/png");
    };
    const pairs: Array<[string, string, Partial<CarouselImage>]> = [
      ["blue", "purple", {}],
      ["orange", "pink", { video: true }],
      ["green", "cyan", { nsfw: true }],
      ["yellow", "red", {}],
    ];
    setImages(
      pairs.map(([a, b, extra]) => ({ thumb: make(a, b, 80), full: make(a, b, 480), ...extra })),
    );
  }, []);
  return images;
}

function Section({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-10 first:border-t-0">
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
        {text ? <p className="text-sm text-fg-3">{text}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-4 py-2">
      <span className="text-xs text-fg-3">{label}</span>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

function Swatch({ name, varName, ink }: { name: string; varName: string; ink?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-12 w-full rounded-md border border-line"
        style={{ background: `var(--${varName})` }}
      />
      <span className={cn("text-xs", ink ? "text-fg-2" : "text-fg")}>{name}</span>
      <code className="font-mono text-2xs text-fg-3">--{varName}</code>
    </div>
  );
}

export function DesignLab({ standalone }: { standalone?: boolean }) {
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
  const setTheme = useTheme((s) => s.set);
  const [iconQuery, setIconQuery] = useState("");
  const [sw, setSw] = useState(true);
  const [cb, setCb] = useState(true);
  const [seg, setSeg] = useState("balanced");
  const [steps, setSteps] = useState(28);
  const [cfg, setCfg] = useState(5.5);
  const [denoise, setDenoise] = useState(0.38);
  const [unit, setUnit] = useState("face");
  const [units, setUnits] = useState([
    { id: "face", name: "Face", enabled: true },
    { id: "hands", name: "Hands", enabled: true, warning: true },
    { id: "person", name: "Person", enabled: false },
  ]);
  const [num, setNum] = useState(832);
  const [sel, setSel] = useState("dpmpp_2m");
  const [tab, setTab] = useState("generate");
  const [line, setLine] = useState("generation");
  const [dialog, setDialog] = useState(false);
  const [stageOn, setStageOn] = useState(true);
  const [ov, setOv] = useState(false);
  const [prompt, setPrompt] = useState(MOCK_PROMPT);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeSel, setTreeSel] = useState("outfits/fantasy.txt");
  const [lines, setLines] = useState(["silver cloak", "# a comment", "__colors__ armor"]);
  const [progress, setProgress] = useState(0.42);
  const samples = useSampleImages();
  const errors = useLive((s) => s.errors.length);

  return (
    <div className="min-h-full bg-bg">
      {/* sticky theme bar */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-[6px]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-8 py-2.5">
          {standalone ? (
            <Link to="/" className="mr-2 inline-flex items-center gap-2 rounded-md focus-ring">
              <Logo size={24} />
              <span className="text-sm font-semibold text-fg">Design Lab</span>
            </Link>
          ) : (
            <span className="mr-2 flex items-center gap-2 text-sm font-semibold text-fg">
              <Icon name="lab" size={16} className="text-accent-ink" />
              Design Lab
            </span>
          )}
          <Segmented
            size="sm"
            value={theme}
            onChange={(t) => setTheme({ theme: t })}
            options={THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
            label="Theme"
          />
          <div className="flex items-center gap-1">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={`Accent ${a}`}
                aria-pressed={a === accent}
                onClick={() => setTheme({ accent: a })}
                className={cn(
                  "h-5 w-5 rounded-full transition-transform focus-ring",
                  a === accent
                    ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface"
                    : "hover:scale-110",
                )}
                style={{ background: `var(--${a})` }}
              />
            ))}
          </div>
          <nav className="ml-auto flex flex-wrap gap-0.5 text-xs">
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-sm px-2 py-1 text-fg-3 hover:bg-field hover:text-fg"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-8 pb-24">
        <Section
          id="brand"
          title="Brand"
          text="The mark follows the profile accent. The spark stays generate-orange."
        >
          <div className="flex items-center gap-8">
            <Wordmark />
            <div className="flex items-end gap-4">
              {[16, 24, 32, 48, 64].map((s) => (
                <Logo key={s} size={s} />
              ))}
            </div>
            <div className="flex items-center gap-4">
              {ACCENTS.slice(0, 5).map((a, i) => (
                <Avatar
                  key={a}
                  name={["Nari Main", "Anime", "Client Work", "Lab", "Backgrounds"][i] ?? "X"}
                  accent={a}
                  size={44}
                />
              ))}
            </div>
          </div>
        </Section>

        <Section
          id="color"
          title="Color"
          text="Deep blue-black surfaces, blue accent, orange for Generate. Raw values live only in tokens.css."
        >
          <h3 className="label-caps mb-3">Surfaces (by elevation)</h3>
          <div className="mb-6 grid grid-cols-9 gap-3">
            {[
              "bg",
              "surface",
              "surface-2",
              "surface-3",
              "field",
              "field-hover",
              "sunken",
              "line",
              "line-strong",
            ].map((v) => (
              <Swatch key={v} name={v} varName={v} />
            ))}
          </div>
          <h3 className="label-caps mb-3">Text</h3>
          <div className="mb-6 grid grid-cols-4 gap-3">
            {(["fg", "fg-2", "fg-3", "fg-4"] as const).map((v) => (
              <div key={v} className="rounded-lg border border-line bg-surface p-3">
                <span className="text-base" style={{ color: `var(--${v})` }}>
                  The quick brown fox
                </span>
                <code className="mt-1 block font-mono text-2xs text-fg-3">--{v}</code>
              </div>
            ))}
          </div>
          <h3 className="label-caps mb-3">Palette families (fill / ink)</h3>
          <div className="mb-6 grid grid-cols-8 gap-3">
            {ACCENTS.map((a) => (
              <div key={a} className="flex flex-col gap-1.5">
                <div className="flex h-12 overflow-hidden rounded-md border border-line">
                  <div className="flex-1" style={{ background: `var(--${a})` }} />
                  <div className="flex-1" style={{ background: `var(--${a}-ink)` }} />
                </div>
                <span className="text-xs text-fg">{a}</span>
              </div>
            ))}
          </div>
          <h3 className="label-caps mb-3">Brand & syntax</h3>
          <div className="grid grid-cols-8 gap-3">
            <Swatch name="accent" varName="accent" />
            <Swatch name="accent-ink" varName="accent-ink" />
            <Swatch name="generate" varName="generate" />
            <Swatch name="generate-hi" varName="generate-hi" />
            <Swatch name="weight" varName="syn-weight" />
            <Swatch name="lora" varName="syn-lora" />
            <Swatch name="wildcard" varName="syn-wildcard" />
            <Swatch name="invalid" varName="syn-invalid" />
          </div>
        </Section>

        <Section
          id="type"
          title="Type"
          text="Geist and Geist Mono (bundled, offline). 13px is the UI base size."
        >
          <div className="flex flex-col gap-3">
            {[
              ["text-3xl", "34 · Display", "Who's creating today?"],
              ["text-2xl", "26 · Page title", "Settings overview"],
              ["text-xl", "20 · Section", "Hires fix"],
              ["text-lg", "16 · Emphasis", "WAI Illustrious v14"],
              ["text-base", "14 · Body large", "Pick a profile to start generating."],
              ["text-sm", "13 · UI base", "Steps, CFG scale, sampler and scheduler"],
              ["text-xs", "12 · Small", "Doesn't exist yet. BlomboUI will create it."],
              ["text-2xs", "11 · Micro", "edited 2h ago"],
            ].map(([cls, label, sample]) => (
              <div key={cls} className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4">
                <span className="font-mono text-2xs text-fg-3">{label}</span>
                <span
                  className={cn(
                    cls,
                    "text-fg",
                    cls === "text-3xl" || cls === "text-2xl" ? "font-semibold tracking-tight" : "",
                  )}
                >
                  {sample}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4">
              <span className="font-mono text-2xs text-fg-3">label-caps</span>
              <span className="label-caps">Sampling</span>
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4">
              <span className="font-mono text-2xs text-fg-3">mono · numbers</span>
              <span className="font-mono text-sm text-fg tabular">
                832 × 1216 · seed 284119032 · 4.2 it/s
              </span>
            </div>
          </div>
        </Section>

        <Section
          id="icons"
          title="Icons"
          text={`${ICON_NAMES.length} hand-drawn icons in icons/paths.ts. 24 grid, 1.75 stroke. Named by action.`}
        >
          <TextField
            icon="search"
            placeholder="Filter icons"
            value={iconQuery}
            onChange={(e) => setIconQuery(e.target.value)}
            onClear={() => setIconQuery("")}
            className="mb-4 w-72"
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1.5">
            {ICON_NAMES.filter((n) => n.includes(iconQuery.toLowerCase())).map((n) => (
              <Tooltip key={n} content={n}>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(n).catch(() => undefined);
                    toast(`Copied "${n}"`, "success");
                  }}
                  className="flex h-[76px] flex-col items-center justify-center gap-2 rounded-md border border-line bg-surface text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-ring"
                >
                  <Icon name={n} size={22} />
                  <span className="max-w-full truncate px-1 font-mono text-[10px] text-fg-3">
                    {n}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        </Section>

        <Section id="buttons" title="Buttons">
          <Row label="Variants">
            <Button variant="primary" icon="sparkle">
              Primary
            </Button>
            <Button icon="duplicate">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost" icon="folder-open">
              Ghost
            </Button>
            <Button variant="danger" icon="trash">
              Danger
            </Button>
          </Row>
          <Row label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg" variant="primary">
              Large
            </Button>
          </Row>
          <Row label="States">
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button iconRight="arrow-right" variant="primary">
              Continue
            </Button>
          </Row>
          <Row label="Icon buttons">
            <IconButton icon="unload-models" label="Unload models" />
            <IconButton icon="free-cache" label="Free cache" />
            <IconButton icon="rescan-models" label="Rescan models" shortcut="R" />
            <IconButton icon="compare" label="Compare" active />
            <IconButton icon="settings" label="Settings" variant="secondary" />
            <IconButton icon="plus" label="Add" variant="primary" />
            <IconButton icon="trash" label="Delete" variant="danger" />
            <IconButton icon="x" label="Close" size="xs" />
          </Row>
          <Row label="Generate">
            <button
              type="button"
              className="flex h-[72px] w-[220px] flex-col items-center justify-center gap-1 rounded-xl bg-[linear-gradient(180deg,var(--generate-hi),var(--generate))] text-on-generate shadow-[inset_0_1px_0_rgb(255_255_255/.28)] transition-shadow hover:shadow-glow focus-ring"
            >
              <span className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="sparkle" size={19} strokeWidth={2} /> Generate
              </span>
              <span className="text-xs text-white/80">Ctrl + Enter</span>
            </button>
          </Row>
        </Section>

        <Section id="inputs" title="Inputs">
          <div className="grid grid-cols-2 gap-x-10 gap-y-4">
            <Field label="Text field" hint="Hint text explains the value.">
              {(id) => <TextField id={id} placeholder="Placeholder" icon="search" />}
            </Field>
            <Field label="Invalid" error="That folder doesn't exist.">
              {(id) => (
                <TextField id={id} value="B:\Nope" invalid mono onChange={() => undefined} />
              )}
            </Field>
            <Field label="Select (grouped)">
              <Select
                value={sel}
                onChange={setSel}
                className="w-full"
                options={[
                  { value: "euler_ancestral", label: "Euler a", group: "Ancestral" },
                  { value: "euler", label: "Euler", group: "Deterministic" },
                  { value: "dpmpp_2m", label: "DPM++ 2M", group: "Deterministic" },
                  { value: "dpmpp_2m_sde", label: "DPM++ 2M SDE", group: "SDE", hint: "slow" },
                ]}
              />
            </Field>
            <Field label="Text area (auto-grow)">
              {(id) => <TextArea id={id} placeholder="Notes about this workflow" />}
            </Field>
            <Field label="Settings row" layout="left" labelWidth={120}>
              <TextField placeholder="Left-aligned label layout" />
            </Field>
          </div>
        </Section>

        <Section
          id="numbers"
          title="Number controls"
          text="The same value, four ways. Customize mode lets you pick per parameter."
        >
          <div className="grid grid-cols-2 gap-x-10 gap-y-6">
            <Slider
              label="Slider · Steps"
              value={steps}
              onChange={setSteps}
              min={1}
              max={100}
              defaultValue={28}
              marks={[20, 30]}
            />
            <ScrubField
              label="Scrub bar · CFG"
              value={cfg}
              onChange={setCfg}
              min={1}
              max={15}
              step={0.5}
              defaultValue={5.5}
            />
            <Field label="Number · Width">
              <NumberField value={num} onChange={setNum} min={64} max={4096} step={8} unit="px" />
            </Field>
            <Field label="Chips · Steps">
              <div className="flex gap-1">
                {[20, 25, 28, 30, 40].map((v) => (
                  <Chip key={v} size="sm" selected={steps === v} onClick={() => setSteps(v)}>
                    <span className="font-mono">{v}</span>
                  </Chip>
                ))}
              </div>
            </Field>
            <Slider
              label="Small · Denoise"
              value={denoise}
              onChange={setDenoise}
              min={0}
              max={1}
              step={0.01}
              size="sm"
            />
            <Slider
              label="Generate tone"
              value={denoise}
              onChange={setDenoise}
              min={0}
              max={1}
              step={0.01}
              tone="generate"
              size="lg"
            />
            <ScrubField
              label="Small scrub"
              value={cfg}
              onChange={setCfg}
              min={1}
              max={15}
              step={0.5}
              size="sm"
            />
            <Slider
              label="Disabled"
              value={0.5}
              onChange={() => undefined}
              min={0}
              max={1}
              step={0.1}
              disabled
            />
          </div>
        </Section>

        <Section id="toggles" title="Toggles">
          <Row label="Switch">
            <Switch checked={sw} onCheckedChange={setSw} label="Switch" />
            <Switch checked={!sw} onCheckedChange={(v) => setSw(!v)} label="Switch 2" />
            <Switch checked={sw} onCheckedChange={setSw} size="sm" label="Small" />
            <Switch checked={sw} onCheckedChange={setSw} tone="generate" label="Generate tone" />
            <Switch checked={false} onCheckedChange={() => undefined} disabled label="Disabled" />
          </Row>
          <Row label="Checkbox">
            <Checkbox checked={cb} onCheckedChange={setCb} label="Also save the first pass" />
            <Checkbox
              checked={false}
              onCheckedChange={() => undefined}
              indeterminate
              label="Some selected"
            />
            <Checkbox
              checked={!cb}
              onCheckedChange={(v) => setCb(!v)}
              label="With description"
              description="Secondary line of text."
            />
          </Row>
          <Row label="Segmented">
            <Segmented
              value={seg}
              onChange={setSeg}
              options={[
                { value: "balanced", label: "Balanced" },
                { value: "prompt", label: "Prompt" },
                { value: "control", label: "ControlNet" },
              ]}
            />
            <Segmented
              size="sm"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "balanced", icon: "layout-rows", title: "Rows" },
                { value: "prompt", icon: "layout-grid", title: "Grid" },
                { value: "control", icon: "maximize", title: "Single" },
              ]}
            />
          </Row>
          <Row label="Chips">
            <Chip selected icon="heart">
              Favorites
            </Chip>
            <Chip icon="models" count={64}>
              Checkpoints
            </Chip>
            <Chip size="sm" onRemove={() => undefined}>
              detail slider
            </Chip>
          </Row>
        </Section>

        <Section id="nav" title="Navigation">
          <Row label="Pill tabs (header)">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "generate", label: "Generate", icon: "generate" },
                { value: "gallery", label: "Gallery", icon: "gallery" },
                { value: "models", label: "Models", icon: "models" },
                { value: "wildcards", label: "Wildcards", icon: "wildcards" },
              ]}
            />
          </Row>
          <Row label="Line tabs (panels)">
            <Tabs
              variant="line"
              value={line}
              onChange={setLine}
              items={[
                { value: "generation", label: "Generation", icon: "sliders" },
                { value: "checkpoints", label: "Checkpoints", icon: "models" },
                { value: "loras", label: "LoRAs", icon: "layers", badge: <Badge>1032</Badge> },
              ]}
            />
          </Row>
        </Section>

        <Section id="overlays" title="Overlays">
          <Row label="Tooltip">
            <Tooltip content="Unload models from VRAM">
              <Button>Hover me</Button>
            </Tooltip>
          </Row>
          <Row label="Popover">
            <Popover
              trigger={<Button iconRight="chevron-down">Open popover</Button>}
              className="w-64 p-3"
            >
              <p className="text-sm text-fg-2">
                Popovers hold small forms and details. Esc or click outside closes them.
              </p>
            </Popover>
          </Row>
          <Row label="Menu">
            <Menu
              placement="bottom-start"
              trigger={<Button icon="more-horizontal">Open menu</Button>}
              items={[
                {
                  id: "a",
                  label: "Duplicate",
                  icon: "duplicate",
                  shortcut: "Ctrl D",
                  onSelect: () => toast("Duplicated", "success"),
                },
                { id: "b", label: "Edit in ComfyUI", icon: "workflow", onSelect: () => undefined },
                { id: "c", label: "Export .blombo", icon: "export", onSelect: () => undefined },
                { type: "separator", id: "s" },
                {
                  id: "d",
                  label: "Delete",
                  icon: "trash",
                  tone: "danger",
                  onSelect: () => undefined,
                },
              ]}
            />
          </Row>
          <Row label="Dialog">
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Dialog
              open={dialog}
              onOpenChange={setDialog}
              title="Duplicate workflow"
              description="Same graph and settings under a new name. Changes only affect the copy."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" icon="duplicate" onClick={() => setDialog(false)}>
                    Duplicate
                  </Button>
                </>
              }
            >
              <Field label="Name">
                {(id) => (
                  <TextField id={id} defaultValue="Illustrious · Portrait (copy)" autoFocus />
                )}
              </Field>
            </Dialog>
          </Row>
          <Row label="Toasts">
            <Button size="sm" onClick={() => toast("Workflow saved", "success")}>
              Success
            </Button>
            <Button size="sm" onClick={() => toast("Fetching thumbnails…", "info")}>
              Info
            </Button>
            <Button
              size="sm"
              onClick={() => toast("ComfyUI restarts to load the new models folder", "warning")}
            >
              Warning
            </Button>
            <Button
              size="sm"
              onClick={() =>
                toast("Missing custom node: ImpactPack", "error", {
                  label: "Install",
                  run: () => undefined,
                })
              }
            >
              Error + action
            </Button>
          </Row>
          <Row label="Header errors badge">
            <Button size="sm" onClick={dismissErrors} disabled={!errors}>
              Clear errors
            </Button>
            <Button
              size="sm"
              onClick={() =>
                useLive.setState((s) => ({
                  errors: [
                    {
                      id: `lab-${Date.now()}`,
                      at: Date.now(),
                      source: "server",
                      title: "Example error",
                      detail: "Something failed. This says what to do next.",
                    },
                    ...s.errors,
                  ],
                }))
              }
            >
              Add error
            </Button>
            <span className="text-xs text-fg-3">The header badge hides when there are none.</span>
          </Row>
        </Section>

        <Section id="feedback" title="Feedback">
          <Row label="Badges">
            <Badge>neutral</Badge>
            <Badge tone="accent">accent</Badge>
            <Badge tone="success">installed</Badge>
            <Badge tone="warning">needs key</Badge>
            <Badge tone="danger">failed</Badge>
            <Badge tone="generate">running</Badge>
          </Row>
          <Row label="Keys / status">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
            <StatusDot tone="success" />
            <StatusDot tone="warning" pulse />
            <StatusDot tone="danger" />
            <Spinner />
          </Row>
          <Row label="Meter">
            <Meter label="VRAM" value={9.4} max={24} valueText="9.4/24G" width={80} />
            <Meter label="VRAM" value={19.6} max={24} valueText="19.6/24G" width={80} />
            <Meter label="VRAM" value={23.2} max={24} valueText="23.2/24G" width={80} />
          </Row>
          <Row label="Stage progress">
            <div className="w-[420px]">
              <StageProgress
                segments={[
                  { id: "a", label: "Base · 28 steps", progress: 1, state: "done" },
                  { id: "b", label: "Hires fix", progress: 0.55, state: "active" },
                  { id: "c", label: "ADetailer", progress: 0, state: "pending" },
                ]}
              />
            </div>
          </Row>
          <Row label="Skeleton">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </Row>
        </Section>

        <Section
          id="surfaces"
          title="Surfaces"
          text="Stage header: icon, title, one-line summary, enable switch. Inherited fields link to the base value."
        >
          <div className="grid grid-cols-2 gap-4">
            <Collapsible
              title="Hires fix"
              icon="upscale"
              subtitle="1.5× → 1248×1824 · 4x-UltraSharp · denoise 0.38"
              enabled={stageOn}
              onEnabledChange={setStageOn}
              defaultOpen
            >
              <div className="flex flex-col gap-3">
                <Slider
                  label="Denoise"
                  value={denoise}
                  onChange={setDenoise}
                  min={0}
                  max={1}
                  step={0.01}
                />
                <InheritRow label="Steps" inherited="28" overridden={ov} onOverride={setOv}>
                  <NumberField value={14} onChange={() => undefined} min={1} max={100} />
                </InheritRow>
              </div>
            </Collapsible>
            <div className="flex flex-col gap-3">
              <Collapsible
                title="ADetailer"
                icon="face-scan"
                subtitle="2 units · Face, Hands"
                enabled={false}
                onEnabledChange={() => undefined}
              >
                <p className="text-sm text-fg-2">Body</p>
              </Collapsible>
              <Collapsible
                title="Plain collapsible"
                icon="workflow"
                subtitle="No switch"
                tone="inset"
              >
                <p className="text-sm text-fg-2">Body</p>
              </Collapsible>
              <div className="card p-4 text-sm text-fg-2">
                .card utility: border, hairline highlight, radius-lg
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="stages"
          title="Stages"
          text="Notices say what's missing and offer the fix. Unit tabs run in order; off units are struck through, units missing something carry a mark."
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-3">
              <Notice
                tone="info"
                actions={
                  <Button size="sm" icon="store">
                    Find in Manager
                  </Button>
                }
              >
                ADetailer · Face: pick a detector.
              </Notice>
              <Notice
                tone="warning"
                actions={
                  <>
                    <Button size="sm" icon="external">
                      Open ComfyUI
                    </Button>
                    <Button size="sm" variant="ghost" icon="refresh">
                      Check again
                    </Button>
                  </>
                }
              >
                ADetailer needs FaceDetailer (ComfyUI Impact Pack). Install the missing custom nodes
                in ComfyUI, then restart ComfyUI.
              </Notice>
              <Notice
                tone="warning"
                actions={
                  <>
                    <Button size="sm" variant="primary" icon="download">
                      Install
                    </Button>
                    <Button size="sm" variant="ghost" icon="globe">
                      ComfyUI Impact Pack
                    </Button>
                    <Button size="sm" variant="ghost" icon="refresh">
                      Check again
                    </Button>
                  </>
                }
              >
                ADetailer needs FaceDetailer (ComfyUI Impact Pack). Install adds them to this
                ComfyUI and restarts it.
              </Notice>
              <Notice
                tone="info"
                title="Installing custom nodes · 4 of 7"
                actions={
                  <Button size="sm" variant="ghost" icon="stop">
                    Stop
                  </Button>
                }
              >
                <span className="flex flex-col gap-1.5">
                  <span>Install ComfyUI Impact Pack's packages</span>
                  <ProgressBar value={0.4} label="Installing packages" size="sm" />
                  <span className="truncate font-mono text-[11px] text-fg-3">
                    Downloading ultralytics (1.0MiB)
                  </span>
                </span>
              </Notice>
              <Notice
                tone="danger"
                title="Install failed"
                actions={
                  <Button size="sm" variant="primary" icon="download">
                    Install again
                  </Button>
                }
              >
                ComfyUI didn't load ComfyUI Impact Subpack. Open ComfyUI's log from the status menu
                to see why (often a package that failed to install), then install again.
              </Notice>
              <Notice tone="danger" title="Couldn't read the list">
                Use one tag per line: name, category, count, aliases.
              </Notice>
            </div>
            <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-3">
              <UnitTabs
                units={units}
                active={unit}
                onActive={setUnit}
                layoutGroup="lab"
                onAdd={() =>
                  setUnits((u) => [
                    ...u,
                    { id: `u${u.length + 1}`, name: `Unit ${u.length + 1}`, enabled: true },
                  ])
                }
              />
              <UnitTabs
                units={units.slice(0, 1)}
                active="face"
                onActive={() => undefined}
                layoutGroup="lab-single"
              />
              <p className="text-xs text-fg-3">
                Arrow keys move between units. The second strip has no add button (at its limit).
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="cards"
          title="Model cards"
          text="One card everywhere. No thumbnail? A designed face: kind color + icon + monogram."
        >
          <div className="grid grid-cols-6 gap-3">
            <ModelCard
              name="WAI Illustrious v14"
              kind="checkpoints"
              baseModel="IL"
              thumb="art:wai14"
              selected
            />
            <ModelCard
              name="Detailer Slider XL"
              kind="loras"
              baseModel="IL"
              thumb="art:detail"
              favorite
              onFavorite={() => undefined}
            />
            <ModelCard name="pixel_art_v3" kind="loras" baseModel="SDXL" />
            <ModelCard name="sdxl_vae_fp16fix" kind="vae" baseModel="SDXL" />
            <ModelCard name="4x-UltraSharp" kind="upscale_models" />
            <ModelCard name="controlnet-openpose-sdxl" kind="controlnet" baseModel="SDXL" />
            <ModelCard name="face_yolov8m" kind="ultralytics" />
            <ModelCard name="easynegative" kind="embeddings" baseModel="SD1.5" />
            <ModelCard name="qwen_3_4b" kind="text_encoders" />
            <ModelCard name="characters/heroes" kind="wildcards" />
            <ModelCard name="anima-base-fp8" kind="diffusion_models" baseModel="Anima" />
            <ModelCard
              name="Installed mark"
              kind="loras"
              baseModel="IL"
              thumb="art:mark-a"
              mark={{ label: "Installed", icon: "check", tone: "success" }}
            />
            <ModelCard
              name="Update mark"
              kind="checkpoints"
              baseModel="SDXL"
              thumb="art:mark-b"
              mark={{ label: "Update", icon: "arrow-up", tone: "warning" }}
            />
            <ModelCard
              name="Downloading mark"
              kind="loras"
              baseModel="Pony"
              mark={{ label: "Downloading", icon: "download", tone: "accent" }}
              footer={<span className="text-2xs text-fg-3">With a footer (Civitai stats)</span>}
            />
            <ModelCard
              name="NSFW thumbnail (blurred)"
              kind="loras"
              baseModel="IL"
              thumb="art:nsfw-a"
              nsfw
              blurNsfw
              meta="144 MB"
            />
            <div className="flex flex-col gap-2">
              <Art seed="lab-a" ratio={3 / 4} className="rounded-lg" />
              <span className="text-2xs text-fg-3">Procedural placeholder art</span>
            </div>
          </div>
        </Section>

        <Section
          id="library"
          title="Library"
          text="Gallery, File Info, Models and Wildcard Manager pieces."
        >
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <Row label="ProgressBar">
                <div className="flex w-full flex-col gap-2">
                  <ProgressBar value={progress} label="Determinate" />
                  <ProgressBar value={null} label="Indeterminate" />
                  <ProgressBar value={1} label="Done" tone="success" size="sm" />
                  <ProgressBar value={0.6} label="Failed" tone="danger" size="sm" />
                  <Slider
                    value={Math.round(progress * 100)}
                    onChange={(v) => setProgress(v / 100)}
                    min={0}
                    max={100}
                    size="sm"
                    label="Progress value"
                    unit="%"
                  />
                </div>
              </Row>
              <Row label="ProgressRing">
                <span className="text-accent-ink">
                  <ProgressRing value={progress} />
                </span>
                <span className="text-generate-ink">
                  <ProgressRing value={0.8} size={28} />
                </span>
                <span className="text-fg-3">
                  <ProgressRing value={0} />
                </span>
              </Row>
              <Row label="CopyButton">
                <CopyButton text="284119032" label="Copy seed" />
                <CopyButton text="hello" label="Copy (sm)" size="sm" />
              </Row>
              <Row label="InlineInput">
                <div className="flex w-full flex-col gap-0.5 rounded-md border border-line bg-surface-2 p-1.5">
                  {lines.map((l, i) => (
                    <InlineInput
                      key={i}
                      value={l}
                      muted={l.trim().startsWith("#")}
                      onChange={(e) =>
                        setLines(lines.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      aria-label={`Demo line ${i + 1}`}
                    />
                  ))}
                  <InlineInput
                    value="disabled line"
                    disabled
                    aria-label="Disabled line"
                    onChange={() => undefined}
                  />
                </div>
              </Row>
              <Row label="PropertyList">
                <PropertyList
                  className="w-full"
                  items={[
                    { label: "Model", value: "waiIllustrious_v14", copy: "waiIllustrious_v14" },
                    { label: "Seed", value: 284119032, copy: "284119032", mono: true },
                    { label: "Sampler", value: "dpmpp_2m · karras" },
                    { label: "Empty", value: null },
                  ]}
                />
              </Row>
              <Row label="TreeRow">
                <div className="w-64 rounded-md border border-line bg-surface p-1.5">
                  <TreeRow
                    depth={0}
                    label="outfits"
                    icon="folder"
                    open={treeOpen}
                    onClick={() => setTreeOpen(!treeOpen)}
                  />
                  {treeOpen ? (
                    <>
                      <TreeRow
                        depth={1}
                        label="fantasy.txt"
                        icon="file-text"
                        selected={treeSel === "outfits/fantasy.txt"}
                        dirty
                        onClick={() => setTreeSel("outfits/fantasy.txt")}
                        actions={<IconButton icon="more-horizontal" label="Options" size="xs" />}
                      />
                      <TreeRow
                        depth={1}
                        label="packs.yaml"
                        icon="raw-mode"
                        meta="2 KB"
                        selected={treeSel === "outfits/packs.yaml"}
                        onClick={() => setTreeSel("outfits/packs.yaml")}
                      />
                    </>
                  ) : null}
                </div>
              </Row>
            </div>
            <div className="flex flex-col gap-4">
              <Row label="DropZone">
                <div className="flex w-full flex-col gap-2">
                  <DropZone
                    onFile={(f) => toast(`Dropped ${f.name}`, "info")}
                    title="Drop a file here, or click to pick one"
                    hint="PNG, WebP, JPEG · .safetensors"
                    icon="file-info"
                  />
                  <DropZone onFile={() => undefined} title="Compact" compact />
                  <DropZone onFile={() => undefined} title="Busy" compact busy />
                </div>
              </Row>
              <Row label="Carousel">
                <Carousel images={samples} label="Sample images" className="w-56" />
                <Carousel
                  images={[]}
                  label="No images"
                  className="w-28"
                  empty={<Art seed="carousel-empty" className="h-full w-full" />}
                />
              </Row>
              <Row label="Veil (NSFW)">
                <div className="h-32 w-28 overflow-hidden rounded-md">
                  <Veil active>
                    <Art seed="veil-a" className="h-full w-full" />
                  </Veil>
                </div>
                <div className="h-32 w-28 overflow-hidden rounded-md">
                  <Veil active compact>
                    <Art seed="veil-b" className="h-full w-full" />
                  </Veil>
                </div>
                <div className="h-32 w-28 overflow-hidden rounded-md">
                  <Veil active={false}>
                    <Art seed="veil-c" className="h-full w-full" />
                  </Veil>
                </div>
              </Row>
              <Row label="EmptyState">
                <div className="w-full rounded-lg border border-line">
                  <EmptyState
                    icon="gallery"
                    title="Your images will appear here"
                    text="Generate something, or add a folder from the sidebar."
                    action={<Button variant="primary">Open Generate</Button>}
                  />
                </div>
              </Row>
              <Row label="EmptyState (warning)">
                <div className="w-full rounded-lg border border-line">
                  <EmptyState
                    icon="folder"
                    tone="warning"
                    title="The models folder isn't there"
                    text="Pick it again in Settings → Folders."
                  />
                </div>
              </Row>
            </div>
          </div>
        </Section>

        <Section
          id="prompt"
          title="Prompt editor"
          text="CodeMirror 6 + the shared tokenizer. Hover a red underline for the reason."
        >
          <PromptEditor
            label="Prompt sample"
            value={prompt}
            onChange={setPrompt}
            minRows={4}
            className="h-[150px]"
          />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-fg-3">
            <span>
              <span className="text-syn-weight">(tag:1.2)</span> weight
            </span>
            <span>
              <span className="text-syn-lora">&lt;lora:name:0.8&gt;</span> LoRA
            </span>
            <span>
              <span className="text-syn-wildcard">__wildcard__</span> wildcard
            </span>
            <span>
              <span className="font-mono text-syn-break">BREAK</span> new chunk
            </span>
            <span>
              <span className="text-syn-escape">\( \)</span> literal
            </span>
            <span>
              <span className="text-syn-invalid underline decoration-wavy">&lt;lora:broken</span>{" "}
              error
            </span>
          </div>
        </Section>
      </div>
    </div>
  );
}
