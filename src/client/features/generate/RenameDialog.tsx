/**
 * Rename from the Generate pickers: a model, a wildcard or a folder. One name field (the last
 * part only; an extension stays as it is), Enter renames. `run` does the rename and everything
 * after it; its error shows under the field.
 */
import { Button, Dialog, Field, TextField } from "@client/ui";
import { useState } from "react";

export interface RenameTarget {
  title: string;
  description: string;
  /** The current name, without its extension. */
  name: string;
  /** Shown after the field (".safetensors"). */
  suffix?: string;
  run: (name: string) => Promise<void>;
}

const BAD = /[\\/:*?"<>|]/;

export function RenameDialog({
  target,
  onClose,
}: {
  target: RenameTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title={target?.title ?? "Rename"}
      description={target?.description}
      width={460}
    >
      {/* Keyed so each target starts from its own name. */}
      {target ? (
        <RenameForm key={target.title + target.name} target={target} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function RenameForm({ target, onClose }: { target: RenameTarget; onClose: () => void }) {
  const [value, setValue] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bad = BAD.test(value);
  const can = Boolean(value.trim()) && !bad && value.trim() !== target.name && !busy;
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    setError(null);
    try {
      await target.run(value.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Name"
        error={bad ? 'Use a name without \\ / : * ? " < > |' : (error ?? undefined)}
      >
        {(id) => (
          <TextField
            id={id}
            value={value}
            autoFocus
            invalid={bad || Boolean(error)}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            trailing={
              target.suffix ? (
                <span className="font-mono text-xs text-fg-3">{target.suffix}</span>
              ) : undefined
            }
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} disabled={!can} onClick={() => void submit()}>
          Rename
        </Button>
      </div>
    </div>
  );
}
