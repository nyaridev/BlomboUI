/**
 * The Lab inside a profile (dev mode only): the Design Lab's components, or the Data page (what
 * the profile keeps on disk and what images carry). The pick lasts for the session.
 */
import { Segmented } from "@client/ui";
import { create } from "zustand";
import { DesignLab } from "./DesignLab";
import { SavedData } from "./SavedData";

type LabPage = "components" | "data";

const useLabPage = create<{ page: LabPage }>(() => ({ page: "components" }));

const PAGES = [
  { value: "components" as const, label: "Components" },
  { value: "data" as const, label: "Saved data" },
];

export function LabView() {
  const page = useLabPage((s) => s.page);
  const switcher = (
    <Segmented
      size="sm"
      value={page}
      onChange={(p) => useLabPage.setState({ page: p })}
      options={PAGES}
      label="Lab page"
    />
  );
  return page === "data" ? <SavedData switcher={switcher} /> : <DesignLab switcher={switcher} />;
}
