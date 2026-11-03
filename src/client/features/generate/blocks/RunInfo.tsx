/**
 * What a finished run used, under the image (the old app's info grid): Open folder, then tiles
 * for the prompt, negative, sampling values, seed, size, model and LoRAs. It reads the job log
 * (`/api/history/jobs/:id`), which keeps each run's values by binding id; the run's workflow says
 * which binding has which role.
 */
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useJobRecord, useWorkflow } from "@client/lib/queries";
import { Button, toast } from "@client/ui";
import type { Role } from "@shared/workflow/roles";
import type { ReactNode } from "react";

function Tile({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-2.5",
        wide && "col-span-full",
      )}
    >
      <span className="text-xs text-fg-3">{label}</span>
      <span className="break-words text-sm text-fg select-text">{children}</span>
    </div>
  );
}

export function RunInfo({ jobId }: { jobId: string }) {
  const record = useJobRecord(jobId).data;
  const bindings = useWorkflow(record?.workflowId ?? null).data?.bindings ?? [];
  if (!record) return null;
  const role = (r: Role): string | null => {
    const b = bindings.find((x) => x.role === r);
    const v = b ? record.values[b.id] : undefined;
    return v === undefined || v === null || v === "" ? null : String(v);
  };
  const sampling: Array<[string, string | null]> = [
    ["Steps", role("sampler.steps")],
    ["Sampler", role("sampler.name")],
    ["Scheduler", role("sampler.scheduler")],
    ["CFG", role("sampler.cfg")],
  ];
  const imageId = record.imageId;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center gap-2">
        <Button
          icon="folder-open"
          disabled={imageId === null}
          title={imageId === null ? "The gallery hasn't found this image yet" : undefined}
          onClick={() => {
            if (imageId !== null)
              api.revealImage(imageId).catch((e: Error) => toast(e.message, "error"));
          }}
        >
          Open folder
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2">
        {record.prompt ? (
          <Tile label="Prompt" wide>
            <span className="font-mono text-xs">{record.prompt}</span>
          </Tile>
        ) : null}
        {record.negative ? (
          <Tile label="Negative" wide>
            {record.negative}
          </Tile>
        ) : null}
        {sampling.map(([label, value]) =>
          value !== null ? (
            <Tile key={label} label={label}>
              {value}
            </Tile>
          ) : null,
        )}
        {record.seed !== null ? (
          <Tile label="Seed">
            <span className="font-mono tabular">{record.seed}</span>
          </Tile>
        ) : null}
        {record.width && record.height ? (
          <Tile label="Size">
            <span className="font-mono tabular">
              {record.width}x{record.height}
            </span>
          </Tile>
        ) : null}
        {record.model ? (
          <div className="col-span-2 grid">
            <Tile label="Model">{record.model}</Tile>
          </div>
        ) : null}
        {record.loras.length ? (
          <Tile label={record.loras.length === 1 ? "LoRA" : "LoRAs"} wide>
            {record.loras.join(" · ")}
          </Tile>
        ) : null}
      </div>
    </div>
  );
}
