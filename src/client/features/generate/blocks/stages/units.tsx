/** Unit handling shared by ADetailer and ControlNet: tabs, the active unit, add and remove. */
import { IconButton, InlineInput, Switch, type UnitTab, UnitTabs } from "@client/ui";
import { newUnitId, type StageStatus } from "@shared/workflow/stages";
import { useState } from "react";

interface Unit {
  id: string;
  name: string;
  enabled: boolean;
}

export function useUnits<U extends Unit>(
  units: U[],
  onUnits: (units: U[]) => void,
  make: (id: string, name: string, from: U | undefined) => U,
) {
  const [activeId, setActive] = useState<string | null>(null);
  const active = units.find((u) => u.id === activeId) ?? units[0];
  return {
    active,
    setActive,
    update: (patch: Partial<U>) => {
      if (!active) return;
      onUnits(units.map((u) => (u.id === active.id ? { ...u, ...patch } : u)));
    },
    add: () => {
      const id = newUnitId(units.map((u) => u.id));
      const next = make(id, `Unit ${units.length + 1}`, active);
      onUnits([...units, next]);
      setActive(id);
    },
    remove: () => {
      if (!active || units.length <= 1) return;
      const rest = units.filter((u) => u.id !== active.id);
      onUnits(rest);
      setActive(rest[0]?.id ?? null);
    },
  };
}

export function UnitBar<U extends Unit>({
  units,
  active,
  onActive,
  onAdd,
  status,
  group,
}: {
  units: U[];
  active: U;
  onActive: (id: string) => void;
  onAdd: () => void;
  status: StageStatus | undefined;
  group: string;
}) {
  const tabs: UnitTab[] = units.map((u) => ({
    id: u.id,
    name: u.name,
    enabled: u.enabled,
    warning: Boolean(status?.problems.some((p) => p.unit === u.id)),
  }));
  return (
    <UnitTabs
      units={tabs}
      active={active.id}
      onActive={onActive}
      onAdd={onAdd}
      layoutGroup={group}
    />
  );
}

/** The active unit's name, on/off and remove. */
export function UnitHeader<U extends Unit>({
  unit,
  count,
  onChange,
  onRemove,
}: {
  unit: U;
  count: number;
  onChange: (patch: Partial<U>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        size="sm"
        checked={unit.enabled}
        onCheckedChange={(enabled) => onChange({ enabled } as Partial<U>)}
        label={`Run ${unit.name}`}
      />
      <InlineInput
        value={unit.name}
        mono={false}
        maxLength={32}
        // A unit always keeps a name: typing over it works, clearing it doesn't.
        onChange={(e) => e.target.value.trim() && onChange({ name: e.target.value } as Partial<U>)}
        aria-label="Unit name"
        className="flex-1"
      />
      <IconButton
        icon="trash"
        label="Remove this unit"
        size="sm"
        disabled={count <= 1}
        onClick={onRemove}
      />
    </div>
  );
}
