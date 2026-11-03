/**
 * Seed: the seed field beside what happens to it after each run, close together like one control. As in A1111, -1 means random: the field shows -1 while the mode is Randomize, typing
 * a number switches to Fixed, and typing -1 switches back. On its own it's a card; inside a card
 * (`bare`, the default layout's First pass) it's just the row. Batch count and size sit with the
 * size (Resolution).
 */

import { SectionTitle, Select, TextField } from "@client/ui";
import type { SeedMode } from "@shared/workflow/manifest";
import { useState } from "react";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";

const MODES: Array<{ value: SeedMode; label: string }> = [
  { value: "random", label: "Randomize" },
  { value: "fixed", label: "Fixed" },
  { value: "increment", label: "Increment" },
  { value: "decrement", label: "Decrement" },
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
  // What's typed while editing ("-", "" or "-12" aren't values yet); the value shows otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = mode === "random" ? "-1" : String(seed ?? 0);
  const type = (text: string) => {
    if (!/^-?\d*$/.test(text)) return;
    setDraft(text);
    if (text === "-1") setRun({ seedMode: "random" });
    else if (/^\d+$/.test(text)) {
      setSeed(Number(text));
      if (mode === "random") setRun({ seedMode: "fixed" });
    }
  };

  return (
    <div className="flex items-end gap-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-fg-2">Seed</span>
        <TextField
          value={draft ?? shown}
          onChange={(e) => type(e.target.value.trim())}
          onBlur={() => setDraft(null)}
          inputMode="numeric"
          mono
          aria-label="Seed (-1 is random)"
        />
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
