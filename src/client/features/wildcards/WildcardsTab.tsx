/**
 * Models → Wildcards: the wildcards folders as book tabs over one panel, like Models → Local.
 * View shows every wildcard as a card (the pickers' grid, looking only: folders, search, sort,
 * a click opens its info with Open in the editor, right-click renames); Editor is the file
 * editor (tree, lines or YAML sections, raw text). Which page is open lives in models/nav.ts, so
 * "Open in the editor" lands there from anywhere.
 */
import { cn } from "@client/lib/cn";
import { useWildcards } from "@client/lib/queries";
import { Badge, Tabs } from "@client/ui";
import { ModelGrid } from "../generate/ModelGrid";
import { useModelsNav, type WildcardsPage } from "../models/nav";
import { WildcardsView } from "./WildcardsView";

export function WildcardsTab() {
  const page = useModelsNav((s) => s.wildcards);
  const count = useWildcards().data?.names.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 max-lg:p-2">
      <Tabs<WildcardsPage>
        variant="folder"
        value={page}
        onChange={(p) => useModelsNav.getState().setWildcardsPage(p)}
        label="Wildcards"
        items={[
          {
            value: "view",
            label: "View",
            icon: "layout-grid",
            badge: count ? <Badge>{count.toLocaleString()}</Badge> : undefined,
          },
          { value: "editor", label: "Editor", icon: "edit" },
        ]}
      />
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface",
          page === "view" ? "rounded-tl-none p-3" : null,
        )}
      >
        {page === "view" ? (
          <ModelGrid tab="wildcards" browse className="min-h-0 flex-1" />
        ) : (
          <WildcardsView />
        )}
      </div>
    </div>
  );
}
