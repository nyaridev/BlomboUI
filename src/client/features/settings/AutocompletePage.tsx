/**
 * Settings → Autocomplete: what the prompt editor suggests (tag lists, LoRAs and trigger words,
 * wildcards, frequent tags), how a suggestion goes in, and the Ctrl+↑/↓ weight step. Tag lists
 * are CSV files: a bundled starter list plus any you add or download (TAG_SOURCES), kept in the
 * profile's tags folder.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { formatBytes } from "@client/lib/number";
import {
  qk,
  queryClient,
  useSettings,
  useTagLists,
  useTagSources,
  useUpdateSettings,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Dialog,
  DropZone,
  Field,
  IconButton,
  NumberField,
  Panel,
  Segmented,
  Spinner,
  Switch,
  toast,
} from "@client/ui";
import type { TagSourceInfo } from "@shared/autocomplete";
import { type ReactNode, useState } from "react";
import { PromptEditor } from "../generate/PromptEditor";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function invalidateLists() {
  void queryClient.invalidateQueries({ queryKey: qk.tagLists(useSession.getState().profileId) });
}

function TagLists() {
  const lists = useTagLists();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const [adding, setAdding] = useState(false);
  const disabled = settings?.autocomplete.disabledLists ?? [];
  const toggle = (id: string, on: boolean) =>
    update.mutate({
      autocomplete: {
        disabledLists: on ? disabled.filter((d) => d !== id) : [...new Set([...disabled, id])],
      },
    });
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="label-caps">Tag lists</span>
        <span className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon="folder-open"
            onClick={() => void api.revealTagLists().catch((e) => toast(message(e), "error"))}
          >
            Show folder
          </Button>
        </span>
      </div>
      {lists.isLoading ? (
        <div className="grid h-16 place-items-center">
          <Spinner />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {(lists.data?.lists ?? []).map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2">
              <Icon name="file-text" size={16} className="text-fg-3" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-fg">{l.name}</span>
                <span className="truncate font-mono text-2xs text-fg-3">
                  {l.error ? (
                    <span className="text-danger">Couldn't read it: {l.error}</span>
                  ) : (
                    `${l.file} · ${l.tags.toLocaleString()} tags`
                  )}
                </span>
              </div>
              <Badge tone={l.source === "bundled" ? "neutral" : "accent"}>
                {l.source === "bundled" ? "Bundled" : "This profile"}
              </Badge>
              {l.source === "profile" ? (
                <IconButton
                  icon="trash"
                  label={`Remove ${l.name}`}
                  size="sm"
                  onClick={async () => {
                    try {
                      await api.removeTagList(l.file);
                      invalidateLists();
                      toast(`Moved ${l.file} to the profile's trash`, "success");
                    } catch (e) {
                      toast(message(e), "error");
                    }
                  }}
                />
              ) : null}
              <Switch
                size="sm"
                checked={l.enabled}
                disabled={Boolean(l.error)}
                onCheckedChange={(on) => toggle(l.id, on)}
                label={`Use ${l.name}`}
              />
            </li>
          ))}
        </ul>
      )}
      <Downloads have={new Set((lists.data?.lists ?? []).map((l) => l.file.toLowerCase()))} />
      <DropZone
        compact
        busy={adding}
        accept=".csv,text/csv"
        title="Add a tag list"
        hint="A CSV with one tag per line: name, category, count, aliases (the format tag-complete lists use, such as Danbooru or e621 exports)."
        onFile={async (file) => {
          setAdding(true);
          try {
            const info = await api.addTagList(file);
            invalidateLists();
            toast(`Added ${info.name} (${info.tags.toLocaleString()} tags)`, "success");
          } catch (e) {
            toast(message(e), "error");
          } finally {
            setAdding(false);
          }
        }}
      />
    </Panel>
  );
}

/** "2026-10-01" → "Oct 2026"; "2024-12" → "Dec 2024". */
function monthOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/** Ready-made lists from GitHub, one click each, with how fresh each one is. */
function Downloads({ have }: { have: Set<string> }) {
  const sources = useTagSources();
  const [busy, setBusy] = useState<TagSourceInfo["id"] | null>(null);
  const download = async (s: TagSourceInfo) => {
    setBusy(s.id);
    try {
      const info = await api.downloadTagList(s.id);
      invalidateLists();
      toast(
        `Added ${s.name}${s.date ? ` from ${monthOf(s.date)}` : ""} (${info.tags.toLocaleString()} tags)`,
        "success",
      );
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-fg">Download a list</span>
        <span className="text-xs text-fg-3">from GitHub, the newest version of each</span>
      </div>
      {sources.isLoading ? (
        <div className="grid h-16 place-items-center">
          <Spinner />
        </div>
      ) : sources.isError ? (
        <span className="text-xs text-danger">
          Couldn't list them ({message(sources.error)}). Check your connection.
        </span>
      ) : null}
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line empty:hidden">
        {(sources.data ?? []).map((s) => {
          const added = have.has(s.file);
          return (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <Icon name="download" size={16} className="text-fg-3" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm text-fg">{s.name}</span>
                  <span className="text-2xs text-fg-4" title={`github.com/${s.repo}`}>
                    {s.date ? monthOf(s.date) : "date unknown"}
                  </span>
                </span>
                <span className="text-xs text-fg-3">{s.hint}</span>
              </div>
              {s.bytes ? (
                <span className="font-mono text-2xs text-fg-4 tabular max-lg:hidden">
                  {formatBytes(s.bytes)}
                </span>
              ) : null}
              {added ? (
                <Badge tone="success">
                  <Icon name="check" size={12} /> Added
                </Badge>
              ) : (
                <Button
                  size="sm"
                  icon="download"
                  loading={busy === s.id}
                  disabled={busy !== null && busy !== s.id}
                  onClick={() => void download(s)}
                >
                  Download
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FrequentTags() {
  const lists = useTagLists();
  const maxWords = useSettings().data?.autocomplete.frequentMaxWords ?? 3;
  const update = useUpdateSettings();
  const [confirm, setConfirm] = useState(false);
  const frequent = lists.data?.frequent ?? [];
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="label-caps">Your frequent tags</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon="eraser"
          disabled={!frequent.length}
          onClick={() => setConfirm(true)}
        >
          Forget them
        </Button>
      </div>
      <div className="flex items-center gap-3 max-lg:flex-col max-lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm text-fg">Longest tag counted</span>
          <span className="text-xs text-fg-3">
            Prompt parts with more words are left out: "dark blue hair" (3 words) counts, "she has
            blue eyes" (4) doesn't.
          </span>
        </div>
        <NumberField
          value={maxWords}
          onChange={(frequentMaxWords) =>
            update.mutate(
              { autocomplete: { frequentMaxWords } },
              { onSuccess: invalidateLists, onError: (e) => toast(message(e), "error") },
            )
          }
          min={1}
          max={10}
          step={1}
          unit="words"
          label="Longest tag counted"
          className="w-[130px]"
        />
      </div>
      {frequent.length ? (
        <ol className="scroll-quiet flex max-h-[360px] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
          {frequent.map((f, i) => (
            <li key={f.tag} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="w-6 shrink-0 text-right text-2xs text-fg-4 tabular">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{f.tag.replace(/_/g, " ")}</span>
              <span className="text-xs text-fg-3 tabular">{f.uses}×</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-fg-3">
          Tags you generate with at least twice show up here, and first in suggestions.
        </p>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Forget your frequent tags?"
        description="Suggestions stop putting them first. They come back as you generate."
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setConfirm(false);
                await api.clearFrequentTags().catch((e) => toast(message(e), "error"));
                invalidateLists();
              }}
            >
              Forget them
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </Panel>
  );
}

function TryIt() {
  const [text, setText] = useState("masterpiece, long ");
  return (
    <Panel className="flex flex-col gap-2 p-4">
      <span className="label-caps">Try it</span>
      <PromptEditor
        label="Try autocomplete"
        value={text}
        onChange={setText}
        minRows={2}
        className="h-[76px]"
        placeholder="Type a tag, < for LoRAs, __ for wildcards"
      />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-3">
        <span>
          Type a tag, <code className="font-mono">{"<"}</code> for LoRAs,{" "}
          <code className="font-mono">__</code> for wildcards.
        </span>
        <span>Ctrl+Space shows suggestions. Ctrl+↑/↓ changes the weight at the cursor.</span>
      </p>
    </Panel>
  );
}

export function AutocompletePage({ header }: { header: ReactNode }) {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const ac = settings?.autocomplete;
  if (!ac) return header;
  const set = (patch: Record<string, unknown>) => update.mutate({ autocomplete: patch });
  const source = (key: keyof typeof ac.sources, label: string, hint: string) => (
    <Field label={label} layout="left" hint={hint}>
      <Switch
        checked={ac.sources[key]}
        disabled={!ac.enabled}
        onCheckedChange={(on) => set({ sources: { [key]: on } })}
        label={label}
      />
    </Field>
  );
  const toggle = (key: keyof typeof ac, label: string, hint: string) => (
    <Field label={label} layout="left" hint={hint}>
      <Switch
        checked={Boolean(ac[key])}
        disabled={!ac.enabled}
        onCheckedChange={(on) => set({ [key]: on })}
        label={label}
      />
    </Field>
  );
  return (
    <>
      {header}
      <div className="flex flex-col gap-8">
        <Field
          label="Suggest as you type"
          layout="left"
          hint="In every prompt box on the Generate screen and in stage prompts."
        >
          <Switch
            checked={ac.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
            label="Suggest as you type"
          />
        </Field>
        <TryIt />
        <section className="flex flex-col gap-5">
          <h2 className="label-caps">Suggestions from</h2>
          {source("tags", "Tag lists", "The lists below, most used tags first.")}
          {source("loras", "LoRAs", "After <, the LoRAs in your models folder, with thumbnails.")}
          {source(
            "triggers",
            "LoRA trigger words",
            "Trigger words from Civitai info files and lookups.",
          )}
          {source(
            "wildcards",
            "Wildcards",
            "After __, the files and keys in your wildcards folder.",
          )}
          {source("frequent", "Frequent tags", "Tags you generate with often come first.")}
        </section>
        <TagLists />
        <section className="flex flex-col gap-5">
          <h2 className="label-caps">How suggestions go in</h2>
          <Field label="Start after" layout="left" hint="Characters to type before tags show up.">
            <Segmented
              size="sm"
              className="w-fit justify-self-start"
              label="Start after"
              value={String(ac.minChars)}
              onChange={(v) => set({ minChars: Number(v) })}
              options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </Field>
          <Field label="Suggestions shown" layout="left">
            <NumberField
              value={ac.maxResults}
              onChange={(maxResults) => set({ maxResults })}
              min={5}
              max={50}
              step={1}
              label="Suggestions shown"
              className="w-[110px]"
            />
          </Field>
          {toggle(
            "replaceUnderscores",
            "Spaces for underscores",
            '"long_hair" goes in as "long hair".',
          )}
          {toggle(
            "escapeParens",
            "Escape parentheses",
            'Tags like "name (artist)" go in as "name \\(artist\\)" so they aren\'t read as weights.',
          )}
          {toggle("appendComma", "Add a comma", "A comma and a space after each inserted tag.")}
          {toggle(
            "insertTriggers",
            "Insert trigger words",
            "Picking a LoRA also adds its trigger words.",
          )}
          {toggle(
            "thumbnails",
            "Thumbnails",
            "LoRA previews in the list (NSFW ones blurred, per Models).",
          )}
        </section>
        <FrequentTags />
      </div>
    </>
  );
}
