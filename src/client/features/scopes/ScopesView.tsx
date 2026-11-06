/**
 * Scopes (avatar menu → Scopes, ADR-0019): turn scope pictures on or off (off by default), and
 * make, edit and delete the profile's scopes. A scope is a name, an optional group (scopes in
 * one group replace each other when picked) and the prompt tags Auto picks it by. Pictures are
 * set per model in the model info dialog; deleting a scope moves its pictures to the trash.
 */
import { Icon } from "@client/icons/Icon";
import { useDeleteScope, usePatchScopes, useSaveScope, useScopes } from "@client/lib/queries";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Skeleton,
  Switch,
  TextField,
  toast,
} from "@client/ui";
import type { ScopeDef } from "@shared/scopes";
import { useMemo, useState } from "react";
import { ScopeBar } from "./ScopeBar";

export function ScopesView() {
  const scopes = useScopes();
  const patch = usePatchScopes();
  const [editing, setEditing] = useState<ScopeDef | "new" | null>(null);
  const [deleting, setDeleting] = useState<ScopeDef | null>(null);
  const file = scopes.data;
  const groups = useMemo(() => {
    const out = new Map<string, ScopeDef[]>();
    for (const s of file?.scopes ?? []) out.set(s.group, [...(out.get(s.group) ?? []), s]);
    return [...out].sort(([a], [b]) => (a ? (b ? a.localeCompare(b) : 1) : -1));
  }, [file]);

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-8 pt-8 pb-16 max-lg:px-3 max-lg:pt-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Scopes</h1>
          <p className="text-sm text-balance text-fg-3">
            Give a model more than one picture: one for each scope, or for a combination of them (a
            LoRA in a skirt, in thighhighs, and in both).
          </p>
        </div>

        {scopes.isLoading || !file ? (
          scopes.error ? (
            <EmptyState
              icon="errors"
              tone="warning"
              title="Couldn't read the scopes"
              text={scopes.error.message}
              action={<Button onClick={() => void scopes.refetch()}>Try again</Button>}
            />
          ) : (
            <Skeleton className="h-28 w-full" />
          )
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-fg">Scope pictures</span>
                  <span className="text-sm text-fg-3">
                    {file.enabled
                      ? "On: the scope bar in Models and the model pickers picks which pictures cards show. A model with no picture for those scopes shows its global one."
                      : "Off: every card shows the model's global picture. Scope pictures already saved stay in the models folder."}
                  </span>
                </div>
                <Switch
                  label="Scope pictures"
                  checked={file.enabled}
                  onCheckedChange={(enabled) =>
                    patch.mutate({ enabled }, { onError: (e) => toast(e.message, "error") })
                  }
                />
              </div>
              {file.enabled ? (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <span className="label-caps">Cards show</span>
                  <ScopeBar />
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-sm font-semibold text-fg">Your scopes</h2>
                <Button size="sm" icon="plus" onClick={() => setEditing("new")}>
                  New scope
                </Button>
              </div>
              {file.scopes.length === 0 ? (
                <EmptyState
                  icon="scopes"
                  title="No scopes yet"
                  text="Make one for each look you want pictures of: Skirt, Thighhighs, Anime. Then set its pictures in a model's info (right-click a model → Model info…)."
                  action={
                    <Button icon="plus" onClick={() => setEditing("new")}>
                      New scope
                    </Button>
                  }
                />
              ) : (
                groups.map(([group, list]) => (
                  <div key={group || "-"} className="flex flex-col gap-1.5">
                    {group ? <span className="label-caps">{group}</span> : null}
                    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                      {list.map((s) => (
                        <ScopeRow
                          key={s.id}
                          scope={s}
                          onEdit={() => setEditing(s)}
                          onDelete={() => setDeleting(s)}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
              <p className="flex items-start gap-2 text-xs text-fg-3">
                <Icon name="info" size={14} className="mt-px shrink-0" />
                Pictures are set per model: right-click a model → Model info…, pick the scopes in
                Picture for, then Replace picture. They're saved next to the model, in its
                _data/thumbs folder.
              </p>
            </section>
          </>
        )}
      </div>
      {editing ? (
        <ScopeDialog
          key={editing === "new" ? "new" : editing.id}
          scope={editing === "new" ? null : editing}
          groups={groups.map(([g]) => g).filter(Boolean)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <DeleteDialog scope={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function ScopeRow({
  scope,
  onEdit,
  onDelete,
}: {
  scope: ScopeDef;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium text-fg">{scope.name}</span>
        {scope.tags.length ? (
          <span className="flex flex-wrap gap-1">
            {scope.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-fg-4">No prompt tags: Auto never picks it</span>
        )}
      </div>
      <div className="flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
        <IconButton icon="edit" label={`Edit ${scope.name}`} size="sm" onClick={onEdit} />
        <IconButton icon="trash" label={`Delete ${scope.name}`} size="sm" onClick={onDelete} />
      </div>
    </li>
  );
}

const splitTags = (text: string) => [
  ...new Set(
    text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];

function ScopeDialog({
  scope,
  groups,
  onClose,
}: {
  scope: ScopeDef | null;
  groups: string[];
  onClose: () => void;
}) {
  const save = useSaveScope();
  const [name, setName] = useState(scope?.name ?? "");
  const [group, setGroup] = useState(scope?.group ?? "");
  const [tags, setTags] = useState(scope?.tags.join(", ") ?? "");
  const submit = () =>
    save.mutate(
      {
        id: scope?.id ?? null,
        body: { name: name.trim(), group: group.trim(), tags: splitTags(tags) },
      },
      {
        onSuccess: (s) => {
          toast(scope ? `Saved ${s.name}` : `Made ${s.name}`, "success");
          onClose();
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={scope ? `Edit ${scope.name}` : "New scope"}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={save.isPending}
            onClick={submit}
          >
            {scope ? "Save" : "Make scope"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) submit();
        }}
      >
        <Field label="Name">
          {(id) => (
            <TextField
              id={id}
              autoFocus
              value={name}
              maxLength={60}
              placeholder="Skirt"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Group"
          hint="Optional. Scopes in one group replace each other when you pick one (Style: Anime, Photo)."
        >
          {(id) => (
            <>
              <TextField
                id={id}
                value={group}
                maxLength={40}
                placeholder="None"
                list="scope-groups"
                onChange={(e) => setGroup(e.target.value)}
              />
              <datalist id="scope-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field
          label="Prompt tags"
          hint="With Auto on, a Generate prompt with one of these picks this scope. Separate with commas."
        >
          {(id) => (
            <TextField
              id={id}
              value={tags}
              placeholder="skirt, miniskirt, pleated skirt"
              onChange={(e) => setTags(e.target.value)}
            />
          )}
        </Field>
        {/* Enter submits. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function DeleteDialog({ scope, onClose }: { scope: ScopeDef | null; onClose: () => void }) {
  const remove = useDeleteScope();
  return (
    <Dialog
      open={scope !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete "${scope?.name}"?`}
      description="Every picture made for it, alone or with other scopes, moves to the profile's trash. The global pictures stay."
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            icon="trash"
            loading={remove.isPending}
            onClick={() =>
              scope &&
              remove.mutate(scope.id, {
                onSuccess: ({ pictures }) => {
                  toast(
                    pictures
                      ? `Deleted ${scope.name}. ${pictures} picture${pictures === 1 ? "" : "s"} moved to the trash.`
                      : `Deleted ${scope.name}`,
                    "success",
                  );
                  onClose();
                },
                onError: (e) => toast(e.message, "error"),
              })
            }
          >
            Delete scope
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}
