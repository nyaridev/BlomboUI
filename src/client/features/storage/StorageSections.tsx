/**
 * The Saved data view's first sections: the overview figures, the profile folder sorted into
 * groups that say what each file is for, and the database's tables grouped by purpose, each
 * with what it holds and, opened, its columns in words.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { formatBytes } from "@client/lib/number";
import { Badge, Collapsible, Panel } from "@client/ui";
import type { DevStorage, DevTable } from "@shared/dev";
import { useMemo } from "react";
import { columnType, sortFiles, sortTables, TABLES } from "./guide";
import { Code, GroupHeading, Section } from "./parts";

export function Overview({ storage: s }: { storage: DevStorage }) {
  const files = s.files.filter((f) => !f.dir);
  const total = s.files.reduce((n, f) => n + f.size, 0);
  const workflows = s.files.filter((f) => f.dir && /^workflows\/[^/]+$/.test(f.path)).length;
  const images = s.db.tables.find((t) => t.name === "images")?.rows ?? 0;
  const dbSize = files
    .filter((f) => /^blombo\.sqlite/.test(f.path))
    .reduce((n, f) => n + f.size, 0);
  const tiles: Array<{ icon: IconName; label: string; value: string; sub: string }> = [
    {
      icon: "folder",
      label: "Profile folder",
      value: formatBytes(total),
      sub: `${files.length.toLocaleString()} files`,
    },
    {
      icon: "workflow",
      label: "Workflows",
      value: workflows.toLocaleString(),
      sub: workflows === 1 ? "workflow saved" : "workflows saved",
    },
    {
      icon: "gallery",
      label: "Gallery",
      value: (images ?? 0).toLocaleString(),
      sub: "images indexed",
    },
    {
      icon: "data",
      label: "Database",
      value: formatBytes(dbSize),
      sub:
        s.db.version === s.db.latest
          ? "Up to date"
          : `Update ${s.db.version} of ${s.db.latest} (applies on open)`,
    },
  ];
  return (
    <Panel className="grid grid-cols-4 p-0 max-lg:grid-cols-2">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex min-w-0 flex-col gap-1.5 border-line px-4 py-3.5 not-first:border-l max-lg:border-l-0"
        >
          <span className="flex items-center gap-1.5 text-xs text-fg-3">
            <Icon name={t.icon} size={13} />
            {t.label}
          </span>
          <span className="truncate text-xl font-semibold tracking-tight text-fg tabular">
            {t.value}
          </span>
          <span className="truncate text-xs text-fg-3">{t.sub}</span>
        </div>
      ))}
    </Panel>
  );
}

export function FilesSection({ storage: s }: { storage: DevStorage }) {
  const groups = useMemo(() => sortFiles(s.files), [s.files]);
  return (
    <Section
      id="files"
      title="What's saved where"
      text={
        <>
          The profile's folder, sorted by what each file is for. Names and sizes only; nothing here
          is opened or changed. Folder:{" "}
          <span className="font-mono text-xs break-all text-fg-2">{s.dir}</span>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        {groups.map(({ group, entries, size }) => (
          <Panel key={group.id} className="flex flex-col gap-3 p-4">
            <GroupHeading
              icon={group.icon}
              title={group.title}
              text={group.text}
              aside={formatBytes(size)}
            />
            <ul className="flex flex-col divide-y divide-line">
              {entries.map((e) => (
                <li key={e.path} className="flex items-center gap-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 text-sm text-fg">
                      <span className="truncate">{e.label}</span>
                      {e.secret ? (
                        <Badge tone="warning">
                          <Icon name="lock" size={11} /> Never shown
                        </Badge>
                      ) : null}
                    </span>
                    <span className="truncate font-mono text-2xs text-fg-4">{e.path}</span>
                  </div>
                  <span className="shrink-0 text-xs text-fg-3 tabular">
                    {e.files !== null
                      ? `${e.files.toLocaleString()} ${e.files === 1 ? "file" : "files"} · ${formatBytes(e.size)}`
                      : formatBytes(e.size)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      {s.truncated ? (
        <p className="text-xs text-fg-3">There are more files than this page lists.</p>
      ) : null}
    </Section>
  );
}

export function TablesSection({ storage: s }: { storage: DevStorage }) {
  const groups = useMemo(() => sortTables(s.db.tables), [s.db.tables]);
  return (
    <Section
      id="database"
      title="Inside the database"
      text={
        <>
          <span className="font-mono text-xs text-fg-2">blombo.sqlite</span> keeps the gallery's
          index, your marks and the history. Open a table to see its columns.
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {groups.map(({ group, tables }) => (
          <div key={group.id} className="flex flex-col gap-2.5">
            <GroupHeading icon={group.icon} title={group.title} text={group.text} />
            <div className="flex flex-col gap-1.5 pl-11 max-lg:pl-0">
              {tables.map((t) => (
                <TableRow key={t.name} table={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TableRow({ table: t }: { table: DevTable }) {
  const about = TABLES[t.name];
  return (
    <Collapsible
      title={about?.label ?? t.name}
      subtitle={about?.text ?? "Not described yet."}
      actions={
        <Badge>
          <span className="tabular">
            {t.rows === null ? "?" : t.rows.toLocaleString()} {t.rows === 1 ? "row" : "rows"}
          </span>
        </Badge>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-fg-4">
                <th className="pb-1.5 font-normal">Column</th>
                <th className="pb-1.5 font-normal">Holds</th>
                <th className="pb-1.5 text-right font-normal">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.columns.map((c) => (
                <tr key={c.name}>
                  <td className="py-1.5 pr-3 font-mono text-fg">{c.name}</td>
                  <td className="py-1.5 pr-3 text-fg-2">{columnType(c.type)}</td>
                  <td className="py-1.5 text-right text-fg-3">
                    {[
                      c.pk ? "identifies the row" : null,
                      c.notNull && !c.pk ? "always set" : null,
                      c.default !== null ? `starts as ${c.default}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-3">
          Table <span className="font-mono text-fg-2">{t.name}</span>
          {t.kind === "virtual" ? " (search index)" : ""}
          {t.indexes.length
            ? ` · ${t.indexes.length} quick-lookup ${t.indexes.length === 1 ? "index" : "indexes"}`
            : ""}
        </p>
        <Collapsible title="How it's defined (SQL)" tone="inset">
          <Code text={t.sql} label="SQL" />
        </Collapsible>
      </div>
    </Collapsible>
  );
}
