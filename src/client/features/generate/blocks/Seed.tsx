/**
 * Seed: the seed field (with a new random one and the last run's) beside what happens to it after
 * each run. On its own it's a card; inside a card (`bare`, the default layout's First pass) it's
 * just the row. Batch count and size sit with the size (Resolution).
 */

import { useLive } from "@client/lib/live";
import { IconButton, SectionTitle, Select, TextField, toast } from "@client/ui";
import { randomSeed } from "@shared/random";
import type { SeedMode } from "@shared/workflow/manifest";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";

const MODES: Array<{ value: SeedMode; label: string }> = [
  { value: "random", label: "Random" },
  { value: "fixed", label: "Keep it" },
  { value: "increment", label: "Add 1" },
  { value: "decrement", label: "Subtract 1" },
];

export function Seed({ bare = false }: { bare?: boolean }) {
  const seedBinding = useRoleBinding("sampler.seed");
  if (!seedBinding) return null;
  const row = <SeedRow seedId={seedBinding.id} />;
  if (bare) return row;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <SectionTitle icon="seed">Seed</SectionTitle>
      {row}
    </div>
  );
}

function SeedRow({ seedId }: { seedId: string }) {
  const [seed, setSeed] = useValue<number>(seedId);
  const mode = useValues((s) => s.run.seedMode);
  const setRun = useValues((s) => s.setRun);
  const last = useLive(
    (s) => s.queue.jobs.find((j) => j.state === "done" && j.seed !== null)?.seed ?? null,
  );

  return (
    <div className="flex items-end gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-fg-2">Seed</span>
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
      </div>
      <div className="flex w-36 shrink-0 flex-col gap-1">
        <span className="text-xs text-fg-2">After generation</span>
        <Select
          value={mode}
          onChange={(seedMode) => setRun({ seedMode })}
          options={MODES}
          label="After generation"
          className="w-full"
        />
      </div>
    </div>
  );
}
