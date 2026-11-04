/**
 * Sections mode for a YAML wildcard file (the old app's YAML dashboard): every key is a block
 * with its name in a field. A key holding a list is a wildcard, one field per line, dragged into
 * order by the grip; a key holding keys is a group, its keys indented under a line tinted by
 * depth. Every edit goes through yamlEdit.ts, so comments and the rest of the file are kept.
 *
 * shortcut: each edit re-parses and re-prints the whole file, fine for wildcard files up to a few
 * thousand lines; edit in place on the YAML document if huge files need it.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { DRAG_LIFT, type Sortable, useSortableRow } from "@client/lib/sortable";
import { Button, CopyButton, Dialog, IconButton, TextField } from "@client/ui";
import { createContext, type ReactNode, use, useEffect, useMemo, useRef, useState } from "react";
import {
  addItem,
  addSection,
  convertKey,
  liftKey,
  moveListItem,
  readSections,
  referenceOf,
  removeItem,
  removeKey,
  renameKey,
  setItem,
  type YamlSection,
} from "./yamlEdit";

/** The line under a group's keys, one tint per depth. */
const DEPTH_TINTS = [
  "border-blue/45",
  "border-purple/45",
  "border-green/45",
  "border-cyan/45",
  "border-yellow/45",
  "border-pink/45",
];

interface Ctx {
  text: string;
  sections: YamlSection[];
  onChange: (text: string) => void;
  /** The field to focus once it's rendered: `line:<path>:<index>` or `key:<path>`. */
  focus: string | null;
  setFocus: (id: string | null) => void;
}
const EditorCtx = createContext<Ctx | null>(null);
const useEditor = () => use(EditorCtx) as Ctx;

const pathId = (path: number[]) => path.join(".");

/** Focus (and select, for key names) the field whose id is pending. */
function useFocusWhen(id: string, select = false) {
  const { focus, setFocus } = useEditor();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus !== id || !ref.current) return;
    ref.current.focus();
    if (select) ref.current.select();
    setFocus(null);
  }, [focus, id, select, setFocus]);
  return ref;
}

export function YamlSections({
  text,
  onChange,
}: {
  text: string;
  onChange: (text: string) => void;
}) {
  const read = useMemo(() => readSections(text), [text]);
  const [focus, setFocus] = useState<string | null>(null);
  if (read.error !== null)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <p className="max-w-sm text-sm text-fg-3">
          <Icon name="errors" size={16} className="mb-2 inline text-warning" />
          <br />
          This YAML can't be shown as sections. Fix it in Raw mode first: {read.error}
        </p>
      </div>
    );
  const ctx: Ctx = { text, sections: read.sections, onChange, focus, setFocus };
  return (
    <EditorCtx value={ctx}>
      <div className="scroll-quiet h-full overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 max-lg:p-2">
          {read.sections.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-3">
              No keys yet. A wildcard is a key with a list of options, used as __key__; a group
              holds more keys, used as __group/key__.
            </p>
          ) : null}
          {read.sections.map((s) => (
            <div
              key={`${s.path[0]}:${s.key}`}
              className="rounded-lg border border-line bg-surface p-2.5 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
            >
              <Section section={s} depth={0} />
            </div>
          ))}
          <AddButtons parent={[]} />
        </div>
      </div>
    </EditorCtx>
  );
}

