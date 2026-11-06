/**
 * The Design Lab's MaskPainter: paint, erase, undo, invert and clear on a drawn picture, and
 * "Save" shows the black-and-white PNG it gives (what Inpaint uploads). Kept out of
 * DesignLab.tsx, which is long already.
 */
import { Button, MaskPainter, type MaskPainterHandle } from "@client/ui";
import { useEffect, useRef, useState } from "react";

// Lab sample only (data, not UI color): a dusk scene with a moon to paint over.
const SAMPLE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640"><rect width="512" height="640" fill="#28324f"/><circle cx="330" cy="200" r="80" fill="#fde7a8"/><path d="M0 480 Q256 360 512 480 V640 H0Z" fill="#141a2c"/></svg>',
)}`;

export function MaskLab() {
  const painter = useRef<MaskPainterHandle>(null);
  const [painted, setPainted] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => () => (saved ? URL.revokeObjectURL(saved) : undefined), [saved]);
  const save = async () => {
    const blob = await painter.current?.toBlob();
    if (blob) setSaved(URL.createObjectURL(blob));
  };
  return (
    <div className="flex max-w-3xl gap-4 max-lg:flex-col">
      <MaskPainter
        ref={painter}
        src={SAMPLE}
        width={512}
        height={640}
        maxHeight="420px"
        onChange={setPainted}
        className="min-w-0 flex-1"
      />
      <div className="flex w-40 shrink-0 flex-col gap-2">
        <Button size="sm" icon="check" disabled={!painted} onClick={() => void save()}>
          Save
        </Button>
        <span className="text-xs text-fg-3">{painted ? "Painted" : "Nothing painted yet"}</span>
        {saved ? (
          <img src={saved} alt="The saved mask" className="w-full rounded-md border border-line" />
        ) : null}
      </div>
    </div>
  );
}
