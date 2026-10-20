/**
 * Help (avatar menu, F1): how to get going, load models, bring in and edit workflows, use stages,
 * scripts and batch tools, and the prompt guide with a live playground (the real prompt editor,
 * explained by shared/prompt/explain). Topics are listed in the command palette too.
 */
import { openSettings } from "@client/app/commands";
import { useShortcutLabel } from "@client/app/useShortcuts";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useGoToView } from "@client/lib/hooks";
import { snappy } from "@client/lib/motion";
import { useUpdateSettings, useWildcards } from "@client/lib/queries";
import { Badge, Button, Kbd, Panel } from "@client/ui";
import { MODEL_FOLDERS } from "@shared/models";
import { explainPrompt } from "@shared/prompt/explain";
import { estimateTokens } from "@shared/prompt/tokenize";
import { SHORTCUT_ACTIONS } from "@shared/shortcuts";
import { motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PromptEditor } from "../generate/PromptEditor";
import { HELP_TOPICS, useHelpNav } from "./nav";
import { SyntaxText } from "./SyntaxText";

export function HelpView() {
  const [active, setActive] = useState(HELP_TOPICS[0]?.id ?? "start");
  const scroller = useRef<HTMLDivElement>(null);

  const show = useCallback((id: string) => {
    setActive(id);
    scroller.current
      ?.querySelector(`#help-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // A topic picked elsewhere (the palette) scrolls into view once.
  useEffect(() => {
    const t = useHelpNav.getState().take();
    if (t) requestAnimationFrame(() => show(t));
    return useHelpNav.subscribe((s) => {
      if (s.topic) show(useHelpNav.getState().take() ?? s.topic);
    });
  }, [show]);

  // The rail follows the section in view.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.replace("help-", ""));
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    for (const el of root.querySelectorAll("section[id^=help-]")) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={scroller} className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[220px_minmax(0,1fr)] gap-10 px-8 pt-8 pb-24">
        <nav className="sticky top-8 flex flex-col gap-0.5 self-start" aria-label="Help topics">
          <span className="label-caps px-2.5 pb-2 text-[10px]">Help</span>
          {HELP_TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => show(t.id)}
              aria-current={active === t.id ? "true" : undefined}
              className={cn(
                "relative flex min-h-8 w-full items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-sm transition-colors focus-ring",
                active === t.id ? "text-fg" : "text-fg-3 hover:bg-field hover:text-fg-2",
              )}
            >
              {active === t.id ? (
                <motion.span
                  layoutId="help-nav"
                  transition={snappy}
                  className="absolute inset-0 z-0 rounded-md bg-field ring-1 ring-line-strong"
                />
              ) : null}
              <Icon
                name={t.icon}
                size={15}
                className={cn("relative z-10 shrink-0", active === t.id && "text-accent-ink")}
              />
              <span className="relative z-10">{t.title}</span>
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 max-w-[820px] flex-col gap-14">
          <GettingStarted />
          <LoadingModels />
          <Workflows />
          <Stages />
          <Batch />
          <PromptGuide />
          <Playground />
          <Keys />
        </div>
      </div>
    </div>
  );
}

/* ── building blocks ───────────────────────────────────────────────────── */

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section id={`help-${id}`} className="flex scroll-mt-8 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-balance text-fg">{title}</h2>
        <p className="text-sm text-fg-2">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function Steps({ steps }: { steps: Array<{ title: string; text: ReactNode }> }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 font-mono text-xs font-semibold text-accent-ink">
            {i + 1}
          </span>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <span className="text-sm font-medium text-fg">{s.title}</span>
            <span className="text-sm text-fg-3">{s.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-fg-2">
      <Icon name="info" size={15} className="mt-0.5 shrink-0 text-info" />
      <span>{children}</span>
    </div>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="rounded-xs bg-sunken px-1 font-mono text-[12px] text-fg-2">{children}</span>
);

/* ── topics ────────────────────────────────────────────────────────────── */

function GettingStarted() {
  const go = useGoToView();
  const update = useUpdateSettings();
  const keys = useShortcutLabel();
  return (
    <Section
      id="start"
      title="Getting started"
      lead="Blombo is a studio for ComfyUI: ComfyUI does the generating, Blombo gives it profiles, workflows you can import, a Generate screen you can rearrange, a gallery and model tools."
    >
      <Steps
        steps={[
          {
            title: "Point the profile at your folders",
            text: "Settings → Folders: the models folder (checkpoints, LoRAs, VAE…), where images are saved, and your wildcards. Two profiles can share folders.",
          },
          {
            title: "Get ComfyUI running",
            text: "Settings → ComfyUI installs it into Blombo's own folder with a progress view, or connects to a ComfyUI you already run. The dot in the header shows its state.",
          },
          {
            title: "Pick a workflow",
            text: "The switcher left in the header lists your workflows. SD 1.5, SDXL and Illustrious come built in; drop any ComfyUI workflow on it to add your own.",
          },
          {
            title: "Write a prompt and generate",
            text: (
              <>
                Choose a model in the strip on top, describe the image and press Generate (
                {keys("generate") ?? "Ctrl Enter"}). Progress and previews show on the image stage;
                finished images land in the Gallery.
              </>
            ),
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon="play"
          onClick={() => {
            update.mutate({ help: { tourDone: false } });
            go("generate");
          }}
        >
          Take the tour
        </Button>
        <Button icon="workflow" onClick={() => openSettings(go, "comfy")}>
          Set up ComfyUI
        </Button>
        <Button variant="ghost" icon="folder" onClick={() => openSettings(go, "files")}>
          Folders
        </Button>
      </div>
    </Section>
  );
}

function LoadingModels() {
  const go = useGoToView();
  const kinds: Array<[string, string]> = [
    ["Checkpoints", MODEL_FOLDERS.checkpoints.join(", ")],
    ["Diffusion models", MODEL_FOLDERS.diffusion_models.join(", ")],
    ["LoRAs", MODEL_FOLDERS.loras.join(", ")],
    ["VAE", MODEL_FOLDERS.vae.join(", ")],
    ["Text encoders", MODEL_FOLDERS.text_encoders.join(", ")],
    ["Upscalers", MODEL_FOLDERS.upscale_models.join(", ")],
    ["ControlNet", MODEL_FOLDERS.controlnet.join(", ")],
    [
      "Detectors (ADetailer)",
      `${MODEL_FOLDERS.ultralytics.join(", ")}, ${MODEL_FOLDERS.sams.join(", ")}`,
    ],
    ["Embeddings", MODEL_FOLDERS.embeddings.join(", ")],
  ];
  return (
    <Section
      id="models"
      title="Loading models"
      lead="Models are files in the profile's models folder, one subfolder per kind, exactly as ComfyUI reads them. Subfolders inside a kind are fine."
    >
      <Panel className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-3">
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Folder inside the models folder</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map(([k, f]) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="px-4 py-2 text-fg-2">{k}</td>
                <td className="px-4 py-2 font-mono text-xs text-fg-2">{f}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Steps
        steps={[
          {
            title: "Download from Civitai",
            text: "Models → Civitai searches the site; Download puts the file in the right folder with its preview and info. Add your API key in Settings → Civitai for early-access files.",
          },
          {
            title: "Install from the Manager store",
            text: "Models → Manager is ComfyUI-Manager's catalog: upscalers, detectors, ControlNet and more, one click each.",
          },
          {
            title: "Copied files yourself?",
            text: "Press Rescan in the header (R) so ComfyUI and Blombo see them. A picture next to a model (same name, .png or .preview.png) becomes its thumbnail.",
          },
          {
            title: "Thumbnails per style",
            text: "Scopes keep a picture of each model per context (Anime, Photo…), made by the Scripts block or picked from the gallery. Find them in the avatar menu or Models → Scopes.",
          },
        ]}
      />
      <div className="flex gap-2">
        <Button icon="models" onClick={() => go("models")}>
          Open Models
        </Button>
        <Button variant="ghost" icon="scopes" onClick={() => go("scopes")}>
          Scopes
        </Button>
      </div>
    </Section>
  );
}

function Workflows() {
  return (
    <Section
      id="workflows"
      title="Importing and editing workflows"
      lead="A workflow is a real ComfyUI graph plus the controls Blombo shows for it. Your values are saved in the workflow; Duplicate makes an independent copy."
    >
      <Steps
        steps={[
          {
            title: "Import",
            text: (
              <>
                Drop a ComfyUI workflow on the switcher (or use its import button): API or UI{" "}
                <Mono>.json</Mono>, a ComfyUI <Mono>.png</Mono> / <Mono>.webp</Mono> with the graph
                inside, or a <Mono>.blombo</Mono> export. Blombo finds the prompts, model, sampler,
                size and LoRAs by themselves.
              </>
            ),
          },
          {
            title: "Expose any setting",
            text: (
              <>
                In ComfyUI, title a node with a dollar sign, like <Mono>$Detail strength</Mono>: its
                inputs become controls on the Generate screen.
              </>
            ),
          },
          {
            title: "Edit in ComfyUI",
            text: "In the switcher's menu, Edit in ComfyUI opens the graph in ComfyUI with your current values. The Blombo bar on top has Save to Blombo (keeps your values and reports what changed), Save as copy and Cancel.",
          },
          {
            title: "Send any canvas to Blombo",
            text: "With the Blombo bridge loaded, ComfyUI's menu has Send to Blombo: whatever is open becomes a new workflow. Your own ComfyUI gets the bridge from Settings → ComfyUI → Install bridge.",
          },
          {
            title: "Share",
            text: "Export writes a .blombo file with the graph, your values, the linked layout and a thumbnail. Importing it elsewhere gives the same setup.",
          },
        ]}
      />
      <Tip>
        Rearrange the Generate screen with Customize (the sliders icon on the Generate tab): move
        blocks, pick slider, number or chip styles, and save layouts for other workflows.
      </Tip>
    </Section>
  );
}

function Stages() {
  return (
    <Section
      id="stages"
      title="Stages: Hires fix, ADetailer, ControlNet"
      lead="Stages are extra passes Blombo adds to any workflow when you switch them on, so you don't have to rebuild the graph."
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: "upscale" as const,
            title: "Hires fix",
            text: "Upscales and refines the image in a second pass. Its settings follow the base until you unlink one.",
          },
          {
            icon: "face-scan" as const,
            title: "ADetailer",
            text: "Finds faces or hands with a detector and redraws them. Several units run in order.",
          },
          {
            icon: "pose" as const,
            title: "ControlNet",
            text: "Guides the image with a pose, depth or edge map from a picture; Show map previews it.",
          },
        ].map((s) => (
          <Panel key={s.title} className="flex flex-col gap-2 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-field text-accent-ink">
              <Icon name={s.icon} size={16} />
            </span>
            <span className="text-sm font-medium text-fg">{s.title}</span>
            <span className="text-xs text-fg-3">{s.text}</span>
          </Panel>
        ))}
      </div>
      <Tip>
        A stage that's missing something says so before you generate: <b>Install</b> adds the custom
        nodes it needs to Blombo's ComfyUI, <b>Find in Manager</b> opens the models it needs. The
        progress bar shows each stage as its own part.
      </Tip>
    </Section>
  );
}

function Batch() {
  return (
    <Section
      id="batch"
      title="Scripts and batch tools"
      lead="One click, many images. Scripts run from the Generate screen; batch workflows work through a folder of images."
    >
      <Steps
        steps={[
          {
            title: "Prompt matrix",
            text: "Every combination of a few terms added to your prompt, laid out in a labeled grid.",
          },
          {
            title: "XY plot",
            text: "Any two settings (CFG × Steps, sampler × model, prompt search and replace) against each other, with the same seed, in one grid.",
          },
          {
            title: "Scope thumbnails",
            text: "One picture per model or LoRA, saved as its thumbnail in a scope. Models, the pickers and the palette show them.",
          },
          {
            title: "Batch tools",
            text: "Remove background, Upscale images, Caption images and Dataset prep are built-in batch workflows: pick a folder or drop files, choose an output folder, Run batch. Captions are written next to the images as .txt.",
          },
        ]}
      />
      <Tip>
        Scripts and batches go through the same queue as single runs, so the header shows them and
        Cancel stops them. With notifications on, Windows tells you when they finish.
      </Tip>
    </Section>
  );
}

const GUIDE: Array<{ syntax: string; example: string; meaning: ReactNode }> = [
  {
    syntax: "(tag:1.5)",
    example: "a castle, (golden hour:1.4), (fog:0.7)",
    meaning: "Exactly this weight. Above 1 pulls harder, below 1 softens. Ctrl+↑/↓ changes it.",
  },
  {
    syntax: "((tag))",
    example: "a cat, (fluffy), ((blue eyes))",
    meaning: "Each pair of parentheses multiplies by 1.1: (tag) = 1.1, ((tag)) = 1.21.",
  },
  {
    syntax: "[tag]",
    example: "portrait, [freckles], [[jewelry]]",
    meaning: "Each pair of brackets divides by 1.1: [tag] ≈ 0.91, [[tag]] ≈ 0.83.",
  },
  {
    syntax: "\\( \\)",
    example: "frieren \\(sousou no frieren\\), smile",
    meaning:
      "A backslash makes a parenthesis plain text, for tags that contain them (character names).",
  },
  {
    syntax: "<lora:name:0.8>",
    example: "a knight, <lora:detail_tweaker:0.6>",
    meaning:
      "Adds a LoRA at that strength (1 when left out). The models strip edits these tags; Blombo moves them into the graph when it runs.",
  },
  {
    syntax: "__wildcard__",
    example: "a __animal__ in a __season/autumn__ forest",
    meaning:
      "A random line from that file in your wildcards folder, picked per image from the seed.",
  },
  {
    syntax: "{a|b|c}",
    example: "a {red|blue|green} dress",
    meaning: "One of the options, picked per image like a wildcard.",
  },
  {
    syntax: "BREAK",
    example: "a cottage, garden BREAK night sky, stars",
    meaning: "Starts a new 75-token chunk, so what follows is weighed on its own.",
  },
];

function PromptGuide() {
  return (
    <Section
      id="prompts"
      title="Prompt guide"
      lead="Tags separated by commas, with a few marks for weight, LoRAs and randomness. The prompt editor colors each of them and underlines mistakes."
    >
      <Panel className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-3">
              <th className="w-[150px] px-4 py-2 font-medium">Write</th>
              <th className="px-4 py-2 font-medium">Example</th>
              <th className="w-[44%] px-4 py-2 font-medium">What it does</th>
            </tr>
          </thead>
          <tbody>
            {GUIDE.map((g) => (
              <tr key={g.syntax} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-3">
                  <SyntaxText text={g.syntax} className="font-mono text-[12.5px]" />
                </td>
                <td className="px-4 py-3">
                  <SyntaxText text={g.example} />
                </td>
                <td className="px-4 py-3 text-fg-3">{g.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Tip>
        Prompts are read in 75-token chunks; the counter above each prompt shows tokens and chunks
        and turns yellow when a chunk overflows. Autocomplete (Ctrl+Space) suggests tags, LoRAs with
        their trigger words, and wildcards.
      </Tip>
    </Section>
  );
}

const SAMPLE =
  "masterpiece, (a lighthouse on a cliff:1.3), ((stormy sea)), [people], {dawn|dusk} light, __weather__, <lora:detail_tweaker:0.6> BREAK seagulls, painting by \\(unknown\\)";

function weightTone(w: number): string {
  if (w > 1.001) return "border-yellow/40 bg-yellow/10 text-syn-weight";
  if (w < 0.999) return "border-line bg-sunken text-fg-3";
  return "border-line bg-field text-fg-2";
}

function Playground() {
  const [text, setText] = useState(SAMPLE);
  const e = useMemo(() => explainPrompt(text), [text]);
  const tokens = useMemo(() => estimateTokens(text), [text]);
  const known = new Set(useWildcards().data?.names ?? []);
  return (
    <Section
      id="playground"
      title="Prompt playground"
      lead="Type here with the real prompt editor (colors, autocomplete, Ctrl+↑/↓) and see how Blombo reads it. Nothing is generated."
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-xs font-medium text-fg-2">Prompt</span>
          <span className="font-mono text-2xs text-fg-3 tabular">
            {tokens.tokens} tok · {tokens.chunks} chunk{tokens.chunks === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setText(SAMPLE)}
            className="ml-auto text-xs text-accent-ink hover:underline focus-ring"
          >
            Reset the example
          </button>
        </div>
        <PromptEditor
          label="Playground prompt"
          value={text}
          onChange={setText}
          minRows={4}
          className="h-[124px]"
        />
      </div>

      {e.issues.length ? (
        <div className="flex flex-col gap-1">
          {e.issues.map((issue) => (
            <span key={issue} className="flex items-center gap-1.5 text-xs text-warning">
              <Icon name="info" size={13} /> {issue}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-3">
        <Panel className="flex flex-col gap-3 p-4">
          <span className="text-sm font-medium text-fg">Tags and their weight</span>
          {e.chunks.map((c, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {e.chunks.length > 1 ? (
                <span className="label-caps text-[10px]">
                  Chunk {i + 1} · ~{c.tokens} tokens
                </span>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {c.tags.length === 0 ? <span className="text-xs text-fg-4">Empty</span> : null}
                {c.tags.map((t, j) => (
                  <span
                    key={`${t.text}-${j}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs",
                      weightTone(t.weight),
                    )}
                  >
                    {t.text}
                    {t.weight !== 1 ? <span className="font-mono tabular">×{t.weight}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel className="flex flex-col gap-2 p-4">
            <span className="text-sm font-medium text-fg">LoRAs</span>
            {e.loras.length === 0 ? <span className="text-xs text-fg-4">None</span> : null}
            {e.loras.map((l) => (
              <span key={l.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-syn-lora">{l.name}</span>
                <span className="font-mono text-fg-3 tabular">{l.strength}</span>
              </span>
            ))}
          </Panel>
          <Panel className="flex flex-col gap-2 p-4">
            <span className="text-sm font-medium text-fg">Wildcards and choices</span>
            {e.wildcards.length === 0 && e.choices.length === 0 ? (
              <span className="text-xs text-fg-4">None</span>
            ) : null}
            {e.wildcards.map((w) => (
              <span key={w} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-syn-wildcard">__{w}__</span>
                {known.has(w) ? (
                  <Badge tone="success">found</Badge>
                ) : (
                  <Badge tone="warning">not in your folder</Badge>
                )}
              </span>
            ))}
            {e.choices.map((c, i) => (
              <span key={i} className="text-xs text-fg-2">
                one of <span className="text-syn-wildcard">{c.join(" · ")}</span>
              </span>
            ))}
          </Panel>
        </div>
      </div>
    </Section>
  );
}

function Keys() {
  const go = useGoToView();
  const keys = useShortcutLabel();
  const rows = SHORTCUT_ACTIONS.filter((a) => keys(a.id));
  return (
    <Section
      id="keys"
      title="Keyboard shortcuts"
      lead="The ones you'll use most. All of them, and changing them, are in Settings → Shortcuts."
    >
      <Panel className="grid grid-cols-2 gap-x-6 p-4">
        {rows.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="text-fg-2">{a.label}</span>
            <span className="flex gap-1">
              {(keys(a.id) ?? "").split(" ").map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </Panel>
      <div>
        <Button icon="keyboard" onClick={() => openSettings(go, "shortcuts")}>
          Change shortcuts
        </Button>
      </div>
    </Section>
  );
}
