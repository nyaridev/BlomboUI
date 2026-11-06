/**
 * Saved data (dev mode only; avatar menu → Saved data): what the open profile keeps, explained
 * for people. A few figures on top, then the profile folder sorted by what each file is for,
 * the database's tables grouped by purpose, the layout of each saved file, and what one gallery
 * image carries. Read from the running app (`/api/dev`), so it matches what's on disk; it never
 * changes anything.
 */
import { Icon } from "@client/icons/Icon";
import { useDevStorage } from "@client/lib/queries";
import { Badge, EmptyState, Skeleton } from "@client/ui";
import { FormatsSection } from "./FormatsSection";
import { ImageSection } from "./ImageSection";
import { FilesSection, Overview, TablesSection } from "./StorageSections";

const NAV: Array<[string, string]> = [
  ["files", "Files"],
  ["database", "Database"],
  ["formats", "Formats"],
  ["image", "Images"],
];

export function SavedData() {
  const storage = useDevStorage();
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-[6px]">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 px-8 py-2.5 max-lg:px-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon name="data" size={16} className="text-accent-ink" />
            Saved data
          </span>
          <Badge>Dev mode</Badge>
          <nav className="ml-auto flex flex-wrap gap-0.5 text-xs">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#saved-${id}`}
                className="rounded-sm px-2 py-1 text-fg-3 hover:bg-field hover:text-fg focus-ring"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1080px] flex-col gap-12 px-8 py-8 max-lg:gap-10 max-lg:px-4">
        <p className="max-w-[70ch] text-sm text-fg-2">
          Everything this profile keeps on disk, and what goes into the images it makes, so you can
          check it by eye. This page only reads; it never changes anything.
        </p>
        {storage.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : storage.error || !storage.data ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Couldn't read the profile"
            text={storage.error?.message}
          />
        ) : (
          <>
            <Overview storage={storage.data} />
            <FilesSection storage={storage.data} />
            <TablesSection storage={storage.data} />
          </>
        )}
        <FormatsSection />
        <ImageSection />
      </div>
    </div>
  );
}
