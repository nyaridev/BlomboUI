/**
 * Models → Manager: the ComfyUI model catalog as a store. Categories with counts, search, sort
 * (by category, most downloaded, name, size), installed state, and the entries in the layout on
 * trial (ManagerEntries.tsx). Download counts load separately: Hugging Face is asked once per
 * repo, so the list shows before they arrive.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { qk, useCatalog, useCatalogDownloads } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { useVariant } from "@client/lib/variants";
import {
  Button,
  EmptyState,
  IconButton,
  Select,
  Skeleton,
  Spinner,
  TextField,
  toast,
} from "@client/ui";
import {
  type CatalogEntry,
  STORE_CATEGORIES,
  STORE_CATEGORY_LABELS,
  STORE_SORT_LABELS,
  STORE_SORTS,
  type StoreCategory,
  type StoreSort,
} from "@shared/manager";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_ICON,
  CardsLayout,
  type EntryContext,
  ListLayout,
  MANAGER_LAYOUTS,
  type Row,
  TableLayout,
} from "./ManagerEntries";
import { useModelsNav } from "./nav";

type Filter = StoreCategory | "all" | "installed";

const SORT_OPTIONS = STORE_SORTS.map((s) => ({ value: s, label: STORE_SORT_LABELS[s] }));
const byName = (a: CatalogEntry, b: CatalogEntry) => a.name.localeCompare(b.name);
const NO_SIZE = Number.MAX_SAFE_INTEGER;

export function ManagerStore() {
  const catalog = useCatalog();
  const stats = useCatalogDownloads(Boolean(catalog.data));
  const layout = useVariant("manager.layout", "Manager layout", MANAGER_LAYOUTS);
  // A deep link ("Find in Manager" from a stage) picks the category and search once.
  const [link] = useState(() => useModelsNav.getState().takeManager());
  const [filter, setFilter] = useState<Filter>(link?.category ?? "all");
  const [query, setQuery] = useState(link?.query ?? "");
  const [sort, setSort] = useState<StoreSort>("category");
  const pending = useModelsNav((s) => s.manager);
  useEffect(() => {
    if (!pending) return;
    const next = useModelsNav.getState().takeManager();
    if (next) {
      setFilter(next.category);
      setQuery(next.query);
    }
  }, [pending]);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const entries = catalog.data?.entries ?? [];
  const downloads = stats.data?.downloads;

  const counts = useMemo(() => {
    const c = new Map<Filter, number>([
      ["all", entries.length],
      ["installed", entries.filter((e) => e.installed).length],
    ]);
    for (const e of entries) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    return c;
  }, [entries]);

  const { rows, shown } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = entries.filter(
      (e) =>
        (filter === "all" || (filter === "installed" ? e.installed : e.category === filter)) &&
        (!q ||
          `${e.name} ${e.filename} ${e.type} ${e.base ?? ""} ${e.repo ?? ""} ${e.description}`
            .toLowerCase()
            .includes(q)),
    );
    const out: Row[] = [];
    if (sort !== "category") {
      const dl = (e: CatalogEntry) => (e.repo ? downloads?.[e.repo] : undefined) ?? 0;
      const order = {
        downloads: (a: CatalogEntry, b: CatalogEntry) => dl(b) - dl(a) || byName(a, b),
        name: byName,
        largest: (a: CatalogEntry, b: CatalogEntry) =>
          (b.size ?? -1) - (a.size ?? -1) || byName(a, b),
        smallest: (a: CatalogEntry, b: CatalogEntry) =>
          (a.size ?? NO_SIZE) - (b.size ?? NO_SIZE) || byName(a, b),
      }[sort];
      for (const entry of [...shown].sort(order)) out.push({ type: "entry", entry });
      return { rows: out, shown: shown.length };
    }
    for (const category of STORE_CATEGORIES) {
      const group = shown.filter((e) => e.category === category);
      if (!group.length) continue;
      if (filter === "all" || filter === "installed")
        out.push({ type: "header", category, count: group.length });
      for (const entry of group) out.push({ type: "entry", entry });
    }
    return { rows: out, shown: shown.length };
  }, [entries, filter, query, sort, downloads]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(qk.catalog(profileId), await api.catalog(true));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  if (catalog.isLoading)
    return (
      <div className="flex flex-col gap-2 p-5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  if (catalog.error || !catalog.data)
    return (
      <EmptyState
        icon="store"
        tone="warning"
        title="Couldn't load the ComfyUI model catalog"
        text={catalog.error?.message ?? "Try again in a moment."}
        action={<Button onClick={() => void catalog.refetch()}>Try again</Button>}
      />
    );

  const filters = (["all", "installed", ...STORE_CATEGORIES] as Filter[]).filter(
    (c) => c === "all" || c === "installed" || counts.get(c),
  );
  const ctx: EntryContext = { noFolder: catalog.data.noModelsFolder, downloads };
  const Layout = { list: ListLayout, table: TableLayout, cards: CardsLayout }[layout];
  const search = (className: string) => (
    <TextField
      size="sm"
      icon="search"
      placeholder="Search the catalog"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onClear={() => setQuery("")}
      className={className}
      aria-label="Search the catalog"
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[232px] shrink-0 flex-col gap-0.5 border-r border-line p-3 max-lg:hidden">
        {search("mb-2")}
        {filters.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm focus-ring",
              filter === c ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60",
            )}
          >
            <Icon
              name={filterIcon(c)}
              size={14}
              className={filter === c ? "text-accent-ink" : "text-fg-3"}
            />
            <span className="truncate">{filterLabel(c)}</span>
            <span className="ml-auto font-mono text-2xs text-fg-3">{counts.get(c) ?? 0}</span>
          </button>
        ))}
        <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-2.5 text-2xs text-fg-3">
          <span className="flex-1">
            {catalog.data.stale ? (
              <span className="text-warning">Offline copy from </span>
            ) : (
              "Catalog from "
            )}
            {new Date(catalog.data.fetchedAt).toLocaleDateString()}
          </span>
          <IconButton
            icon="refresh"
            label="Get the newest catalog"
            size="xs"
            disabled={refreshing}
            onClick={() => void refresh()}
          />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 max-lg:border-b max-lg:border-line max-lg:px-3">
          {/* Narrow screens: search and category here instead of the sidebar. */}
          {search("min-w-0 basis-full lg:hidden")}
          <Select<Filter>
            size="sm"
            label="Category"
            value={filter}
            onChange={setFilter}
            options={filters.map((c) => ({
              value: c,
              label: filterLabel(c),
              icon: filterIcon(c),
              hint: String(counts.get(c) ?? 0),
            }))}
            className="min-w-0 flex-1 lg:hidden"
          />
          <span className="text-xs text-fg-3 tabular max-lg:hidden">
            {shown.toLocaleString()} {shown === 1 ? "file" : "files"}
          </span>
          {stats.isFetching && !downloads ? (
            <span className="flex items-center gap-1.5 text-2xs text-fg-3 max-lg:hidden">
              <Spinner size={11} /> Getting download counts from Hugging Face
            </span>
          ) : null}
          <Select<StoreSort>
            size="sm"
            label="Sort"
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            className="w-44 max-lg:min-w-0 max-lg:flex-1 lg:ml-auto"
          />
        </div>
        {catalog.data.noModelsFolder ? (
          <p className="flex items-center gap-2 border-b border-line bg-yellow/10 px-5 py-2 text-xs text-warning">
            <Icon name="info" size={13} />
            This profile has no models folder, so nothing can be installed. Choose one in Settings →
            Folders.
          </p>
        ) : null}
        {rows.length ? (
          <Layout rows={rows} ctx={ctx} />
        ) : (
          <EmptyState
            icon="search"
            title={
              filter === "installed"
                ? "Nothing from the catalog is installed yet"
                : "Nothing matches"
            }
            text={
              filter === "installed"
                ? "Install upscalers, detectors and more with one click from the other categories."
                : "Try another word or category."
            }
          />
        )}
      </div>
    </div>
  );
}

function filterLabel(c: Filter): string {
  return c === "all" ? "Everything" : c === "installed" ? "Installed" : STORE_CATEGORY_LABELS[c];
}

function filterIcon(c: Filter): IconName {
  return c === "all" ? "stack" : c === "installed" ? "check-circle" : CATEGORY_ICON[c];
}
