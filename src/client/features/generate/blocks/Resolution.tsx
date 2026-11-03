/**
 * Size: a row of aspect presets, then the old app's row: width and height sliders, the swap
 * button, and batch count and batch size beside them. On its own it's a card; inside a card
 * (`bare`, the default layout's First pass) it's just the rows.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { IconButton, SectionTitle, Slider } from "@client/ui";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";

const ASPECTS: Array<[string, number, number]> = [
  ["1:1", 1024, 1024],
  ["4:5", 896, 1120],
  ["3:4", 896, 1152],
  ["2:3", 832, 1216],
  ["9:16", 768, 1344],
  ["3:2", 1216, 832],
  ["16:9", 1344, 768],
  ["21:9", 1536, 640],
];

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
  const w = typeof rawW === "number" && rawW > 0 ? rawW : 1024;
  const h = typeof rawH === "number" && rawH > 0 ? rawH : 1024;
  const mp = (w * h) / 1_000_000;
  const ratio = w / h;
  const active = ASPECTS.find(
    ([, aw, ah]) => Math.abs(aw / ah - ratio) < 0.01 || Math.abs(ah / aw - ratio) < 0.01,
  );
  const readout = (
    <span className="font-mono text-2xs text-fg-3 tabular">
      {mp.toFixed(2)} MP{active ? ` · ${active[0]}` : ""}
    </span>
  );

  const rows = (
    <>
      <div className="flex items-center gap-1">
        {bare ? <span className="mr-2 text-xs text-fg-2">Size</span> : null}
        {ASPECTS.map(([name, aw, ah]) => {
          const on = active?.[0] === name;
          const scale = 14 / Math.max(aw, ah);
          return (
            <button
              key={name}
              type="button"
              title={`${name} · ${aw}×${ah}`}
              aria-pressed={on}
              onClick={() => {
                setW(aw);
                setH(ah);
              }}
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
                style={{ width: aw * scale, height: ah * scale }}
              />
              <span className="font-mono text-[10px] tabular">{name}</span>
            </button>
          );
        })}
        {bare ? <span className="ml-auto pl-2">{readout}</span> : null}
      </div>
      <div className="grid grid-cols-[minmax(0,7fr)_auto_minmax(0,3fr)] items-center gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Slider label="Width" value={w} onChange={setW} min={64} max={4096} step={step} />
          <Slider label="Height" value={h} onChange={setH} min={64} max={4096} step={step} />
        </div>
        <IconButton
          icon="swap-vertical"
          label="Swap width and height"
          variant="secondary"
          onClick={() => {
            setW(h);
            setH(w);
          }}
        />
        <div className="flex min-w-0 flex-col gap-2">
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
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <SectionTitle icon="aspect-ratio" actions={readout}>
        Size
      </SectionTitle>
      {rows}
    </div>
  );
}