function Section({ section, depth }: { section: YamlSection; depth: number }) {
  const { text, sections, onChange } = useEditor();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(section.key);
  const [asking, setAsking] = useState(false);
  const nameRef = useFocusWhen(`key:${pathId(section.path)}`, true);
  const { value, path } = section;
  const reference = referenceOf(sections, path);
  const filled =
    value.kind === "group"
      ? value.children.length > 0
      : value.kind === "list"
        ? value.items.some((l) => l.trim())
        : value.kind === "other";
  const count =
    value.kind === "list"
      ? plural(value.items.filter((l) => l.trim() && !l.trim().startsWith("#")).length, "option")
      : value.kind === "group"
        ? plural(value.children.length, "key")
        : null;
  const commit = () => {
    if (name.trim() && name !== section.key) onChange(renameKey(text, path, name));
    else setName(section.key);
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          icon={open ? "chevron-down" : "chevron-right"}
          label={open ? `Fold ${section.key}` : `Unfold ${section.key}`}
          size="xs"
          tooltip={false}
          onClick={() => setOpen(!open)}
        />
        <TextField
          ref={nameRef}
          size="sm"
          mono
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(section.key);
          }}
          aria-label={`Name of ${section.key}`}
          className="w-56 min-w-0 font-medium max-lg:w-auto max-lg:flex-1"
        />
        <span className="font-mono text-sm text-fg-4" aria-hidden>
          :
        </span>
        {value.kind === "list" ? (
          <span className="flex min-w-0 items-center text-2xs text-fg-3 max-lg:hidden">
            <span className="truncate font-mono">__{reference}__</span>
            <CopyButton text={`__${reference}__`} label={`Copy __${reference}__`} />
          </span>
        ) : null}
        {count ? <span className="shrink-0 text-2xs text-fg-4 tabular">{count}</span> : null}
        <span className="ml-auto">
          <IconButton
            icon="x"
            label={`Remove ${section.key}`}
            size="xs"
            variant="danger"
            onClick={() => (filled ? setAsking(true) : onChange(removeKey(text, path)))}
          />
        </span>
      </div>
      {open ? (
        <div
          className={cn(
            "mt-2 ml-2.5 flex min-w-0 flex-col gap-2 border-l-2 pl-3 max-lg:pl-2",
            DEPTH_TINTS[depth % DEPTH_TINTS.length],
          )}
        >
          <Body section={section} depth={depth} />
        </div>
      ) : null}
      <RemoveDialog section={section} open={asking} onClose={() => setAsking(false)} />
    </div>
  );
}

function Body({ section, depth }: { section: YamlSection; depth: number }) {
  const { text, onChange, setFocus } = useEditor();
  const { value, path } = section;
  if (value.kind === "list") return <Lines path={path} items={value.items} />;
  if (value.kind === "group")
    return (
      <>
        {value.children.map((c) => (
          <Section key={`${c.path.at(-1)}:${c.key}`} section={c} depth={depth + 1} />
        ))}
        <AddButtons parent={path} />
      </>
    );
  if (value.kind === "empty")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          icon="plus"
          onClick={() => {
            onChange(convertKey(text, path, "list"));
            setFocus(`line:${pathId(path)}:0`);
          }}
        >
          Add line
        </Button>
        <AddButtons parent={path} inline />
      </div>
    );
  return (
    <div className="flex flex-col items-start gap-2">
      <pre className="max-h-32 w-full overflow-auto rounded-md border border-line bg-sunken p-2 font-mono text-2xs whitespace-pre-wrap text-fg-2">
        {value.preview}
      </pre>
      <p className="text-2xs text-fg-3">
        {value.scalar
          ? "A single value: each of its lines is one option."
          : "This list holds more than plain lines. Edit it in Raw mode."}
      </p>
      {value.scalar ? (
        <Button size="sm" icon="line-mode" onClick={() => onChange(convertKey(text, path, "list"))}>
          Make it a list
        </Button>
      ) : null}
    </div>
  );
}

