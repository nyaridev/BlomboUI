/** Seed + batch: one card. The mode decides which seed each run gets. */
import { useLive } from "@client/lib/live";
import { IconButton, NumberField, SectionTitle, Segmented, TextField, toast } from "@client/ui";
import { randomSeed } from "@shared/random";
import type { SeedMode } from "@shared/workflow/manifest";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";

const MODES: Array<{ value: SeedMode; label: string }> = [
  { value: "random", label: "Random" },
  { value: "fixed", label: "Fixed" },
  { value: "increment", label: "+1" },
  { value: "decrement", label: "−1" },
];

export function Seed() {
  const seedBinding = useRoleBinding("sampler.seed");
  const batchBinding = useRoleBinding("latent.batch");
  const [seed, setSeed] = useValue<number>(seedBinding?.id ?? "sampler.seed");
  const [batch, setBatch] = useValue<number>(batchBinding?.id ?? "latent.batch");
  const mode = useValues((s) => s.run.seedMode);
  const count = useValues((s) => s.run.count);
  const setRun = useValues((s) => s.setRun);
  const last = useLive(
    (s) => s.queue.jobs.find((j) => j.state === "done" && j.seed !== null)?.seed ?? null,
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <SectionTitle icon="seed">Seed & batch</SectionTitle>
      {seedBinding ? (
        <>
          <div className="flex gap-1.5">
            <TextField
              value={mode === "random" ? "Random each run" : String(seed ?? 0)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                if (Number.isFinite(n)) setSeed(n);
              }}
              disabled={mode === "random"}
              mono
              icon="hash"
              className="flex-1"
              aria-label="Seed"
            />
            <IconButton
              icon="dice"
              label="New random seed"
              variant="secondary"
              onClick={() => {
                setSeed(randomSeed());
                if (mode === "random") setRun({ seedMode: "fixed" });
              }}
            />
            <IconButton
              icon="undo"
              label={last !== null ? `Reuse last seed (${last})` : "Reuse last seed (none yet)"}
              variant="secondary"
              disabled={last === null}
              onClick={() => {
                if (last === null) return;
                setSeed(last);
                setRun({ seedMode: "fixed" });
                toast(`Seed ${last} reused`, "info");
              }}
            />
          </div>
          <Segmented
            full
            size="sm"
            value={mode}
            onChange={(seedMode) => setRun({ seedMode })}
            label="Seed for each run"
            options={MODES}
          />
        </>
      ) : (
        <p className="text-xs text-fg-3">This workflow has no seed to set.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-2xs text-fg-3">Batch count</span>
          <NumberField
            value={count}
            onChange={(n) => setRun({ count: n })}
            min={1}
            max={100}
            label="Batch count"
          />
        </div>
        {batchBinding ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-2xs text-fg-3">Batch size</span>
            <NumberField
              value={typeof batch === "number" ? batch : 1}
              onChange={setBatch}
              min={batchBinding.min ?? 1}
              max={batchBinding.max ?? 16}
              label="Batch size"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
