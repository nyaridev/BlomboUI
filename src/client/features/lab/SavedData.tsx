/**
 * The Data page (dev mode only, a page of the Lab): what the open profile keeps and what an image
 * carries, read from the running app so it can be checked by eye. The profile folder (names and
 * sizes only), the database's tables with their columns and row counts, the shapes of the saved
 * files (from their Zod schemas), and one gallery image's metadata chunks as written, with what
 * the index made of them.
 */
import { Icon } from "@client/icons/Icon";
import { formatBytes } from "@client/lib/number";
import { useDevImage, useDevStorage, useGalleryImages } from "@client/lib/queries";
import { Badge, Collapsible, CopyButton, EmptyState, Panel, Select, Skeleton } from "@client/ui";
import type { DevChunk, DevTable } from "@shared/dev";
import { CivitaiSidecar } from "@shared/gallery";
import { SnippetsFile } from "@shared/history";
import { BlomboImageMeta, ImageSettings, ImageSummary } from "@shared/imageinfo";
import { LayoutDocument } from "@shared/layout/schema";
import { Profile, ProfileRegistry, ProfileSecrets } from "@shared/profile";
import { Settings } from "@shared/settings";
import { WorkflowManifest } from "@shared/workflow/manifest";
import { type ReactNode, useMemo, useState } from "react";
import { z } from "zod";
import { schemaRows } from "./schemaTree";

/** The files a profile saves, each with the schema it's read with. */
const FORMATS: Array<{ file: string; what: string; schema: z.ZodType }> = [
  {
    file: "data/profiles.json",
    what: "Profile order and the one opened on launch",
    schema: ProfileRegistry,
  },
  { file: "profile.json", what: "Name, look, folders", schema: Profile },
  { file: "settings.json", what: "Every setting", schema: Settings },
  {
    file: "secrets.json",
    what: "The Civitai key (never sent to the page)",
    schema: ProfileSecrets,
  },
  { file: "workflows/<id>/workflow.json", what: "A workflow's manifest", schema: WorkflowManifest },
  { file: "layouts/<id>.json", what: "A Generate layout", schema: LayoutDocument },
  { file: "snippets.json", what: "Saved prompt snippets", schema: SnippetsFile },
  {
    file: "<image>.civitai.json",
    what: "Beside an image added from Civitai",
    schema: CivitaiSidecar,
  },
  {
    file: "images.summary (database)",
    what: "What the gallery shows for an image",
    schema: ImageSummary,
  },
  { file: "images.settings (database)", what: "Use these settings", schema: ImageSettings },
];

/** What an image Blombo makes carries (PNG text chunks; EXIF or comments in other formats). */
const CHUNKS: Array<[string, string]> = [
  ["prompt", "ComfyUI's API graph: every node and input as it ran. LoRAs are loader nodes here."],
  ["workflow", "ComfyUI's canvas graph (what Import workflow and ComfyUI's Load read)."],
  [
    "blombo",
    "Blombo's own record: workflow, seed, values, prompts (its shape is under Saved formats).",
  ],
  ["parameters", "A1111 / Forge text (images from those apps; Blombo doesn't write it)."],
];

