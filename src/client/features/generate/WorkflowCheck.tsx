/**
 * The workflow check's notices on Generate (ADR-0018): custom nodes the workflow needs (Install
 * asks first, saying where each pack comes from, since custom nodes run code), classes nobody
 * lists (paste the repository), missing model files (Download when the Manager's catalog or the
 * workflow has the file, else Find in Manager or Search Civitai) and Rebuild, once ComfyUI knows
 * nodes the import had to leave out. The check refetches when ComfyUI, its nodes or the models
 * change (lib/live.ts).
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { qk, queryClient, useWorkflowHealth } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, Dialog, Notice, TextField, toast } from "@client/ui";
import { isFinished, kindFolder } from "@shared/downloads";
import type { HealthInstallBody, MissingModel, MissingPack } from "@shared/workflow/health";
import { NodePack } from "@shared/workflow/packs";
import { useState } from "react";
import { useCivitaiOpener } from "../models/civitai/open";
import { useModelsNav } from "../models/nav";
import { MANAGER_CATEGORY } from "./blocks/stages/common";
import { NodesNotice } from "./blocks/stages/NodesNotice";
import { useLayout, useValues } from "./state";
import { useBindings } from "./workflow";

type Confirm = { body: HealthInstallBody; packs: Omit<MissingPack, "source">[]; from: string[] };

const SOURCE: Record<MissingPack["source"], string> = {
  blombo: "A version Blombo has tested",
  workflow: "The repository the workflow names",
  manager: "From ComfyUI-Manager's list",
};

const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), "error");
const names = (list: string[]) =>
  list.length <= 3 ? list.join(", ") : `${list.slice(0, 3).join(", ")} and ${list.length - 3} more`;

/** The model picks on screen, as one string so the selector stays stable. */
function useModelPicks(): Record<string, unknown> {
  const bindings = useBindings();
  const picks = useValues((s) =>
    JSON.stringify(
      Object.fromEntries(
        bindings.filter((b) => b.type === "model").map((b) => [b.id, s.values[b.id] ?? null]),
      ),
    ),
  );
  return JSON.parse(picks) as Record<string, unknown>;
}

