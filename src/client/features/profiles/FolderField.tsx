/** Folder input with a native Browse dialog and a live check of what's in the folder. */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { Button, Chip, TextField } from "@client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function FolderField({
  value,
  onChange,
  pickTitle,
  placeholder,
  expectModels,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  pickTitle: string;
  placeholder: string;
  expectModels?: boolean;
  id?: string;
}) {
  const [debounced, setDebounced] = useState(value);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(t);
  }, [value]);
  const check = useQuery({
    queryKey: ["check-path", debounced],
    queryFn: () => api.checkPath(debounced),
    enabled: debounced.trim().length > 0,
    staleTime: 5_000,
  });

  const browse = async () => {
    setPicking(true);
    try {
      const res = await api.pickFolder(pickTitle, value || undefined);
      if (res.path) onChange(res.path);
    } finally {
      setPicking(false);
    }
  };

  const status = (() => {
    if (!value.trim()) return null;
    const r = check.data;
    if (!r) return { tone: "muted", icon: "clock", text: "Checking…" } as const;
    if (r.exists && !r.isDirectory)
      return {
        tone: "danger",
        icon: "x-circle",
        text: "That path is a file, not a folder.",
      } as const;
    if (!r.exists)
      return {
        tone: "warning",
        icon: "folder",
        text: "Doesn't exist yet. BlomboUI will create it.",
      } as const;
    if (!r.writable)
      return {
        tone: "warning",
        icon: "lock",
        text: "Read-only. Fine for models, not for outputs.",
      } as const;
    return { tone: "success", icon: "check-circle", text: "Folder found." } as const;
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <TextField
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          icon="folder"
          mono
          className="flex-1"
          onClear={() => onChange("")}
        />
        <Button onClick={browse} loading={picking} icon="folder-open">
          Browse
        </Button>
      </div>
      {status ? (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs",
            status.tone === "success" && "text-success",
            status.tone === "warning" && "text-warning",
            status.tone === "danger" && "text-danger",
            status.tone === "muted" && "text-fg-3",
          )}
        >
          <Icon name={status.icon} size={13} />
          {status.text}
        </div>
      ) : null}
      {expectModels && check.data?.modelFolders.length ? (
        <div className="flex flex-wrap gap-1">
          {check.data.modelFolders.map((f) => (
            <Chip key={f} size="sm" icon="check">
              {f}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
