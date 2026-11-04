/**
 * Settings → Civitai: the profile's API key (sent to the server once, never shown again), what
 * the browser starts with, where downloads land and how they're named (author prefixes), marks,
 * the background lookup of local models, and how much history to keep. Saved to the profile.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useLive } from "@client/lib/live";
import { qk, useCivitaiAccount, useSettings, useUpdateSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Chip,
  Field,
  IconButton,
  NumberField,
  Segmented,
  Select,
  Switch,
  TextField,
  toast,
} from "@client/ui";
import {
  CIVITAI_FILTER_TYPES,
  CIVITAI_PERIOD_LABELS,
  CIVITAI_PERIODS,
  CIVITAI_SITE_URLS,
  CIVITAI_SITES,
  CIVITAI_SORTS,
  CIVITAI_TYPE_LABELS,
  type CivitaiSite,
} from "@shared/civitai";
import { aliasFor, autoPrefix, type PlanInput, planFileName, planFolder } from "@shared/downloads";
import {
  type AuthorAlias,
  type CivitaiSettings,
  DOWNLOAD_FOLDER_LABELS,
  DOWNLOAD_FOLDER_PARTS,
  type DownloadFolderPart,
} from "@shared/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SettingsSection } from "./common";

const EXAMPLE: PlanInput = {
  fileName: "sakura_haruno_ilxl.safetensors",
  modelName: "Sakura Haruno",
  versionName: "v1.0",
  baseModel: "Illustrious",
  creator: "yeetah145",
  tags: ["character"],
};

export function CivitaiPage({ header }: { header: React.ReactNode }) {
  const settings = useSettings().data?.civitai;
  const update = useUpdateSettings();
  const save = (patch: Record<string, unknown>) =>
    update.mutate({ civitai: patch }, { onError: (e) => toast(e.message, "error") });
  if (!settings) return <>{header}</>;
  const dl = settings.downloads;
  return (
    <>
      {header}
      <div className="flex flex-col gap-8">
        <Account site={settings.site} onSite={(site) => save({ site })} />

        <SettingsSection title="Browsing" icon="search">
          <Field label="Sort" layout="left">
            <Select
              value={settings.browse.sort}
              onChange={(sort) => save({ browse: { sort } })}
              className="w-56"
              options={CIVITAI_SORTS.map((s) => ({ value: s, label: s }))}
            />
          </Field>
          <Field label="Period" layout="left">
            <Segmented
              value={settings.browse.period}
              onChange={(period) => save({ browse: { period } })}
              options={CIVITAI_PERIODS.map((p) => ({ value: p, label: CIVITAI_PERIOD_LABELS[p] }))}
            />
          </Field>
          <Field
            label="Model types"
            layout="left"
            hint="What the browser shows first. None selected: every type."
          >
            <div className="flex flex-wrap gap-1.5">
              {CIVITAI_FILTER_TYPES.map((t) => {
                const on = settings.browse.types.includes(t);
                return (
                  <Chip
                    key={t}
                    size="sm"
                    selected={on}
                    onClick={() =>
                      save({
                        browse: {
                          types: on
                            ? settings.browse.types.filter((x) => x !== t)
                            : [...settings.browse.types, t],
                        },
                      })
                    }
                  >
                    {CIVITAI_TYPE_LABELS[t] ?? t}
                  </Chip>
                );
              })}
            </div>
          </Field>
        </SettingsSection>

        <SettingsSection title="Download folders" icon="folder">
          <Field
            label="Sort into folders by"
            layout="left"
            hint="Inside the kind folder (loras/, checkpoints/…), in this order."
          >
            <FolderParts
              value={dl.folderBy}
              onChange={(folderBy) => save({ downloads: { folderBy } })}
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="File names" icon="file">
          <Field label="Name files by" layout="left">
            <Segmented
              value={dl.naming}
              onChange={(naming) => save({ downloads: { naming } })}
              options={[
                { value: "model", label: "Model name" },
                { value: "model-version", label: "Model and version" },
                { value: "original", label: "Civitai's file name" },
              ]}
            />
          </Field>
          <Field
            label="Author prefix"
            layout="left"
            hint="Each file starts with its author's prefix, so two authors' models with the same name never collide."
          >
            <Switch
              checked={dl.prefix}
              onCheckedChange={(prefix) => save({ downloads: { prefix } })}
              label="Start file names with the author's prefix"
            />
          </Field>
          <Field
            label="Make prefixes"
            layout="left"
            hint="An author without a prefix gets one on their first download: the first letter, the consonants and the digits of their name (yeetah145 → yth145). It's kept in the list below."
          >
            <Switch
              checked={dl.autoAliases}
              disabled={!dl.prefix}
              onCheckedChange={(autoAliases) => save({ downloads: { autoAliases } })}
              label="Make prefixes automatically"
            />
          </Field>
          <Field
            label="Author prefixes"
            layout="left"
            hint="Change one by adding the author again with a new prefix. No two authors can share one."
          >
            <Aliases value={dl.aliases} onChange={(aliases) => save({ downloads: { aliases } })} />
          </Field>
          <Field label="Example" layout="left">
            <code className="pt-1.5 font-mono text-xs break-all text-fg-2">
              {[
                "loras",
                planFolder(EXAMPLE, dl.folderBy),
                planFileName(EXAMPLE, dl.naming, examplePrefix(dl)),
              ]
                .filter(Boolean)
                .join("/")}
            </code>
          </Field>
        </SettingsSection>

        <SettingsSection title="Downloads" icon="download">
          <Field label="At the same time" layout="left" hint="Files downloading in parallel.">
            <Segmented
              value={String(dl.parallel) as "1" | "2" | "3" | "4"}
              onChange={(v) => save({ downloads: { parallel: Number(v) } })}
              options={(["1", "2", "3", "4"] as const).map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field
            label="Info next to the model"
            layout="left"
            hint="A .civitai.info file (name, trigger words, base model) that Blombo and other tools read."
          >
            <Switch
              checked={dl.saveInfo}
              onCheckedChange={(saveInfo) => save({ downloads: { saveInfo } })}
              label="Save the info file"
            />
          </Field>
          <Field
            label="Preview image"
            layout="left"
            hint="The first image as the model's picture, in the folder named after it."
          >
            <Switch
              checked={dl.savePreview}
              onCheckedChange={(savePreview) => save({ downloads: { savePreview } })}
              label="Save a preview image"
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="Your models" icon="models">
          <Field
            label="Installed marks"
            layout="left"
            hint={`"Installed" and "Update" on Civitai models you already have.`}
          >
            <Switch
              checked={settings.marks}
              onCheckedChange={(marks) => save({ marks })}
              label="Mark models you have"
            />
          </Field>
          <Field
            label="Look up local models"
            layout="left"
            hint="Models without an info file are hashed in the background and looked up on Civitai for their thumbnail, trigger words and base model. Nothing is written next to them."
          >
            <div className="flex flex-col gap-2">
              <Switch
                checked={settings.lookup}
                onCheckedChange={(lookup) => save({ lookup })}
                label="Look up local models on Civitai"
              />
              {settings.lookup ? <LookupNow /> : null}
            </div>
          </Field>
        </SettingsSection>

        <SettingsSection title="History" icon="history">
          <HistoryLimit
            label="Downloads to keep"
            value={settings.history.downloads}
            min={20}
            max={5000}
            onChange={(downloads) => save({ history: { downloads } })}
          />
          <HistoryLimit
            label="Opened models to keep"
            value={settings.history.views}
            min={20}
            max={2000}
            onChange={(views) => save({ history: { views } })}
          />
          <HistoryLimit
            label="Searches to keep"
            value={settings.history.searches}
            min={0}
            max={100}
            hint="0 keeps none."
            onChange={(searches) => save({ history: { searches } })}
          />
        </SettingsSection>
      </div>
    </>
  );
}

/* ── account ────────────────────────────────────────────────────────────── */

