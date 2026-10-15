/** Seed + batch: one card. Mode decides what happens after each run. */
import { IconButton, NumberField, SectionTitle, Segmented, TextField, toast } from "@client/ui";
import { useState } from "react";
import { useValue } from "../state";

type SeedMode = "random" | "fixed" | "inc" | "dec";

export function Seed() {
  const [seed, setSeed] = useValue<number>("sampler.seed");
  const [batch, setBatch] = useValue<number>("latent.batch");
  const [mode, setMode] = useState<SeedMode>("random");
  const [count, setCount] = useState(4);
  const last = 1_948_221_506;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <SectionTitle icon="seed">Seed & batch</SectionTitle>
      <div className="flex gap-1.5">
        <TextField
          value={mode === "random" ? "Random each run" : String(seed)}
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
          onClick={() => setSeed(Math.floor(Math.random() * 2 ** 32))}
        />
        <IconButton
          icon="undo"
          label={`Reuse last seed (${last})`}
          variant="secondary"
          onClick={() => {
            setSeed(last);
            setMode("fixed");
            toast(`Seed ${last} reused`, "info");
          }}
        />
      </div>
      <Segmented
        full
        size="sm"
        value={mode}
        onChange={setMode}
        label="After each run"
        options={[
          { value: "random", label: "Random" },
          { value: "fixed", label: "Fixed" },
          { value: "inc", label: "+1" },
          { value: "dec", label: "−1" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-2xs text-fg-3">Batch count</span>
          <NumberField value={count} onChange={setCount} min={1} max={100} label="Batch count" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-2xs text-fg-3">Batch size</span>
          <NumberField value={batch} onChange={setBatch} min={1} max={16} label="Batch size" />
        </div>
      </div>
    </div>
  );
}
