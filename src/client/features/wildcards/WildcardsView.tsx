/**
 * Wildcard Manager: the profile's wildcards folder as a file tree, an editor for .txt and
 * .yaml files (raw text with YAML folding, lint and __reference__ completion, or line lists),
 * and a roll preview that samples what a wildcard expands to. Saving is atomic and refuses to
 * overwrite a file that changed on disk since it was opened.
 */
import { ApiError, api } from "@client/lib/api";
import { qk, useWildcardFile, useWildcardsChanged, useWildcardTree } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Badge, Button, EmptyState, IconButton, Kbd, Segmented, Skeleton, toast } from "@client/ui";
import { wildcardLines } from "@shared/prompt/wildcards";
import { flattenYamlWildcards, txtWildcardName, type WildcardFile } from "@shared/wildcards";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { parse as parseYaml } from "yaml";
import { LineEditor } from "./LineEditor";
import { RollPanel } from "./RollPanel";
import { useWildcardUi } from "./state";
import { TreePanel } from "./TreePanel";
import { WildcardEditor } from "./WildcardEditor";

export function WildcardsView() {
  const tree = useWildcardTree();
  if (tree.isLoading)
    return (
      <div className="flex h-full">
        <div className="w-[280px] space-y-2 border-r border-line p-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      </div>
    );
  if (tree.error)
    return (
      <EmptyState
        icon="errors"
        tone="warning"
        title="Couldn't read the wildcards folder"
        text={tree.error.message}
        action={<Button onClick={() => void tree.refetch()}>Try again</Button>}
      />
    );
  if (!tree.data?.root || !tree.data.exists)
    return (
      <EmptyState
        icon="wildcards"
        tone="warning"
        title={
          tree.data?.root
            ? "The wildcards folder isn't there"
            : "This profile has no wildcards folder"
        }
        text={
          tree.data?.root
            ? `${tree.data.root} doesn't exist. Pick the folder again in Settings → Folders.`
            : "Choose a folder for .txt and .yaml wildcards in Settings → Folders. __name__ in a prompt then picks a line from name.txt."
        }
      />
    );
  return (
    <div className="flex h-full">
      <TreePanel tree={tree.data} />
      <Editor names={tree.data.names} />
    </div>
  );
}

function Editor({ names }: { names: string[] }) {
  const open = useWildcardUi((s) => s.open);
  const file = useWildcardFile(open);
  if (!open)
    return (
      <EmptyState
        className="flex-1"
        icon="wildcards"
        title="Pick a wildcard file"
        text="Open a file on the left or create one. In prompts, __colors__ picks a random line from colors.txt, and YAML keys work the same way: __outfits/fantasy__."
      />
    );
  if (file.isLoading)
    return (
      <div className="flex-1 space-y-2 p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (file.error || !file.data)
    return (
      <EmptyState
        className="flex-1"
        icon="errors"
        tone="warning"
        title="Couldn't open that file"
        text={file.error?.message ?? "It may have been moved or deleted."}
      />
    );
  return <OpenFile key={`${file.data.path}:${file.data.mtime}`} file={file.data} names={names} />;
}

function OpenFile({ file, names }: { file: WildcardFile; names: string[] }) {
  const ui = useWildcardUi();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const changed = useWildcardsChanged();
  const draft = ui.drafts[file.path];
  const text = draft?.text ?? file.text;
  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(true);
  // Line-mode edits replace the text, so the raw editor reloads from it afterwards.
  const [rawKey, setRawKey] = useState(0);

  const setText = useCallback(
    (next: string) => {
      if (next === file.text) ui.dropDraft(file.path);
      else ui.setDraft(file.path, { text: next, baseMtime: file.mtime });
    },
    [file.path, file.text, file.mtime, ui],
  );

  const save = useCallback(async () => {
    const d = useWildcardUi.getState().drafts[file.path];
    if (!d) return;
    setSaving(true);
    try {
      const saved = await api.saveWildcard(file.path, d.text, d.baseMtime);
      useWildcardUi.getState().dropDraft(file.path);
      qc.setQueryData(qk.wildcardFile(profileId, file.path), saved);
      changed();
      toast(`Saved ${file.path}`, "success");
    } catch (e) {
      const conflict = e instanceof ApiError && e.code === "conflict";
      toast(
        (e as Error).message,
        "error",
        conflict
          ? {
              label: "Load theirs",
              run: () => {
                useWildcardUi.getState().dropDraft(file.path);
                void qc.invalidateQueries({ queryKey: qk.wildcardFile(profileId, file.path) });
              },
            }
          : undefined,
      );
    } finally {
      setSaving(false);
    }
  }, [changed, file.path, profileId, qc]);

  const knownNames = useMemo(() => {
    const out = new Set(names);
    if (file.format === "txt") out.add(txtWildcardName(file.path));
    else
      try {
        for (const k of flattenYamlWildcards(parseYaml(text)).keys()) out.add(k);
      } catch {
        // Lint shows the error.
      }
    return [...out].sort();
  }, [names, file.format, file.path, text]);

  const overrides = useMemo<Record<string, string[]>>(() => {
    if (file.format === "txt") return { [txtWildcardName(file.path)]: wildcardLines(text) };
    try {
      return Object.fromEntries(flattenYamlWildcards(parseYaml(text)));
    } catch {
      return {};
    }
  }, [file.format, file.path, text]);

  const rollText = useMemo(() => {
    if (file.format === "txt") return `__${txtWildcardName(file.path)}__`;
    const first = Object.keys(overrides)[0];
    return first ? `__${first}__` : "";
  }, [file.format, file.path, overrides]);

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <span className="min-w-0 truncate font-mono text-sm text-fg" title={file.path}>
            {file.path}
          </span>
          <Badge>{file.format === "yaml" ? "YAML" : "TXT"}</Badge>
          {draft ? <Badge tone="accent">Unsaved</Badge> : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Segmented
              size="sm"
              value={ui.mode}
              onChange={(m) => {
                if (m === "raw") setRawKey((k) => k + 1);
                ui.setMode(m);
              }}
              label="Editing mode"
              options={[
                { value: "raw", icon: "raw-mode", label: "Raw" },
                { value: "lines", icon: "line-mode", label: "Lines" },
              ]}
            />
            <IconButton
              icon="dice"
              label={rolling ? "Hide roll preview" : "Show roll preview"}
              size="sm"
              active={rolling}
              onClick={() => setRolling((r) => !r)}
            />
            {draft ? (
              <Button size="sm" variant="ghost" onClick={() => ui.dropDraft(file.path)}>
                Revert
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={draft ? "primary" : "secondary"}
              icon="save"
              disabled={!draft}
              loading={saving}
              onClick={() => void save()}
            >
              Save <Kbd className="ml-1">Ctrl S</Kbd>
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {ui.mode === "raw" ? (
            <WildcardEditor
              docKey={`${file.path}:${file.mtime}:${rawKey}`}
              text={text}
              format={file.format}
              names={knownNames}
              onChange={setText}
              onSave={() => void save()}
              className="h-full"
            />
          ) : (
            <LineEditor text={text} format={file.format} onChange={setText} />
          )}
        </div>
      </div>
      {rolling ? <RollPanel defaultText={rollText} overrides={overrides} /> : null}
    </div>
  );
}