export function WorkflowCheckNotices({ workflowId }: { workflowId: string }) {
  const picks = useModelPicks();
  const health = useWorkflowHealth(workflowId, picks).data;
  const managed = useLive((s) => s.comfy?.mode === "managed");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  if (!health?.checked) return null;
  const { packs, unknownNodes, models, rebuild } = health;
  if (!packs.length && !unknownNodes.length && !models.length && !rebuild) return null;

  return (
    <div className="flex flex-col gap-2">
      {packs.length ? (
        <NodesNotice
          problem={{
            code: "missing_nodes",
            packs,
            message: `This workflow needs ${names(packs.map((p) => p.name))}. ${
              managed
                ? "Install adds them to this profile's ComfyUI and restarts it."
                : "Install them in your ComfyUI (ComfyUI-Manager → Custom Nodes Manager), restart it, then check again."
            }`,
          }}
          onInstall={() =>
            setConfirm({
              body: { packs: packs.map((p) => p.url) },
              packs,
              from: packs.map((p) =>
                p.source === "manager"
                  ? `${SOURCE.manager} · latest commit`
                  : p.ref
                    ? `${SOURCE[p.source]} · commit ${p.ref.slice(0, 7)}`
                    : `${SOURCE[p.source]} · latest commit`,
              ),
            })
          }
        />
      ) : null}
      {unknownNodes.length ? (
        <UnknownNodes
          classes={unknownNodes}
          managed={managed}
          onInstall={(url) =>
            setConfirm({
              body: { repo: { url, nodes: unknownNodes } },
              packs: [{ name: url.split("/").pop() ?? url, url, nodes: unknownNodes }],
              from: ["The repository you pasted · latest commit"],
            })
          }
        />
      ) : null}
      {models.length ? <MissingModels workflowId={workflowId} models={models} /> : null}
      {rebuild ? <Rebuild workflowId={workflowId} /> : null}
      <ConfirmInstall workflowId={workflowId} confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function ConfirmInstall({
  workflowId,
  confirm,
  onClose,
}: {
  workflowId: string;
  confirm: Confirm | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const install = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.healthInstall(workflowId, confirm.body);
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={confirm !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Install custom nodes?"
      description="Custom nodes are code that runs on your PC inside ComfyUI. Install only packs you trust. ComfyUI restarts after the install."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="download" loading={busy} onClick={() => void install()}>
            Install
          </Button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {confirm?.packs.map((p, i) => (
          <li key={p.url} className="flex flex-col gap-1 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
              <Button
                size="sm"
                variant="ghost"
                icon="github"
                onClick={() => window.open(p.url, "_blank", "noopener")}
              >
                Open
              </Button>
            </div>
            <span className="truncate font-mono text-2xs text-fg-2">{p.url}</span>
            <span className="text-xs text-fg-3">{confirm.from[i]}</span>
            <span className="text-xs text-fg-3">Provides {names(p.nodes)}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function UnknownNodes({
  classes,
  managed,
  onInstall,
}: {
  classes: string[];
  managed: boolean;
  onInstall: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const clean = url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const valid = NodePack.shape.url.safeParse(clean).success;
  const first = classes[0] ?? "";
  return (
    <Notice
      tone="warning"
      title={`Unknown custom node${classes.length === 1 ? "" : "s"}`}
      actions={
        <>
          {managed ? (
            <Button
              size="sm"
              variant="primary"
              icon="download"
              disabled={!valid}
              onClick={() => onInstall(clean)}
            >
              Install from GitHub
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            icon="search"
            onClick={() =>
              window.open(
                `https://github.com/search?q=${encodeURIComponent(`"${first}"`)}&type=code`,
                "_blank",
                "noopener",
              )
            }
          >
            Search GitHub
          </Button>
        </>
      }
    >
      <span className="block">
        Neither the workflow nor ComfyUI-Manager's list says where{" "}
        <span className="font-mono text-fg">{names(classes)}</span>{" "}
        {classes.length === 1 ? "comes" : "come"} from.{" "}
        {managed
          ? "If you know the GitHub repository, paste it to install it."
          : "Find the pack that has them and install it in your ComfyUI."}
      </span>
      {managed ? (
        <TextField
          size="sm"
          mono
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repository"
          aria-label="GitHub repository of the unknown custom nodes"
          invalid={url.trim() !== "" && !valid}
          className="mt-2"
        />
      ) : null}
    </Notice>
  );
}

function MissingModels({ workflowId, models }: { workflowId: string; models: MissingModel[] }) {
  return (
    <Notice
      tone="warning"
      title={`${models.length} model${models.length === 1 ? "" : "s"} missing`}
    >
      <ul className="flex flex-col gap-1.5">
        {models.map((m) => (
          <ModelRow key={m.file} workflowId={workflowId} model={m} />
        ))}
      </ul>
    </Notice>
  );
}

function ModelRow({ workflowId, model }: { workflowId: string; model: MissingModel }) {
  const go = useGoToView();
  const civitai = useCivitaiOpener();
  const file = model.file.replace(/\\/g, "/").split("/").pop() ?? model.file;
  const stem = file.replace(/\.[^.]+$/, "");
  const downloading = useLive((s) =>
    s.downloads.some(
      (d) => !isFinished(d.state) && (d.name === file || d.dest.endsWith(`/${file}`)),
    ),
  );
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await api.healthDownload(workflowId, model.file);
      toast(`Downloading ${file}`, "success");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Icon name="file" size={13} className="shrink-0 text-fg-3" />
      <span className="min-w-0 truncate font-mono text-xs text-fg">{model.file}</span>
      {model.kind ? (
        <span className="font-mono text-2xs text-fg-3">→ {kindFolder(model.kind)}/</span>
      ) : null}
      <span className="ml-auto flex gap-1">
        {model.download ? (
          <Button
            size="sm"
            icon="download"
            loading={busy}
            disabled={downloading}
            onClick={() => void download()}
          >
            {downloading ? "Downloading…" : `Download · ${model.download.host}`}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon="store"
          onClick={() => {
            useModelsNav
              .getState()
              .showManager(model.kind ? MANAGER_CATEGORY[model.kind] : "other", stem);
            go("models");
          }}
        >
          Find in Manager
        </Button>
        <Button size="sm" variant="ghost" icon="globe" onClick={() => civitai.search(stem)}>
          Search Civitai
        </Button>
      </span>
    </li>
  );
}

function Rebuild({ workflowId }: { workflowId: string }) {
  const [busy, setBusy] = useState(false);
  const rebuild = async () => {
    setBusy(true);
    try {
      await api.healthRebuild(workflowId);
      const profileId = useSession.getState().profileId;
      void queryClient.invalidateQueries({ queryKey: ["workflow-health"] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      if (profileId) {
        const detail = await queryClient.fetchQuery({
          queryKey: qk.workflow(profileId, workflowId),
          queryFn: () => api.workflow(workflowId),
          staleTime: 0,
        });
        useValues.getState().reload(detail);
        useLayout.getState().show(detail);
      }
      toast("Rebuilt from the canvas. The old version is in the profile's trash.", "success");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Notice
      tone="info"
      title="Nodes are back"
      actions={
        <Button
          size="sm"
          variant="primary"
          icon="refresh"
          loading={busy}
          onClick={() => void rebuild()}
        >
          Rebuild
        </Button>
      }
    >
      ComfyUI now has the nodes this workflow had to leave out when it was imported. Rebuild it from
      its canvas to put them back; your settings are kept.
    </Notice>
  );
}
