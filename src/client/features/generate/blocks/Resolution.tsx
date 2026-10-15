/** Resolution picker: visual aspect grid, swap, linked W/H, megapixel readout. */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { IconButton, NumberField, SectionTitle } from "@client/ui";
import { useValue } from "../state";

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

export function Resolution() {
  const [w, setW] = useValue<number>("latent.width");
  const [h, setH] = useValue<number>("latent.height");
  const mp = (w * h) / 1_000_000;
  const ratio = w / h;
  const active = ASPECTS.find(
    ([, aw, ah]) => Math.abs(aw / ah - ratio) < 0.01 || Math.abs(ah / aw - ratio) < 0.01,
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <SectionTitle
        icon="aspect-ratio"
        actions={
          <span className="font-mono text-2xs text-fg-3 tabular">
            {mp.toFixed(2)} MP{active ? ` · ${active[0]}` : ""}
          </span>
        }
      >
        Size
      </SectionTitle>
      <div className="grid grid-cols-8 gap-1">
        {ASPECTS.map(([name, aw, ah]) => {
          const on = active?.[0] === name;
          const scale = 22 / Math.max(aw, ah);
          return (
            <button
              key={name}
              type="button"
              title={`${name} · ${aw}×${ah}`}
              onClick={() => {
                setW(aw);
                setH(ah);
              }}
              className={cn(
                "group flex h-14 flex-col items-center justify-center gap-1 rounded-md border transition-colors focus-ring",
                on
                  ? "border-accent/60 bg-accent/12 text-fg"
                  : "border-transparent text-fg-3 hover:bg-field hover:text-fg-2",
              )}
            >
              <span
                className={cn(
                  "rounded-[3px] border-[1.5px]",
                  on ? "border-accent-ink bg-accent/25" : "border-current",
                )}
                style={{ width: aw * scale, height: ah * scale }}
              />
              <span className="font-mono text-[10px] tabular">{name}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-end gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-2xs text-fg-3">Width</span>
          <NumberField
            value={w}
            onChange={setW}
            min={64}
            max={4096}
            step={8}
            unit="px"
            label="Width"
          />
        </div>
        <IconButton
          icon="swap-horizontal"
          label="Swap width and height"
          variant="secondary"
          onClick={() => {
            setW(h);
            setH(w);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-2xs text-fg-3">Height</span>
          <NumberField
            value={h}
            onChange={setH}
            min={64}
            max={4096}
            step={8}
            unit="px"
            label="Height"
          />
        </div>
      </div>
      {mp > 1.6 ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <Icon name="info" size={13} /> Above ~1.5 MP, SDXL-family models often duplicate subjects.
          Hires fix is the better route.
        </p>
      ) : null}
    </div>
  );
}
