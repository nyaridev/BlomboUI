/**
 * Settings → Autocomplete: what the prompt editor suggests (tag lists, LoRAs and trigger words,
 * wildcards, frequent tags), how a suggestion goes in, and the Ctrl+↑/↓ weight step. Tag lists
 * are CSV files: a bundled starter list plus any you add, kept in the profile's tags folder.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { qk, queryClient, useSettings, useTagLists, useUpdateSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Chip,
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
import { WEIGHT_STEPS } from "@shared/settings";
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

function FrequentTags() {
  const lists = useTagLists();
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
      {frequent.length ? (
        <div className="flex flex-wrap gap-1.5">
          {frequent.map((f) => (
            <Chip key={f.tag} size="sm" count={f.uses}>
              {f.tag.replace(/_/g, " ")}
            </Chip>
          ))}
        </div>
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
        <section className="flex flex-col gap-5">
          <h2 className="label-caps">Weights</h2>
          <Field
            label="Ctrl+↑ / Ctrl+↓ step"
            layout="left"
            hint="Changes (tag:1.1) weights and <lora:name:0.8> strengths at the cursor."
          >
            <Segmented
              size="sm"
              className="w-fit justify-self-start"
              label="Weight step"
              value={String(ac.weightStep)}
              onChange={(v) => set({ weightStep: Number(v) })}
              options={WEIGHT_STEPS.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </Field>
        </section>
        <FrequentTags />
      </div>
    </>
  );
}
