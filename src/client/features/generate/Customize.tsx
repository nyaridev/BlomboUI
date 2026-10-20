/** Customize mode chrome: the layout bar and the block Inspector. */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { queryClient, useLayouts, useUpdateSettings } from "@client/lib/queries";
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Menu,
  Popover,
  Segmented,
  Select,
  Switch,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import { CONTROL_STYLES } from "@shared/layout/schema";
import { resolveBind } from "@shared/workflow/manifest";
import { motion } from "motion/react";
import { useState } from "react";
import { bindingFamily, defaultStyle } from "./blocks/ParamControl";
import {
  chooseLayout,
  deleteLayout,
  discardLayoutEdits,
  renameLayout,
  resetLayout,
  saveLayout,
  saveLayoutAs,
} from "./layouts";
import { blockLabel } from "./ParamsColumn";
import { findBlock, useLayout } from "./state";
import { useBindings } from "./workflow";

const STYLE_LABELS: Record<string, string> = {
  slider: "Slider",
  scrub: "Scrub bar",
  number: "Number",
  chips: "Chips",
  select: "Dropdown",
  segmented: "Buttons",
  switch: "Switch",
  checkbox: "Checkbox",
  text: "Text",
  textarea: "Text box",
};

export function LayoutPicker() {
  const doc = useLayout((s) => s.doc);
  const dirty = useLayout((s) => s.doc !== s.saved);
  const source = useLayout((s) => s.source);
  const { data } = useLayouts();
  if (!doc) return null;
  const builtins = data?.builtins ?? [];
  const custom = data?.custom ?? [];
  const known = [...builtins, ...custom].some((l) => l.id === doc.id);
  const hint = (id: string) => (id === data?.defaultId ? "Default" : undefined);
  return (
    <span className="flex items-center gap-1.5">
      <Select
        size="sm"
        value={doc.id}
        onChange={(id) => void chooseLayout(id)}
        label="Layout"
        className="w-[170px]"
        options={[
          ...builtins.map((l) => ({
            value: l.id,
            label: l.name,
            icon: "customize" as const,
            group: "Built-in",
            hint: hint(l.id),
          })),
          ...custom.map((l) => ({
            value: l.id,
            label: l.name,
            icon: "customize" as const,
            group: "This profile",
            hint: hint(l.id),
          })),
          ...(known ? [] : [{ value: doc.id, label: doc.name, group: "Current" }]),
        ]}
      />
      {dirty ? (
        <Badge tone="warning">edited</Badge>
      ) : source === "linked" ? (
        <Tooltip content="This workflow uses this layout">
          <span className="grid h-5 w-5 place-items-center text-fg-3">
            <Icon name="link" size={13} />
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}

/** Make default, reset, rename, delete: the less common layout actions. */
function LayoutMenu() {
  const doc = useLayout((s) => s.saved);
  const source = useLayout((s) => s.source);
  const { data } = useLayouts();
  const updateSettings = useUpdateSettings();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  if (!doc) return null;
  const mine = Boolean(data?.custom.some((l) => l.id === doc.id));
  const isDefault = data?.defaultId === doc.id;
  return (
    <>
      <Menu
        trigger={<IconButton icon="more-horizontal" label="More layout actions" size="sm" />}
        width={280}
        items={[
          {
            id: "default",
            label: isDefault ? "Already the profile's default" : "Make it the profile's default",
            icon: "check",
            disabled: isDefault,
            onSelect: () =>
              updateSettings.mutate(
                { generate: { layout: doc.id } },
                {
                  onSuccess: () => {
                    void queryClient.invalidateQueries({ queryKey: ["layouts"] });
                    toast(`"${doc.name}" is now the default layout`, "success");
                  },
                },
              ),
          },
          {
            id: "reset",
            label: "Reset to default",
            icon: "refresh",
            disabled: source === "default",
            onSelect: () => void resetLayout(),
          },
          { type: "separator", id: "s1" },
          {
            id: "rename",
            label: "Rename…",
            icon: "edit",
            disabled: !mine,
            onSelect: () => {
              setName(doc.name);
              setRenaming(true);
            },
          },
          {
            id: "delete",
            label: "Delete layout",
            icon: "trash",
            tone: "danger",
            disabled: !mine,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <Dialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename layout"
        width={380}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                void renameLayout(doc.id, name.trim());
                setRenaming(false);
              }}
            >
              Rename
            </Button>
          </>
        }
      >
        <TextField
          autoFocus
          aria-label="Layout name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Dialog>
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${doc.name}"?`}
        description="It moves to the profile's trash. Workflows that use it show the default layout instead."
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                void deleteLayout(doc.id, doc.name);
                setConfirmDelete(false);
              }}
            >
              Delete layout
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </>
  );
}

export function CustomizeBar() {
  const undo = useLayout((s) => s.undo);
  const redo = useLayout((s) => s.redo);
  const canUndo = useLayout((s) => s.past.length > 0);
  const canRedo = useLayout((s) => s.future.length > 0);
  const dirty = useLayout((s) => s.doc !== s.saved);
  const savedId = useLayout((s) => s.saved?.id ?? null);
  const setCustomizing = useLayout((s) => s.setCustomizing);
  const { data } = useLayouts();
  const mine = Boolean(savedId && data?.custom.some((l) => l.id === savedId));
  const [name, setName] = useState("");
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={snappy}
      className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/8 px-2.5 py-1.5"
    >
      <Icon name="customize" size={16} className="text-accent-ink" />
      <span className="text-sm font-medium text-fg">Customizing layout</span>
      <span className="text-xs text-fg-3 max-[1450px]:hidden">
        Drag blocks by the grip. Click one to change how it looks.
      </span>
      <span className="ml-auto flex items-center gap-1">
        <IconButton
          icon="undo"
          label="Undo"
          shortcut="Ctrl Z"
          size="sm"
          disabled={!canUndo}
          onClick={undo}
        />
        <IconButton
          icon="redo"
          label="Redo"
          shortcut="Ctrl Y"
          size="sm"
          disabled={!canRedo}
          onClick={redo}
        />
        <LayoutPicker />
        <LayoutMenu />
        {dirty ? (
          <Button size="sm" variant="ghost" onClick={discardLayoutEdits}>
            Discard
          </Button>
        ) : null}
        {mine ? (
          <Button size="sm" icon="save" disabled={!dirty} onClick={() => void saveLayout()}>
            Save
          </Button>
        ) : null}
        <Popover
          placement="bottom-end"
          className="w-72 p-3"
          trigger={
            <Button
              size="sm"
              variant={mine ? "ghost" : "secondary"}
              icon={mine ? undefined : "save"}
            >
              Save as…
            </Button>
          }
        >
          {(close) => (
            <form
              className="flex flex-col gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                void saveLayoutAs(name.trim());
                setName("");
                close();
              }}
            >
              <Field label="Layout name">
                {(id) => (
                  <TextField
                    id={id}
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Portrait work"
                  />
                )}
              </Field>
              <p className="text-2xs text-fg-3">
                Saved in this profile, and this workflow uses it from now on.
              </p>
              <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>
                Save layout
              </Button>
            </form>
          )}
        </Popover>
        <Button size="sm" variant="primary" icon="check" onClick={() => setCustomizing(false)}>
          Done
        </Button>
      </span>
    </motion.div>
  );
}

