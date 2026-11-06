/**
 * Settings → Interface: which header and Generate tabs show and in what order (drag the grip, or
 * Alt+↑/↓ on it), what Ctrl+1… and Alt+1… open, how header labels show, card sizes and where the
 * profile opens. Saved to this profile (`settings.ui`).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { DRAG_LIFT, moveItem, type Sortable, useSortableRow } from "@client/lib/sortable";
import { Field, Kbd, Segmented, Select, Slider, Switch } from "@client/ui";
import { MAIN_VIEWS, WORK_TABS } from "@shared/constants";
import {
  arrangeTabs,
  type HeaderLabels,
  type StartView,
  tabForNumber,
  UiSettings,
} from "@shared/settings";
import { comboParts, resolveShortcuts } from "@shared/shortcuts";
import { PageHeader, SettingsSection } from "./common";

const VIEW_INFO: Record<(typeof MAIN_VIEWS)[number], { label: string; icon: IconName }> = {
  generate: { label: "Generate", icon: "generate" },
  gallery: { label: "Gallery", icon: "gallery" },
  models: { label: "Models", icon: "models" },
  "file-info": { label: "File Info", icon: "file-info" },
};
const WORK_INFO: Record<(typeof WORK_TABS)[number], { label: string; icon: IconName }> = {
  generation: { label: "Generation", icon: "sliders" },
  checkpoints: { label: "Checkpoints", icon: "models" },
  loras: { label: "LoRAs", icon: "layers" },
  wildcards: { label: "Wildcards", icon: "wildcards" },
  other: { label: "Other", icon: "stack" },
};
const DEFAULTS = UiSettings.parse({});

export function InterfacePage() {
  const settings = useSettings().data;
  const ui = settings?.ui ?? DEFAULTS;
  const update = useUpdateSettings();
  const set = (patch: Partial<UiSettings>) => update.mutate({ ui: patch });
  const keys = resolveShortcuts(settings?.shortcuts.overrides ?? []);
  const keyOf = (action: string) => comboParts(keys.get(action) ?? "").join(" ");
  const header = arrangeTabs(MAIN_VIEWS, ui.headerOrder, ui.headerHidden);
  const work = arrangeTabs(WORK_TABS, ui.generateTabOrder, ui.generateTabHidden, ["generation"]);
  // Which key opens each tab now, so the lists show it.
  const numbered = <T extends string>(tabs: { order: T[]; shown: T[] }, prefix: string) => {
    const out = new Map<T, string>();
    for (let n = 1; n <= tabs.order.length; n++) {
      const tab = tabForNumber(tabs, n, ui.numberKeysSkipHidden);
      const combo = keyOf(`${prefix}.${n}`);
      if (tab && combo) out.set(tab, combo);
    }
    return out;
  };

  return (
    <>
      <PageHeader title="Interface" />
      <div className="flex flex-col gap-8">
        <SettingsSection title="Header tabs" icon="layout-rows">
          <Field
            label="Tabs"
            layout="left"
            hint="Drag to reorder, switch off the ones you don't use. Hidden views stay in the command palette (Ctrl+K)."
          >
            <TabList
              order={header.order}
              shown={header.shown}
              info={VIEW_INFO}
              keys={numbered(header, "tab")}
              onOrder={(headerOrder) => set({ headerOrder })}
              onShow={(tab, on) =>
                set({
                  headerHidden: on
                    ? ui.headerHidden.filter((t) => t !== tab)
                    : [...ui.headerHidden, tab],
                })
              }
              lastLabel="At least one tab stays in the header"
            />
          </Field>
          <Field
            label="Labels"
            layout="left"
            hint="Auto hides the names when the window is narrow and keeps the icons."
          >
            <Segmented<HeaderLabels>
              size="sm"
              className="w-fit justify-self-start"
              label="Header labels"
              value={ui.headerLabels}
              onChange={(headerLabels) => set({ headerLabels })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "always", label: "Always" },
                { value: "icons", label: "Icons only" },
              ]}
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="Generate tabs" icon="generate">
          <Field
            label="Tabs"
            layout="left"
            hint="The tabs under the prompts. Generation always shows; a hidden picker still opens when you click its tile in the models strip."
          >
            <TabList
              order={work.order}
              shown={work.shown}
              info={WORK_INFO}
              keys={numbered(work, "worktab")}
              keep={["generation"]}
              onOrder={(generateTabOrder) => set({ generateTabOrder })}
              onShow={(tab, on) =>
                set({
                  generateTabHidden: on
                    ? ui.generateTabHidden.filter((t) => t !== tab)
                    : [...ui.generateTabHidden, tab],
                })
              }
              lastLabel="Generation always shows"
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="Number keys" icon="keyboard">
          <Field
            label="Hidden tabs"
            layout="left"
            hint="On, Ctrl+1… and Alt+1… count only the tabs that show. Off, every tab keeps its place and a hidden tab's number does nothing. Change the keys in Settings → Shortcuts."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={ui.numberKeysSkipHidden}
                onCheckedChange={(numberKeysSkipHidden) => set({ numberKeysSkipHidden })}
                label="Skip hidden tabs"
              />
              Skip hidden tabs
            </label>
          </Field>
        </SettingsSection>

        <SettingsSection title="Cards" icon="layout-grid">
          <Field
            label="Model pickers"
            layout="left"
            hint="Cards in Generate's Checkpoints, LoRAs, Wildcards and Other tabs."
          >
            <CardScale value={ui.pickerCardScale} onChange={(v) => set({ pickerCardScale: v })} />
          </Field>
          <Field
            label="Models"
            layout="left"
            hint="Cards in Models → Local, Civitai and Wildcards."
          >
            <CardScale value={ui.modelsCardScale} onChange={(v) => set({ modelsCardScale: v })} />
          </Field>
        </SettingsSection>

        <SettingsSection title="Start" icon="home">
          <Field
            label="Open on"
            layout="left"
            hint="Where this profile opens. A link or a reload on another view stays there."
          >
            <Select<StartView>
              value={ui.startView}
              onChange={(startView) => set({ startView })}
              className="w-60"
              label="Open on"
              options={[
                { value: "last", label: "Where I left off" },
                ...MAIN_VIEWS.map((v) => ({ value: v, label: VIEW_INFO[v].label })),
              ]}
            />
          </Field>
        </SettingsSection>
      </div>
    </>
  );
}

function CardScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="w-72 max-lg:w-full">
      <Slider
        value={Math.round(value * 100)}
        onChange={(v) => onChange(v / 100)}
        min={60}
        max={160}
        step={10}
        unit="%"
        label="Card size"
      />
    </div>
  );
}

/** Tabs in order with a grip, their key and a switch. */
function TabList<T extends string>({
  order,
  shown,
  info,
  keys,
  keep = [],
  onOrder,
  onShow,
  lastLabel,
}: {
  order: T[];
  shown: T[];
  info: Record<T, { label: string; icon: IconName }>;
  keys: Map<T, string>;
  keep?: T[];
  onOrder: (order: T[]) => void;
  onShow: (tab: T, on: boolean) => void;
  /** Why the last tab that shows can't be switched off. */
  lastLabel: string;
}) {
  const sortable = useSortableRow(order.length, (from, to) => onOrder(moveItem(order, from, to)));
  return (
    <ol className="flex w-full max-w-md flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {order.map((tab, i) => {
        const on = shown.includes(tab);
        const locked = keep.includes(tab) || (on && shown.length === 1);
        return (
          <TabRow
            key={tab}
            sortable={sortable(i)}
            label={info[tab].label}
            icon={info[tab].icon}
            combo={keys.get(tab) ?? ""}
            on={on}
            locked={locked}
            lockedLabel={keep.includes(tab) ? "Always shows" : lastLabel}
            onShow={(next) => onShow(tab, next)}
          />
        );
      })}
    </ol>
  );
}