function Account({ site, onSite }: { site: CivitaiSite; onSite: (site: CivitaiSite) => void }) {
  const account = useCivitaiAccount();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = account.data;
  const done = (next: Awaited<ReturnType<typeof api.civitaiAccount>>) => {
    qc.setQueryData(qk.civitaiAccount(profileId), next);
    void qc.invalidateQueries({ queryKey: qk.civitai(profileId) });
    setKey("");
    setEditing(false);
    setError(null);
  };
  const submit = async (check: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.setCivitaiKey(key.trim(), check);
      done(next);
      toast(next.username ? `Connected as ${next.username}` : "API key saved", "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection title="Account" icon="globe">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-field text-accent-ink">
            <Icon name="globe" size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-fg">Civitai account</span>
            <span className="text-xs text-fg-3">
              {a?.keySet
                ? a.username
                  ? `Connected as ${a.username} · key ending in ${a.keyHint}`
                  : `Key ending in ${a.keyHint} saved (not checked)`
                : "Browsing works without a key. Early-access and some other downloads need one."}
            </span>
          </div>
          {a?.keySet ? (
            <Badge tone="success">
              <Icon name="check" size={11} /> Key saved
            </Badge>
          ) : null}
        </div>
        {!a?.keySet || editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(true);
            }}
          >
            <div className="flex gap-2">
              <TextField
                type="password"
                autoComplete="off"
                spellCheck={false}
                mono
                icon="lock"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste your Civitai API key"
                className="flex-1"
                invalid={Boolean(error)}
                aria-label="Civitai API key"
              />
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={key.trim().length < 8}
              >
                Check and save
              </Button>
              {editing ? (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
            {error ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-danger">
                <Icon name="errors" size={13} />
                {error}
                {/Can't reach|took too long/.test(error) ? (
                  <Button size="sm" variant="ghost" onClick={() => void submit(false)}>
                    Save without checking
                  </Button>
                ) : null}
              </div>
            ) : (
              <span className="text-xs text-fg-3">
                Create one on{" "}
                <a
                  href={`${CIVITAI_SITE_URLS[site]}/user/account`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent-ink hover:underline"
                >
                  civitai.{site} → Account settings → API keys
                </a>
                . It stays on this computer, in this profile's folder.
              </span>
            )}
          </form>
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" icon="edit" onClick={() => setEditing(true)}>
              Replace key
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              onClick={() =>
                void api
                  .removeCivitaiKey()
                  .then((next) => {
                    done(next);
                    toast("API key removed", "success");
                  })
                  .catch((e: Error) => toast(e.message, "error"))
              }
            >
              Remove key
            </Button>
          </div>
        )}
      </div>
      <Field
        label="Site"
        layout="left"
        hint="civitai.com shows SFW models only; civitai.red has every model, NSFW included. Browsing, downloads and Civitai links use the one you pick."
      >
        <Segmented
          value={site}
          onChange={onSite}
          options={CIVITAI_SITES.map((s) => ({ value: s, label: `civitai.${s}` }))}
          label="Civitai site"
        />
      </Field>
    </SettingsSection>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

/** The example author's prefix, worked out the way a download would. */
function examplePrefix(dl: CivitaiSettings["downloads"]): string | null {
  const creator = EXAMPLE.creator ?? "";
  if (!dl.prefix || !creator) return null;
  const known = aliasFor(creator, dl.aliases);
  if (known || !dl.autoAliases) return known;
  return autoPrefix(
    creator,
    dl.aliases.map((a) => a.to),
  );
}

function FolderParts({
  value,
  onChange,
}: {
  value: DownloadFolderPart[];
  onChange: (v: DownloadFolderPart[]) => void;
}) {
  const rest = DOWNLOAD_FOLDER_PARTS.filter((p) => !value.includes(p));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.length === 0 ? (
        <span className="text-sm text-fg-3">No subfolders</span>
      ) : (
        value.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 ? <Icon name="chevron-right" size={13} className="text-fg-4" /> : null}
            <Chip size="sm" selected onRemove={() => onChange(value.filter((x) => x !== p))}>
              {DOWNLOAD_FOLDER_LABELS[p]}
            </Chip>
          </span>
        ))
      )}
      {rest.length ? <span className="mx-1 h-5 w-px bg-line" /> : null}
      {rest.map((p) => (
        <Chip key={p} size="sm" icon="plus" onClick={() => onChange([...value, p])}>
          {DOWNLOAD_FOLDER_LABELS[p]}
        </Chip>
      ))}
    </div>
  );
}

