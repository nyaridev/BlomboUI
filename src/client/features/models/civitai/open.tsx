/**
 * Opening a Civitai model or search from anywhere. With a key Civitai accepted, models open in
 * Models → Civitai; without one (or one never checked) they open on the site: a new tab in the
 * browser, and in the desktop window a question first (your browser, or a window here).
 * `inApp` tells links which it'll be, so the ones that leave the app show the external-link icon.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { isDesktop, openWindow } from "@client/lib/platform";
import { useCivitaiAccount } from "@client/lib/queries";
import { Button, Dialog, toast } from "@client/ui";
import { civitaiInApp, civitaiPageUrl } from "@shared/civitai";
import { create } from "zustand";
import { useModelsNav } from "../nav";
import { useCivitai } from "./state";

const DEFAULT_SITE = "https://civitai.com";

/** The site page the desktop window asks about (CivitaiPagePrompt, mounted in Shell). */
const usePagePrompt = create<{ page: { url: string; name: string } | null }>(() => ({
  page: null,
}));

/** Open a page of the Civitai site: a new tab, or in the desktop window, ask where first. */
export function openCivitaiPage(url: string, name: string): void {
  if (isDesktop()) usePagePrompt.setState({ page: { url, name } });
  else window.open(url, "_blank", "noopener");
}

export interface CivitaiTarget {
  modelId: number;
  versionId?: number | null;
  name: string;
}

export function useCivitaiOpener() {
  const account = useCivitaiAccount().data;
  const go = useGoToView();
  const inApp = civitaiInApp(account);
  const site = account?.site ?? DEFAULT_SITE;
  const showTab = () => {
    useModelsNav.getState().setTab("civitai");
    go("models");
  };
  return {
    inApp,
    /** A model's page (on a version when given). */
    model: (m: CivitaiTarget) => {
      if (!inApp) return openCivitaiPage(civitaiPageUrl(site, m), m.name);
      useCivitai.getState().open(m.modelId, m.name, false, m.versionId ?? null);
      showTab();
    },
    /** Models found by a name (one only known by its file name). */
    search: (query: string) => {
      if (!inApp) return openCivitaiPage(civitaiPageUrl(site, { query }), `"${query}"`);
      const s = useCivitai.getState();
      s.setFilter({ query });
      s.showHome("browse");
      s.show(null);
      showTab();
    },
  };
}

/** The desktop window's question before a Civitai page leaves the app. */
export function CivitaiPagePrompt() {
  const page = usePagePrompt((s) => s.page);
  const inApp = civitaiInApp(useCivitaiAccount().data);
  const close = () => usePagePrompt.setState({ page: null });
  const host = page ? new URL(page.url).host : "";
  return (
    <Dialog
      open={page !== null}
      onOpenChange={(open) => !open && close()}
      title={`Open on ${host}?`}
      description={
        <>
          <span className="font-medium text-fg">{page?.name}</span> opens on the Civitai site.
          {inApp
            ? null
            : " With a Civitai API key (Settings → Civitai), models open in Models → Civitai instead."}
        </>
      }
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (page) void openWindow(page.url, page.name);
              close();
            }}
          >
            Open in a window here
          </Button>
          <Button
            variant="primary"
            icon="external"
            onClick={() => {
              if (page)
                void api.openCivitaiPage(page.url).catch((e: Error) => toast(e.message, "error"));
              close();
            }}
          >
            Open in your browser
          </Button>
        </>
      }
    >
      <p className="flex items-center gap-2 font-mono text-xs break-all text-fg-3">
        <Icon name="external" size={12} className="shrink-0" />
        {page?.url}
      </p>
    </Dialog>
  );
}
