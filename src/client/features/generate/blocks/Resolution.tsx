/**
 * Size, the old app's layout: Raw / Scaler / Set on top, then the size controls for that mode,
 * the swap button, and batch count and size beside them. Raw is width and height; Scaler an
 * aspect (buttons with the shape drawn on them) and megapixels, worked out from the current size
 * so nothing extra is saved; Set the
 * profile's list of resolutions (Settings → Generate) turned horizontal or vertical. The mode is a setting. On its
 * own it's a card; inside a card (`bare`, the default layout's First pass) it's just the rows.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Field, IconButton, SectionTitle, Segmented, Select, Slider } from "@client/ui";
import { GenerateSettings } from "@shared/settings";
import {
  ASPECTS,
  formatSize,
  inferScaler,
  landscapeSize,
  MEGAPIXELS,
  orientSize,
  parseSize,
  type SizeMode,
  sizeFromScaler,
} from "@shared/sizes";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";

const { sizeMode: DEFAULT_MODE, setResolutions: DEFAULT_SET } = GenerateSettings.parse({});

const MODES: Array<{ value: SizeMode; label: string }> = [
  { value: "raw", label: "Raw" },
  { value: "scaler", label: "Scaler" },
  { value: "set", label: "Set" },
];

const shown = (size: { w: number; h: number }) => `${size.w} × ${size.h}`;

export function Resolution({ bare = false }: { bare?: boolean }) {
  const width = useRoleBinding("latent.width");
  const height = useRoleBinding("latent.height");
  if (!width || !height) return null;
  return (
    <ResolutionRows widthId={width.id} heightId={height.id} step={width.step ?? 8} bare={bare} />
  );
}

function ResolutionRows({
  widthId,
  heightId,
  step,
  bare,
}: {
  widthId: string;
  heightId: string;
  step: number;
  bare: boolean;
}) {
  const [rawW, setW] = useValue<number>(widthId);
  const [rawH, setH] = useValue<number>(heightId);
  const batchBinding = useRoleBinding("latent.batch");
  const [batch, setBatch] = useValue<number>(batchBinding?.id ?? "latent.batch");
  const count = useValues((s) => s.run.count);
  const setRun = useValues((s) => s.setRun);
  const generateSettings = useSettings().data?.generate;
  const mode = generateSettings?.sizeMode ?? DEFAULT_MODE;
  const setList = generateSettings?.setResolutions ?? DEFAULT_SET;
  const updateSettings = useUpdateSettings();
  const w = typeof rawW === "number" && rawW > 0 ? rawW : 1024;
  const h = typeof rawH === "number" && rawH > 0 ? rawH : 1024;
  const vertical = h > w;
  const scaler = inferScaler({ w, h });
  const mp = (w * h) / 1_000_000;

  const setSize = (size: { w: number; h: number }) => {
    setW(size.w);
    setH(size.h);
  };
  // Switching modes never changes the size: Scaler reads it as it is, Set lists it on top.
  const pickMode = (sizeMode: SizeMode) => updateSettings.mutate({ generate: { sizeMode } });

  const current = formatSize(landscapeSize({ w, h }));
  const sizeControls =
    mode === "raw" ? (
      <>
        <Slider label="Width" value={w} onChange={setW} min={64} max={4096} step={step} />
        <Slider label="Height" value={h} onChange={setH} min={64} max={4096} step={step} />
      </>
    ) : mode === "set" ? (
      <>
        <Field label="Resolution">
          <Select
            value={current}
            onChange={(key) => {
              const size = parseSize(key);
              if (size) setSize(orientSize(size, vertical));
            }}
            options={[...new Set([current, ...setList])].map((key) => {
              const size = parseSize(key);
              return { value: key, label: size ? shown(orientSize(size, vertical)) : key };
            })}
            label="Resolution"
            className="w-full"
          />
        </Field>
        <Segmented
          size="sm"
          value={vertical ? "vertical" : "horizontal"}
          onChange={(o) => setSize(orientSize({ w, h }, o === "vertical"))}
          label="Orientation"
          options={[
            { value: "horizontal", label: "Horizontal" },
            { value: "vertical", label: "Vertical" },
          ]}
          className="self-start"
        />
      </>
    ) : (
      <>
        <div role="group" aria-label="Aspect" className="flex flex-wrap gap-1">
          {ASPECTS.map((a) => {
            const on = scaler.aspect === a.id;
            const scale = 14 / Math.max(a.w, a.h);
            return (
              <button
                key={a.id}
                type="button"
                title={a.label}
                aria-pressed={on}
                onClick={() => setSize(sizeFromScaler(a.id, scaler.megapixels))}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-sm border px-1.5 transition-colors focus-ring",
                  on
                    ? "border-accent/60 bg-accent/12 text-fg"
                    : "border-transparent text-fg-3 hover:bg-field hover:text-fg-2",
                )}
              >
                <span
                  className={cn(
                    "rounded-[2px] border-[1.5px]",
                    on ? "border-accent-ink bg-accent/25" : "border-current",
                  )}
                  style={{ width: a.w * scale, height: a.h * scale }}
                />
                <span className="font-mono text-[10px] tabular">{a.id}</span>
              </button>
            );
          })}
        </div>
        <Slider
          label="Megapixels"
          value={scaler.megapixels}
          onChange={(megapixels) => setSize(sizeFromScaler(scaler.aspect, megapixels))}
          min={MEGAPIXELS.min}
          max={MEGAPIXELS.max}
          step={MEGAPIXELS.step}
        />
      </>
    );

  const rows = (
    <>
      <div className="flex items-center gap-3">
        {bare ? <span className="text-xs text-fg-2">Size</span> : null}
        <Segmented size="sm" value={mode} onChange={pickMode} options={MODES} label="Size mode" />
        {mode === "scaler" ? (
          <span className="font-mono text-xs text-fg-3 tabular">{shown({ w, h })}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(0,7fr)_auto_minmax(0,3fr)] items-center gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">{sizeControls}</div>
        <IconButton
          icon="swap-vertical"
          label="Swap width and height"
          variant="secondary"
          onClick={() => setSize({ w: h, h: w })}
        />
        <div className="flex min-w-0 flex-col gap-2 pl-2">
          <Slider
            label="Batch count"
            value={count}
            onChange={(n) => setRun({ count: n })}
            min={1}
            max={100}
          />
          {batchBinding ? (
            <Slider
              label="Batch size"
              value={typeof batch === "number" ? batch : 1}
              onChange={setBatch}
              min={batchBinding.min ?? 1}
              max={Math.min(batchBinding.max ?? 8, 16)}
            />
          ) : null}
        </div>
      </div>
      {mp > 1.6 ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <Icon name="info" size={13} /> Above ~1.5 MP, SDXL-family models often duplicate subjects.
          Hires fix is the better route.
        </p>
      ) : null}
    </>
  );

  if (bare) return <div className="flex flex-col gap-3">{rows}</div>;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <SectionTitle
        icon="aspect-ratio"
        actions={<span className="font-mono text-2xs text-fg-3 tabular">{mp.toFixed(2)} MP</span>}
      >
        Size
      </SectionTitle>
      {rows}
    </div>
  );
}
