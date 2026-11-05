/**
 * The launch screen: pick a profile or create one. The cards are on trial: four styles in
 * `ProfileLayouts.tsx` (how many numbers a card shows), switched with the dev Layouts panel
 * (`useVariant`).
 */
import { preloadShell } from "@client/app/loadShell";
import { useTheme } from "@client/app/theme";
import { ApiError, api } from "@client/lib/api";
import { useDeleteProfile, useProfileStats, useProfiles, useSystem } from "@client/lib/queries";
import { leaveProfile, openProfileOnce } from "@client/lib/session";
import { useVariant } from "@client/lib/variants";
import { Button, Dialog, toast } from "@client/ui";
import type { Profile } from "@shared/profile";
import { DEFAULT_UI_FONT } from "@shared/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CardsLayout } from "./ProfileLayouts";
import { ProfileWizard } from "./ProfileWizard";

const CARD_STYLES = [
  { id: "plain", label: "Plain" },
  { id: "row", label: "Stat row" },
  { id: "strip", label: "Strip" },
  { id: "hover", label: "Hover" },
] as const;

export function ProfileScreen() {
  const { data, isLoading } = useProfiles();
  const system = useSystem();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setTheme = useTheme((s) => s.set);
  const [wizard, setWizard] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const remove = useDeleteProfile();
  const stats = useProfileStats().data;
  const profiles = data?.profiles ?? [];

  useEffect(() => preloadShell(), []);

  useEffect(() => {
    if (!wizard)
      setTheme({
        theme: "blombo",
        accent: "blue",
        font: DEFAULT_UI_FONT,
        customFont: "",
        contrast: false,
      });
  }, [wizard, setTheme]);

  const open = async (p: Profile) => {
    if (opening) return;
    setOpening(p.id);
    try {
      leaveProfile();
      await openProfileOnce(p.id);
      setTheme({ theme: p.theme, accent: p.accent });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      navigate({ to: "/p/$profileId", params: { profileId: p.id } });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Couldn't open that profile.", "error");
      setOpening(null);
    }
  };

  const setLaunch = async (id: string | null) => {
    await api.setOpenOnLaunch(id);
    await qc.invalidateQueries({ queryKey: ["profiles"] });
  };

  const style = useVariant("profiles.cards", "Profile cards", CARD_STYLES);

  return (
    <div className="h-full">
      {/* The local list answers in milliseconds: placeholders would only flash. */}
      {isLoading ? null : (
        <CardsLayout
          style={style}
          profiles={profiles}
          stats={stats}
          launchId={data?.registry.openOnLaunch ?? null}
          opening={opening}
          version={system.data?.version ?? null}
          onOpen={(p) => void open(p)}
          onSetLaunch={(p, on) => void setLaunch(on ? p.id : null)}
          onDelete={setConfirmDelete}
          onNew={() => setWizard(true)}
        />
      )}

      <ProfileWizard
        open={wizard}
        onOpenChange={setWizard}
        onCreated={(p) => {
          setWizard(false);
          void open(p);
        }}
      />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="The profile folder moves to data/trash, so you can restore it by hand. Your models, outputs and wildcards are not touched."
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={remove.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                await remove.mutateAsync(confirmDelete.id);
                toast(`Moved "${confirmDelete.name}" to trash`, "success");
                setConfirmDelete(null);
              }}
            >
              Delete profile
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          Workflows, layouts and settings of this profile go with it.
        </p>
      </Dialog>
    </div>
  );
}