function TabRow({
  sortable,
  label,
  icon,
  combo,
  on,
  locked,
  lockedLabel,
  onShow,
}: {
  sortable: Sortable;
  label: string;
  icon: IconName;
  combo: string;
  on: boolean;
  locked: boolean;
  lockedLabel: string;
  onShow: (on: boolean) => void;
}) {
  return (
    <li
      ref={sortable.ref}
      className={cn(
        "relative flex h-11 items-center gap-2.5 bg-surface px-2 transition-[scale,box-shadow] duration-150 first:rounded-t-lg last:rounded-b-lg",
        sortable.dragging && cn(DRAG_LIFT, "rounded-lg"),
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${label} to reorder`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        {...sortable.handle}
        onKeyDown={sortable.onKeyDown}
        className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-xs text-fg-4 hover:text-fg-2 focus-ring active:cursor-grabbing"
      >
        <Icon name="grip" size={14} />
      </button>
      <Icon name={icon} size={15} className={on ? "text-fg-2" : "text-fg-4"} />
      <span className={cn("min-w-0 flex-1 truncate text-sm", on ? "text-fg" : "text-fg-3")}>
        {label}
      </span>
      {combo ? (
        <span className="flex gap-0.5" title={`Opens with ${combo}`}>
          {combo.split(" ").map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      ) : null}
      <span title={locked ? lockedLabel : undefined}>
        <Switch
          checked={on}
          disabled={locked}
          onCheckedChange={onShow}
          label={on ? `Hide ${label}` : `Show ${label}`}
        />
      </span>
    </li>
  );
}
