/**
 * Settings → Notifications: OS notifications when a long run, a script or batch, or a download
 * finishes while Blombo is in the background (lib/notifications.ts decides, lib/platform.ts
 * shows them). Browsers ask for permission once; the button here asks from a click.
 */
import { Icon } from "@client/icons/Icon";
import {
  askNotifyPermission,
  type NotifyPermission,
  notify,
  notifyPermission,
} from "@client/lib/platform";
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Button, Field, Notice, Slider, Switch } from "@client/ui";
import type { NotificationSettings } from "@shared/settings";
import { useEffect, useState } from "react";
import { PageHeader } from "./common";

export function NotificationsPage() {
  const s = useSettings().data?.notifications;
  const update = useUpdateSettings();
  const [permission, setPermission] = useState<NotifyPermission>(() => notifyPermission());
  const [secs, setSecs] = useState<number | null>(null);
  const set = (patch: Partial<NotificationSettings>) => update.mutate({ notifications: patch });

  useEffect(() => {
    if (secs === null || secs === s?.minSeconds) return;
    const t = setTimeout(() => set({ minSeconds: secs }), 400);
    return () => clearTimeout(t);
  });

  const on = s?.enabled ?? true;
  return (
    <>
      <PageHeader
        title="Notifications"
        text="A note from Windows when something long finishes while Blombo is in the background. Saved to this profile."
      />
      <div className="flex flex-col gap-8">
        {permission === "denied" ? (
          <Notice tone="warning" title="Notifications are blocked for Blombo">
            Allow them in the browser's site settings (the icon left of the address), or in Windows
            Settings → System → Notifications.
          </Notice>
        ) : permission === "unsupported" ? (
          <Notice tone="warning" title="This window can't show notifications">
            Open Blombo in a current browser or the desktop window to get them.
          </Notice>
        ) : null}
        <Field
          label="Notify me"
          layout="left"
          hint="Only while Blombo is minimized, behind other windows or in another tab."
        >
          <Switch checked={on} onCheckedChange={(enabled) => set({ enabled })} label="Notify me" />
        </Field>
        <Field label="When" layout="left">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={s?.jobs ?? true}
                disabled={!on}
                onCheckedChange={(jobs) => set({ jobs })}
                label="A long run finishes or fails"
              />
              A long run finishes or fails
            </label>
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={s?.batches ?? true}
                disabled={!on}
                onCheckedChange={(batches) => set({ batches })}
                label="A script or batch finishes"
              />
              A script or batch finishes
            </label>
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={s?.downloads ?? true}
                disabled={!on}
                onCheckedChange={(downloads) => set({ downloads })}
                label="A download finishes or fails"
              />
              A download finishes or fails
            </label>
          </div>
        </Field>
        <Field
          label="A long run is"
          layout="left"
          hint="Runs shorter than this finish without a note."
        >
          <div className="w-72">
            <Slider
              value={secs ?? s?.minSeconds ?? 20}
              onChange={setSecs}
              min={0}
              max={300}
              step={5}
              unit="s"
              label="At least"
              disabled={!on || !(s?.jobs ?? true)}
            />
          </div>
        </Field>
        <Field label="Try it" layout="left" hint="Sends one now, even while Blombo is in front.">
          <div className="flex items-center gap-2">
            {permission === "default" ? (
              <Button icon="bell" onClick={async () => setPermission(await askNotifyPermission())}>
                Allow notifications
              </Button>
            ) : null}
            <Button
              variant="ghost"
              icon="bell"
              disabled={permission === "denied" || permission === "unsupported"}
              onClick={async () => {
                await notify(
                  "Blombo",
                  "Notifications work. You'll hear from us when things finish.",
                  true,
                );
                setPermission(notifyPermission());
              }}
            >
              Send a test
            </Button>
            {permission === "granted" ? (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <Icon name="check-circle" size={14} /> Allowed
              </span>
            ) : null}
          </div>
        </Field>
      </div>
    </>
  );
}
