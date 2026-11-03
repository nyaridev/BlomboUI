/**
 * Settings → ComfyUI: which ComfyUI this profile uses (a managed slot, your own ComfyUI folder
 * that Blombo starts, or the address of one you run), the
 * installed slots, and installing a slot with a progress view (the owner's choice over console
 * prompts). Progress comes from the server over the live bus, so it survives a page reload.
 * The bridge row says whether blombo-bridge (Edit in ComfyUI, ADR-0009) is loaded, and installs
 * it into a ComfyUI you run yourself.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { followTopic, useLive } from "@client/lib/live";
import { queryClient, useBridgeStatus, useComfySlots, useUpdateProfile } from "@client/lib/queries";
import {
  Badge,
  Button,
  Field,
  Panel,
  ProgressBar,
  Segmented,
  Select,
  Spinner,
  TextField,
  toast,
} from "@client/ui";
import type { BridgeStatus } from "@shared/bridge";
import {
  INSTALL_STEP_LABELS,
  type InstallState,
  releaseTag,
  slotForRelease,
  type TorchVariant,
} from "@shared/install";
import type { Profile } from "@shared/profile";
import { useEffect, useState } from "react";
import { FolderField } from "../profiles/FolderField";
import { OwnComfyNotice } from "../profiles/OwnComfyNotice";

type ComfyMode = Profile["comfy"]["mode"];

export function ComfyPage({ profile }: { profile: Profile | undefined }) {
  useEffect(() => followTopic("install"), []);
  const slots = useComfySlots();
  const live = useLive((s) => s.install);
  const install = live ?? slots.data?.install ?? null;
  const update = useUpdateProfile();
  const status = useLive((s) => s.comfy);

  const [mode, setMode] = useState<ComfyMode>(profile?.comfy.mode ?? "managed");
  const [slot, setSlot] = useState(
    profile?.comfy.mode === "managed" ? profile.comfy.slot : "latest",
  );
  const [dir, setDir] = useState(profile?.comfy.mode === "local" ? profile.comfy.dir : "");
  const [url, setUrl] = useState(
    profile?.comfy.mode === "external" ? profile.comfy.url : "http://127.0.0.1:8188",
  );
  useEffect(() => {
    if (!profile) return;
    const c = profile.comfy;
    setMode(c.mode);
    if (c.mode === "managed") setSlot(c.slot);
    else if (c.mode === "local") setDir(c.dir);
    else setUrl(c.url);
  }, [profile]);

  const installed = slots.data?.slots ?? [];
  const next: Profile["comfy"] =
    mode === "managed"
      ? { mode, slot }
      : mode === "local"
        ? { mode, dir: dir.trim() }
        : { mode, url: url.trim() };
  const dirty = profile && JSON.stringify(next) !== JSON.stringify(profile.comfy);
  const save = () => {
    if (!profile) return;
    update.mutate(
      { id: profile.id, body: { comfy: next } },
      {
        onSuccess: () => toast("ComfyUI choice saved", "success"),
        onError: (e) => toast(e.message, "error"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <Field label="This profile uses" layout="left">
        <div className="flex flex-col gap-3">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "managed", label: "Managed install", icon: "workflow" },
              { value: "local", label: "My own ComfyUI", icon: "folder" },
              { value: "external", label: "Address", icon: "link" },
            ]}
          />
          {mode === "managed" ? (
            <div className="flex items-center gap-2">
              <Select
                value={slot}
                onChange={setSlot}
                className="w-56"
                options={[...new Set([...installed, slot])].map((s) => ({
                  value: s,
                  label: s,
                  hint: installed.includes(s) ? "installed" : "not installed",
                }))}
              />
              <span className="text-xs text-fg-3">
                Slots live in runtime/comfyui/&lt;slot&gt;/.
              </span>
            </div>
          ) : mode === "local" ? (
            <div className="flex max-w-[560px] flex-col gap-3">
              <FolderField
                value={dir}
                onChange={setDir}
                pickTitle="Choose your ComfyUI folder"
                placeholder="C:\ComfyUI_windows_portable"
                checkComfy
              />
              <OwnComfyNotice />
            </div>
          ) : (
            <TextField
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              mono
              icon="globe"
              className="w-80"
            />
          )}
          {dirty ? (
            <div>
              <Button
                variant="primary"
                loading={update.isPending}
                disabled={mode === "local" && !dir.trim()}
                onClick={save}
              >
                Use this ComfyUI
              </Button>
            </div>
          ) : status ? (
            <span className="text-xs text-fg-3">
              Now:{" "}
              {status.state === "running"
                ? `running ${status.version ?? ""} at ${status.url}`
                : (status.message ?? status.state)}
            </span>
          ) : null}
        </div>
      </Field>

      <Field
        label="Blombo bridge"
        layout="left"
        hint="A small ComfyUI extension for Edit in ComfyUI: it opens a workflow there and adds Save to Blombo and Send to Blombo."
      >
        <BridgeRow profile={profile} />
      </Field>

      <Field
        label="Install ComfyUI"
        layout="left"
        hint="Downloads ComfyUI, a private Python and PyTorch into a new slot. Plan on about 6 GB of disk and a few minutes."
      >
        <Installer installed={installed} state={install} />
      </Field>
    </div>
  );
}

const BRIDGE_BADGE: Record<
  BridgeStatus["state"],
  { tone: "success" | "warning" | "neutral"; icon: IconName; label: string }
> = {
  loaded: { tone: "success", icon: "check-circle", label: "Loaded" },
  outdated: { tone: "warning", icon: "refresh", label: "Out of date" },
  missing: { tone: "warning", icon: "info", label: "Not loaded" },
  unknown: { tone: "neutral", icon: "info", label: "ComfyUI is off" },
};

/** Whether ComfyUI has the bridge, and how to get it there. */
function BridgeRow({ profile }: { profile: Profile | undefined }) {
  const status = useBridgeStatus();
  const comfy = useLive((s) => s.comfy);
  const [installing, setInstalling] = useState(false);
  const external = profile?.comfy.mode === "external";
  const s = status.data;
  const badge = s ? BRIDGE_BADGE[s.state] : null;

  const install = async () => {
    const picked = await api.pickFolder("Pick your ComfyUI folder (the one with main.py)");
    if (!picked.path) return;
    setInstalling(true);
    try {
      const res = await api.installBridge(picked.path);
      toast(
        res.result === "current"
          ? `The bridge in ${res.path} is already current. Restart ComfyUI if it isn't loaded.`
          : `Bridge ${res.result} in ${res.path}. Restart ComfyUI to load it.`,
        "success",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {badge ? (
          <Badge tone={badge.tone}>
            <Icon name={badge.icon} size={11} />
            {badge.label}
          </Badge>
        ) : (
          <Spinner size={14} />
        )}
        {s?.version ? <span className="font-mono text-2xs text-fg-3">v{s.version}</span> : null}
        <Button
          size="sm"
          variant="ghost"
          icon="refresh"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["bridge-status"] })}
        >
          Check again
        </Button>
      </div>
      <p className="max-w-[560px] text-xs text-fg-3">
        {s && s.state !== "loaded"
          ? s.message
          : external
            ? "Blombo doesn't change a ComfyUI it doesn't run, so install the bridge into yours once (and again after Blombo updates it)."
            : "Blombo adds the bridge to this ComfyUI and keeps it current every time it starts."}
      </p>
      {external ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button icon="download" loading={installing} onClick={() => void install()}>
            Install bridge…
          </Button>
          <span className="text-2xs text-fg-3">
            Copies a small folder into your ComfyUI's custom_nodes. Restart ComfyUI afterwards.
          </span>
        </div>
      ) : s && (s.state === "missing" || s.state === "outdated") && comfy?.state === "running" ? (
        <div>
          <Button icon="refresh" onClick={() => void api.comfyRestart().catch(() => undefined)}>
            Restart ComfyUI
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Installer({ installed, state }: { installed: string[]; state: InstallState | null }) {
  const [version, setVersion] = useState("latest");
  // Empty: the server names the slot after the release it installs ("latest" → "0.43.0").
  const [slot, setSlot] = useState("");
  const [torch, setTorch] = useState<TorchVariant>("cuda");
  const [starting, setStarting] = useState(false);
  const running = state?.state === "running";
  const tag = releaseTag(version);
  const named = slot.trim() || (tag === "latest" ? "" : slotForRelease(tag));
  const slotTaken = named !== "" && installed.includes(named);

  const start = async () => {
    setStarting(true);
    try {
      const s = await api.installComfy({
        slot: slot.trim(),
        torch,
        version: tag,
      });
      useLive.setState({ install: s });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!running ? (
        <Panel className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
            <Field label="ComfyUI version" hint="latest, or a release like 0.43.0">
              {(id) => (
                <TextField
                  id={id}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  mono
                  placeholder="latest"
                />
              )}
            </Field>
            <Field
              label="Slot name"
              hint={slot.trim() ? undefined : "Empty: named after the version"}
              error={slotTaken ? `"${named}" is already installed` : undefined}
            >
              {(id) => (
                <TextField
                  id={id}
                  value={slot}
                  onChange={(e) => setSlot(e.target.value)}
                  mono
                  placeholder={named || "0.43.0"}
                  invalid={slotTaken}
                />
              )}
            </Field>
            <Field label="PyTorch for">
              <Select<TorchVariant>
                value={torch}
                onChange={setTorch}
                options={[
                  { value: "cuda", label: "NVIDIA GPU", hint: "CUDA 12.8" },
                  { value: "cpu", label: "CPU only", hint: "slow" },
                ]}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              icon="download"
              loading={starting}
              disabled={slotTaken}
              onClick={() => void start()}
            >
              {state?.state === "error" || state?.state === "cancelled"
                ? "Install again"
                : "Install"}
            </Button>
            <span className="text-xs text-fg-3">
              Steps that already finished are skipped, so an interrupted install picks up where it
              stopped.
            </span>
          </div>
        </Panel>
      ) : null}
      {state && state.state !== "idle" ? <Progress state={state} /> : null}
    </div>
  );
}

const STEP_ICON: Record<string, IconName> = {
  done: "check-circle",
  skipped: "check",
  error: "x-circle",
  pending: "clock",
};

function Progress({ state }: { state: InstallState }) {
  const [showLog, setShowLog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const running = state.state === "running";
  const done = state.steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        {running ? (
          <Spinner size={18} className="text-accent-ink" />
        ) : (
          <Icon
            name={
              state.state === "done"
                ? "check-circle"
                : state.state === "error"
                  ? "x-circle"
                  : "info"
            }
            size={18}
            className={
              state.state === "done"
                ? "text-success"
                : state.state === "error"
                  ? "text-danger"
                  : "text-fg-3"
            }
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-fg">
            {running
              ? `Installing ComfyUI into "${state.slot}"`
              : state.state === "done"
                ? `ComfyUI ${state.version ?? ""} is installed in "${state.slot}"`
                : state.state === "error"
                  ? "The install stopped with a problem"
                  : "The install was stopped"}
          </span>
          <span className="text-xs text-fg-3">
            {done} of {state.steps.length} steps
            {state.torch ? ` · PyTorch for ${state.torch === "cuda" ? "NVIDIA GPUs" : "CPU"}` : ""}
          </span>
        </div>
        {running ? (
          <Button
            size="sm"
            variant="ghost"
            loading={cancelling}
            onClick={() => {
              setCancelling(true);
              void api.cancelInstall().finally(() => setCancelling(false));
            }}
          >
            Stop
          </Button>
        ) : null}
      </div>
      {state.error ? (
        <p className="flex items-start gap-2 rounded-md border border-red/30 bg-red/10 px-3 py-2 text-sm text-danger">
          <Icon name="errors" size={14} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      ) : null}
      <ol className="flex flex-col gap-2.5">
        {state.steps.map((s) => (
          <li key={s.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 text-sm">
              {s.state === "active" ? (
                <Spinner size={15} className="text-accent-ink" />
              ) : (
                <Icon
                  name={STEP_ICON[s.state] ?? "clock"}
                  size={15}
                  className={cn(
                    s.state === "done" && "text-success",
                    s.state === "skipped" && "text-fg-3",
                    s.state === "error" && "text-danger",
                    s.state === "pending" && "text-fg-4",
                  )}
                />
              )}
              <span className={cn(s.state === "pending" ? "text-fg-3" : "text-fg")}>
                {INSTALL_STEP_LABELS[s.id]}
              </span>
              {s.state === "skipped" ? <Badge>{s.detail ?? "Already done"}</Badge> : null}
              {s.state === "active" && s.progress !== null ? (
                <span className="ml-auto font-mono text-xs text-fg-3 tabular">
                  {Math.round(s.progress * 100)}%
                </span>
              ) : null}
            </div>
            {s.state === "active" ? (
              <div className="flex flex-col gap-1 pl-6">
                <ProgressBar value={s.progress} label={INSTALL_STEP_LABELS[s.id]} size="sm" />
                {s.detail ? (
                  <span className="truncate font-mono text-2xs text-fg-3">{s.detail}</span>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={showLog ? "chevron-up" : "terminal"}
          className="self-start"
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? "Hide details" : "Show details"}
        </Button>
        {showLog ? (
          <pre className="max-h-64 overflow-auto rounded-md border border-line bg-sunken p-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-fg-2">
            {state.log.length ? state.log.join("\n") : "Nothing printed yet."}
          </pre>
        ) : null}
      </div>
    </Panel>
  );
}
