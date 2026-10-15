/** Customize mode chrome: the layout bar and the block Inspector. */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import {
  Badge,
  Button,
  Field,
  IconButton,
  Popover,
  Segmented,
  Select,
  Switch,
  TextField,
  toast,
} from "@client/ui";
import { CONTROL_STYLES } from "@shared/layout/schema";
import { resolveBind } from "@shared/workflow/manifest";
import { motion } from "motion/react";
import { useState } from "react";
import { bindingFamily, defaultStyle } from "./blocks/ParamControl";
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
  const builtins = useLayout((s) => s.builtins);
  const custom = useLayout((s) => s.custom);
  const load = useLayout((s) => s.load);
  return (
    <Select
      size="sm"
      value={doc.id}
      onChange={load}
      label="Layout"
      className="w-[170px]"
      options={[
        ...builtins.map((l) => ({
          value: l.id,
          label: l.name,
          icon: "customize" as const,
          group: "Built-in",
        })),
        ...custom.map((l) => ({
          value: l.id,
          label: l.name,
          icon: "customize" as const,
          group: "Yours",
        })),
        ...(builtins.some((l) => l.id === doc.id) || custom.some((l) => l.id === doc.id)
          ? []
          : [{ value: doc.id, label: `${doc.name} (edited)`, group: "Current" }]),
      ]}
    />
  );
}

export function CustomizeBar() {
  const undo = useLayout((s) => s.undo);
  const redo = useLayout((s) => s.redo);
  const canUndo = useLayout((s) => s.past.length > 0);
  const canRedo = useLayout((s) => s.future.length > 0);
  const load = useLayout((s) => s.load);
  const saveAs = useLayout((s) => s.saveAs);
  const setCustomizing = useLayout((s) => s.setCustomizing);
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
      <span className="text-xs text-fg-3 max-[1300px]:hidden">
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
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => load("default")}>
          Reset
        </Button>
        <Popover
          placement="bottom-end"
          className="w-72 p-3"
          trigger={
            <Button size="sm" icon="save">
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
                saveAs(name.trim());
                toast(`Layout "${name.trim()}" saved`, "success");
                setName("");
                close();
              }}
            >
              <Field label="Preset name">
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
                Presets are exported with workflows (.blombo), so you can share them.
              </p>
              <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>
                Save preset
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
  const block = findBlock(doc.regions.params, selectedId);
  const inCard = doc.regions.params.some(
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