function Lines({ path, items }: { path: number[]; items: string[] }) {
  const { text, onChange, setFocus } = useEditor();
  const sortable = useSortableRow(items.length, (from, to) =>
    onChange(moveListItem(text, path, from, to)),
  );
  const add = (at: number) => {
    onChange(addItem(text, path, at));
    setFocus(`line:${pathId(path)}:${at}`);
  };
  return (
    <div className="flex flex-col gap-1">
      {items.map((line, i) => (
        <Line
          key={i}
          path={path}
          index={i}
          line={line}
          sortable={sortable(i)}
          onAdd={() => add(i + 1)}
          onRemove={(focusPrevious) => {
            onChange(removeItem(text, path, i));
            if (focusPrevious && i > 0) setFocus(`line:${pathId(path)}:${i - 1}`);
          }}
        />
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon="plus"
        className="self-start"
        onClick={() => add(items.length)}
      >
        Add line
      </Button>
    </div>
  );
}

function Line({
  path,
  index,
  line,
  sortable,
  onAdd,
  onRemove,
}: {
  path: number[];
  index: number;
  line: string;
  sortable: Sortable;
  onAdd: () => void;
  onRemove: (focusPrevious: boolean) => void;
}) {
  const { text, onChange } = useEditor();
  const ref = useFocusWhen(`line:${pathId(path)}:${index}`);
  return (
    <div
      ref={sortable.ref}
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-md bg-surface transition-[scale,box-shadow] duration-150",
        sortable.dragging && DRAG_LIFT,
      )}
    >
      <button
        type="button"
        aria-label={`Drag line ${index + 1} to reorder`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        {...sortable.handle}
        onKeyDown={sortable.onKeyDown}
        className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-xs text-fg-4 hover:text-fg-2 focus-ring active:cursor-grabbing"
      >
        <Icon name="grip" size={13} />
      </button>
      <TextField
        ref={ref}
        size="sm"
        mono
        value={line}
        placeholder="An option"
        onChange={(e) => onChange(setItem(text, path, index, e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          } else if (e.key === "Backspace" && line === "") {
            e.preventDefault();
            onRemove(true);
          }
        }}
        aria-label={`Line ${index + 1}`}
        className={cn("min-w-0 flex-1", line.trim().startsWith("#") && "text-fg-4 italic")}
      />
      <span className="opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 group-focus-within:opacity-100">
        <IconButton
          icon="x"
          label={`Remove line ${index + 1}`}
          size="xs"
          variant="danger"
          tooltip={false}
          onClick={() => onRemove(false)}
        />
      </span>
    </div>
  );
}

/** Add a wildcard or a group at the top (`parent` []) or inside a key. */
function AddButtons({ parent, inline }: { parent: number[]; inline?: boolean }) {
  const { text, onChange, setFocus } = useEditor();
  const add = (kind: "list" | "group") => {
    const r = addSection(text, parent, kind);
    onChange(r.text);
    setFocus(`key:${pathId(r.path)}`);
  };
  const buttons: ReactNode = (
    <>
      <Button
        size="sm"
        variant={inline ? "secondary" : "ghost"}
        icon="plus"
        onClick={() => add("list")}
      >
        Add wildcard
      </Button>
      <Button
        size="sm"
        variant={inline ? "secondary" : "ghost"}
        icon="folder-plus"
        onClick={() => add("group")}
      >
        Add group
      </Button>
    </>
  );
  return inline ? buttons : <div className="flex flex-wrap gap-1.5">{buttons}</div>;
}

/** Removing a key that holds something asks first; a group can keep its keys one level up. */
function RemoveDialog({
  section,
  open,
  onClose,
}: {
  section: YamlSection;
  open: boolean;
  onClose: () => void;
}) {
  const { text, onChange } = useEditor();
  const group = section.value.kind === "group" && section.value.children.length > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Remove "${section.key}"?`}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {group ? (
            <Button
              onClick={() => {
                onChange(liftKey(text, section.path));
                onClose();
              }}
            >
              Keep its keys
            </Button>
          ) : null}
          <Button
            variant="danger"
            icon="trash"
            onClick={() => {
              onChange(removeKey(text, section.path));
              onClose();
            }}
          >
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-2">
        {group
          ? "Move the keys inside it up one level, or remove them too. Nothing is saved until you press Save."
          : "Its lines go with it. Nothing is saved until you press Save."}
      </p>
    </Dialog>
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