export function SavedData({ switcher }: { switcher: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-[6px]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-8 py-2.5 max-lg:px-4">
          <span className="mr-2 flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon name="lab" size={16} className="text-accent-ink" />
            Design Lab
          </span>
          {switcher}
          <nav className="ml-auto flex flex-wrap gap-0.5 text-xs">
            {[
              ["files", "Files"],
              ["tables", "Tables"],
              ["formats", "Formats"],
              ["image", "Image metadata"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#data-${id}`}
                className="rounded-sm px-2 py-1 text-fg-3 hover:bg-field hover:text-fg"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-8 py-8 max-lg:px-4">
        <Storage />
        <Formats />
        <ImageMeta />
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`data-${id}`} className="flex scroll-mt-16 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-balance text-fg">{title}</h2>
        <p className="max-w-[72ch] text-sm text-fg-3">{text}</p>
      </div>
      {children}
    </section>
  );
}

function Storage() {
  const q = useDevStorage();
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error || !q.data)
    return (
      <EmptyState
        icon="errors"
        tone="warning"
        title="Couldn't read the profile"
        text={q.error?.message}
      />
    );
  const s = q.data;
  const indexOf = (path: string) => path.split("/").length - 1;
  return (
    <>
      <Section
        id="files"
        title="Profile folder"
        text={
          <>
            Everything the open profile keeps, in{" "}
            <span className="font-mono text-fg-2">{s.dir}</span>. Names and sizes only; the trash
            shows as one row.
          </>
        }
      >
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {s.files.map((f) => (
                <tr key={f.path}>
                  <td className="py-1.5 pr-4 pl-4">
                    <span
                      className="flex items-center gap-2 font-mono text-xs text-fg-2"
                      style={{ paddingLeft: indexOf(f.path) * 16 }}
                    >
                      <Icon
                        name={f.dir ? "folder" : "file"}
                        size={13}
                        className="shrink-0 text-fg-4"
                      />
                      {f.path.split("/").pop()}
                      {f.path === "secrets.json" ? <Badge tone="warning">never sent</Badge> : null}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4 text-right text-xs whitespace-nowrap text-fg-3 tabular">
                    {f.files !== null
                      ? `${f.files.toLocaleString()} files · ${formatBytes(f.size)}`
                      : f.dir
                        ? ""
                        : formatBytes(f.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.truncated ? (
            <p className="border-t border-line px-4 py-2 text-xs text-fg-3">The list stops here.</p>
          ) : null}
        </Panel>
      </Section>
      <Section
        id="tables"
        title="Database"
        text={
          <>
            <span className="font-mono text-fg-2">blombo.sqlite</span>, at migration {s.db.version}{" "}
            of {s.db.latest}. The gallery index rows can be rebuilt; favorites, marks, the trash
            list and the job log can't. FTS5's own tables are left out.
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          {s.db.tables.map((t) => (
            <TableCard key={t.name} table={t} />
          ))}
        </div>
      </Section>
    </>
  );
}

function TableCard({ table: t }: { table: DevTable }) {
  return (
    <Collapsible
      title={<span className="font-mono">{t.name}</span>}
      subtitle={`${t.rows === null ? "?" : t.rows.toLocaleString()} rows · ${t.columns.length} columns${t.kind === "table" ? "" : ` · ${t.kind}`}`}
      defaultOpen={false}
    >
      <div className="flex flex-col gap-3">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-line">
            {t.columns.map((c) => (
              <tr key={c.name}>
                <td className="py-1 pr-3 font-mono text-fg">
                  {c.name}
                  {c.pk ? <span className="ml-1.5 text-accent-ink">key</span> : null}
                </td>
                <td className="py-1 pr-3 font-mono text-fg-3">{c.type || "any"}</td>
                <td className="py-1 text-right text-fg-4">
                  {[c.notNull ? "not null" : null, c.default !== null ? `= ${c.default}` : null]
                    .filter(Boolean)
                    .join(" ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {t.indexes.length ? (
          <p className="text-xs text-fg-3">
            Indexes: <span className="font-mono text-fg-2">{t.indexes.join(", ")}</span>
          </p>
        ) : null}
        <Code text={t.sql} label="SQL" />
      </div>
    </Collapsible>
  );
}

function Formats() {
  const formats = useMemo(
    () => [
      ...FORMATS,
      {
        file: 'the image\'s "blombo" chunk',
        what: "Written into every image Blombo makes",
        schema: BlomboImageMeta,
      },
    ],
    [],
  );
  return (
    <Section
      id="formats"
      title="Saved formats"
      text="The shape of each file the profile saves, read from the schema it's checked with (fields, types and defaults). Values that are missing or broken on disk fall back to these defaults one by one."
    >
      <div className="flex flex-col gap-2">
        {formats.map((f) => (
          <SchemaCard key={f.file} {...f} />
        ))}
      </div>
    </Section>
  );
}

function SchemaCard({ file, what, schema }: { file: string; what: string; schema: z.ZodType }) {
  const rows = useMemo(
    () =>
      schemaRows(
        z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>,
      ),
    [schema],
  );
  return (
    <Collapsible title={<span className="font-mono">{file}</span>} subtitle={what}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={`${i}-${r.name}`}>
                <td className="py-1 pr-3 font-mono whitespace-nowrap text-fg">
                  <span style={{ paddingLeft: r.depth * 16 }}>
                    {r.name}
                    {r.required ? null : <span className="text-fg-4">?</span>}
                  </span>
                </td>
                <td className="py-1 pr-3 font-mono break-all text-fg-3">{r.type}</td>
                <td className="py-1 text-right font-mono break-all text-fg-4">
                  {r.def !== null
                    ? `= ${r.def.length > 60 ? `${r.def.slice(0, 60)}…` : r.def}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}

function ImageMeta() {
  const list = useGalleryImages({});
  const images = list.data?.pages[0]?.items.slice(0, 80) ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const id = picked ?? images[0]?.id ?? null;
  const meta = useDevImage(id);
  const m = meta.data;
  return (
    <Section
      id="image"
      title="Image metadata"
      text="What a file in the gallery carries, as written: each metadata entry in full (JSON pretty-printed), the Civitai sidecar when it has one, and what the gallery index made of it."
    >
      <Panel className="flex flex-col gap-2 p-4">
        <span className="label-caps">What Blombo's images carry</span>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-sm">
          {CHUNKS.map(([key, text]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-fg">{key}</dt>
              <dd className="text-fg-3">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-fg-3">
          Models are saved by file name only (in the graph's loaders and the values); no hashes or
          Civitai ids yet.
        </p>
      </Panel>
      {images.length ? (
        <>
          <Select
            label="Image"
            value={id === null ? null : String(id)}
            onChange={(v) => setPicked(Number(v))}
            options={images.map((i) => ({ value: String(i.id), label: i.path }))}
            className="max-w-[560px]"
          />
          {meta.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : meta.error ? (
            <p className="text-sm text-danger">{meta.error.message}</p>
          ) : m ? (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs break-all text-fg-3">
                {m.file} · {m.format}
              </p>
              {m.chunks.length ? (
                m.chunks.map((c) => <ChunkCard key={c.key} chunk={c} />)
              ) : (
                <p className="text-sm text-fg-3">This file has no metadata entries.</p>
              )}
              {m.sidecar ? (
                <JsonCard
                  title=".civitai.json"
                  subtitle="The sidecar beside it"
                  value={m.sidecar}
                />
              ) : null}
              <JsonCard
                title="index: summary"
                subtitle="What the gallery shows"
                value={m.index.summary}
              />
              <JsonCard
                title="index: settings"
                subtitle="Use these settings"
                value={m.index.settings}
              />
            </div>
          ) : null}
        </>
      ) : list.isLoading ? (
        <Skeleton className="h-10 w-80" />
      ) : (
        <EmptyState
          icon="gallery"
          title="No images in the gallery yet"
          text="Generate or add one to see what it carries."
        />
      )}
    </Section>
  );
}

function ChunkCard({ chunk: c }: { chunk: DevChunk }) {
  const text = c.json !== null ? JSON.stringify(c.json, null, 2) : c.text;
  return (
    <Collapsible
      title={<span className="font-mono">{c.key}</span>}
      subtitle={`${c.length.toLocaleString()} characters${c.json !== null ? " · JSON" : ""}`}
      defaultOpen={c.key === "blombo"}
    >
      <Code text={text} />
    </Collapsible>
  );
}

function JsonCard({ title, subtitle, value }: { title: string; subtitle: string; value: unknown }) {
  return (
    <Collapsible title={<span className="font-mono">{title}</span>} subtitle={subtitle}>
      <Code text={JSON.stringify(value, null, 2)} />
    </Collapsible>
  );
}

function Code({ text, label }: { text: string; label?: string }) {
  return (
    <div className="relative">
      <CopyButton
        text={text}
        label={`Copy ${label ?? "text"}`}
        className="absolute top-1.5 right-1.5"
      />
      <pre className="max-h-96 overflow-auto rounded-md border border-line bg-sunken p-2.5 pr-10 font-mono text-2xs leading-relaxed whitespace-pre-wrap break-all text-fg-2">
        {text}
      </pre>
    </div>
  );
}