export function Inspector() {
  const doc = useLayout((s) => s.doc);
  const selectedId = useLayout((s) => s.selected);
  const update = useLayout((s) => s.updateBlock);
  const select = useLayout((s) => s.select);
  const bindings = useBindings();
  const params = doc?.regions.params ?? [];
  const block = findBlock(params, selectedId);
  const inCard = params.some(
    (b) => b.type === "card" && b.children.some((c) => c.id === selectedId),
  );

  return (
    <motion.aside
      initial={{ opacity: 0, x: -12, width: 0 }}
      animate={{ opacity: 1, x: 0, width: 284 }}
      exit={{ opacity: 0, x: -12, width: 0 }}
      transition={snappy}
      className="shrink-0 overflow-hidden"
    >
      <div className="flex h-full w-[284px] flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
          <Icon name="sliders" size={15} className="text-accent-ink" />
          <span className="text-sm font-semibold text-fg">Inspector</span>
          {block ? (
            <IconButton
              icon="x"
              label="Deselect"
              size="xs"
              className="ml-auto"
              onClick={() => select(null)}
            />
          ) : null}
        </div>
        {!block ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-dashed border-line-strong text-fg-3">
              <Icon name="customize" size={22} />
            </span>
            <p className="text-sm text-fg-2">
              Select a block to change its control, size, width and label.
            </p>
            <p className="text-xs text-fg-3">
              Hidden blocks stay in the layout, dimmed, so you can bring them back.
            </p>
          </div>
        ) : (
          <div className="scroll-quiet flex flex-col gap-4 overflow-auto p-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-field text-fg-2">
                <Icon name={blockLabel(block, bindings).icon} size={16} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-fg">
                  {blockLabel(block, bindings).label}
                </span>
                <span className="text-2xs text-fg-3">
                  {block.type === "param"
                    ? "Parameter"
                    : block.type === "card"
                      ? "Group"
                      : "Feature block"}
                </span>
              </div>
            </div>

            {block.type === "param"
              ? (() => {
                  const binding = resolveBind(bindings, block.bind);
                  const family = binding ? bindingFamily(binding) : null;
                  const styles = family ? CONTROL_STYLES[family] : [];
                  const style = block.control ?? defaultStyle(family);
                  return (
                    <>
                      {binding ? (
                        <div className="flex flex-wrap gap-1">
                          {binding.role ? (
                            <Badge tone="accent">{binding.role}</Badge>
                          ) : (
                            <Badge>custom input</Badge>
                          )}
                          <Badge>
                            node {binding.node} · {binding.input}
                          </Badge>
                        </div>
                      ) : null}
                      <Field label="Control">
                        <div className="grid grid-cols-2 gap-1">
                          {styles.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => update(block.id, { control: s })}
                              className={cn(
                                "flex h-14 flex-col items-start justify-between rounded-md border p-2 text-left transition-colors focus-ring",
                                s === style
                                  ? "border-accent bg-accent/12"
                                  : "border-line bg-field hover:border-line-strong",
                              )}
                            >
                              <StyleGlyph style={s} active={s === style} />
                              <span className="text-xs font-medium text-fg">
                                {STYLE_LABELS[s] ?? s}
                              </span>
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Size">
                        <Segmented
                          full
                          size="sm"
                          value={block.size ?? "md"}
                          onChange={(size) => update(block.id, { size })}
                          options={[
                            { value: "sm", label: "Small" },
                            { value: "md", label: "Medium" },
                            { value: "lg", label: "Large" },
                          ]}
                        />
                      </Field>
                      {inCard ? (
                        <Field label="Width">
                          <Segmented
                            full
                            size="sm"
                            value={String(block.span ?? 12)}
                            onChange={(v) => update(block.id, { span: Number(v) })}
                            options={[
                              { value: "12", label: "Full" },
                              { value: "8", label: "⅔" },
                              { value: "6", label: "½" },
                              { value: "4", label: "⅓" },
                            ]}
                          />
                        </Field>
                      ) : null}
                      <Field label="Label">
                        <Segmented
                          full
                          size="sm"
                          value={block.label === "hidden" ? "hidden" : "top"}
                          onChange={(label) => update(block.id, { label })}
                          options={[
                            { value: "top", label: "Shown" },
                            { value: "hidden", label: "Hidden" },
                          ]}
                        />
                      </Field>
                      <Field label="Custom label">
                        {(id) => (
                          <TextField
                            id={id}
                            size="sm"
                            value={block.title ?? ""}
                            placeholder={binding?.label}
                            onChange={(e) =>
                              update(block.id, { title: e.target.value || undefined })
                            }
                          />
                        )}
                      </Field>
                    </>
                  );
                })()
              : null}

            {block.type === "card" ? (
              <Field label="Title">
                {(id) => (
                  <TextField
                    id={id}
                    size="sm"
                    value={block.title}
                    onChange={(e) => update(block.id, { title: e.target.value })}
                  />
                )}
              </Field>
            ) : null}

            <div className="flex items-center justify-between rounded-md border border-line bg-field px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-fg-2">
                <Icon name={block.hidden ? "eye-off" : "eye"} size={15} />
                Visible
              </span>
              <Switch
                checked={!block.hidden}
                onCheckedChange={(v) => update(block.id, { hidden: !v })}
                label="Visible"
                size="sm"
              />
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

/** Tiny pictogram of each control style for the Inspector buttons. */
function StyleGlyph({ style, active }: { style: string; active: boolean }) {
  const c = active ? "bg-accent-ink" : "bg-fg-3";
  const line = active ? "bg-accent/40" : "bg-line-strong";
  switch (style) {
    case "slider":
      return (
        <span className="relative mt-1 block h-1 w-16 rounded-full">
          <span className={cn("absolute inset-0 rounded-full", line)} />
          <span className={cn("absolute inset-y-0 left-0 w-9 rounded-full", c)} />
          <span className="absolute top-1/2 left-9 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </span>
      );
    case "scrub":
      return (
        <span
          className={cn(
            "relative block h-3.5 w-16 overflow-hidden rounded-xs border",
            active ? "border-accent-ink/60" : "border-line-strong",
          )}
        >
          <span className={cn("absolute inset-y-0 left-0 w-8 opacity-40", c)} />
        </span>
      );
    case "number":
      return (
        <span
          className={cn(
            "block h-3.5 w-12 rounded-xs border",
            active ? "border-accent-ink/60" : "border-line-strong",
          )}
        />
      );
    case "chips":
      return (
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("h-2.5 w-4 rounded-full", i === 1 ? c : line)} />
          ))}
        </span>
      );
    case "segmented":
      return (
        <span
          className={cn(
            "flex h-3.5 w-16 gap-0.5 rounded-xs border p-0.5",
            active ? "border-accent-ink/60" : "border-line-strong",
          )}
        >
          <span className={cn("flex-1 rounded-[2px]", c)} />
          <span className="flex-1" />
          <span className="flex-1" />
        </span>
      );
    case "select":
      return (
        <span
          className={cn(
            "flex h-3.5 w-14 items-center justify-end rounded-xs border pr-0.5",
            active ? "border-accent-ink/60" : "border-line-strong",
          )}
        >
          <Icon name="chevron-down" size={9} />
        </span>
      );
    case "switch":
      return (
        <span className={cn("flex h-3 w-6 items-center justify-end rounded-full p-0.5", c)}>
          <span className="h-2 w-2 rounded-full bg-white" />
        </span>
      );
    default:
      return <span className={cn("block h-2 w-10 rounded-full", line)} />;
  }
}