function Aliases({
  value,
  onChange,
}: {
  value: AuthorAlias[];
  onChange: (v: AuthorAlias[]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  // A prefix another author has would let their files collide.
  const clash = to.trim() ? value.find((a) => same(a.to, to) && !same(a.from, from)) : undefined;
  const sorted = [...value].sort((a, b) => a.from.localeCompare(b.from));
  return (
    <div className="flex max-w-xl flex-col gap-2">
      {sorted.length ? (
        <ul className="scroll-quiet flex max-h-56 flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
          {sorted.map((a) => (
            <li key={a.from} className="flex items-center gap-2 px-2.5 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-fg-2">{a.from}</span>
              <Icon name="arrow-right" size={13} className="text-fg-4" />
              <span className="min-w-0 flex-1 truncate font-mono text-fg">{a.to}</span>
              <IconButton
                icon="x"
                label={`Remove the prefix for ${a.from}`}
                size="xs"
                onClick={() => onChange(value.filter((x) => x.from !== a.from))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-fg-3">No prefixes yet.</span>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!from.trim() || !to.trim() || clash) return;
          onChange([
            ...value.filter((x) => !same(x.from, from)),
            { from: from.trim(), to: to.trim() },
          ]);
          setFrom("");
          setTo("");
        }}
      >
        <TextField
          size="sm"
          mono
          value={from}
          maxLength={60}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Civitai username"
          className="flex-1"
          aria-label="Civitai username"
        />
        <Icon name="arrow-right" size={13} className="text-fg-4" />
        <TextField
          size="sm"
          mono
          value={to}
          maxLength={40}
          invalid={Boolean(clash)}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Prefix"
          className="flex-1"
          aria-label="Prefix for that author"
        />
        <Button
          size="sm"
          type="submit"
          icon="plus"
          disabled={!from.trim() || !to.trim() || Boolean(clash)}
        >
          Add
        </Button>
      </form>
      {clash ? (
        <span className="flex items-center gap-1.5 text-xs text-danger">
          <Icon name="x-circle" size={13} />
          {clash.from} already uses "{clash.to}". Pick another prefix.
        </span>
      ) : null}
    </div>
  );
}

function LookupNow() {
  const lookup = useLive((s) => s.lookup);
  useEffect(() => {
    if (!useLive.getState().lookup)
      void api.modelLookup().then(
        (l) => useLive.setState({ lookup: l }),
        () => undefined,
      );
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-fg-3">
      {lookup?.running ? (
        <span className="tabular">
          Checking {lookup.done} of {lookup.total}
          {lookup.found ? ` · ${lookup.found} found` : ""}
        </span>
      ) : (
        <>
          {lookup?.error ? <span className="text-warning">{lookup.error}</span> : null}
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            onClick={() =>
              void api
                .startModelLookup()
                .then((l) => useLive.setState({ lookup: l }))
                .catch((e: Error) => toast(e.message, "error"))
            }
          >
            Check new models now
          </Button>
        </>
      )}
    </div>
  );
}

function HistoryLimit({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 500);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <Field label={label} layout="left" hint={hint}>
      <NumberField
        value={draft}
        onChange={setDraft}
        min={min}
        max={max}
        step={10}
        className="w-40"
        label={label}
      />
    </Field>
  );
}
