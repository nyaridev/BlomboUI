/** The warning next to "My own ComfyUI" (profile wizard and Settings → ComfyUI). */
import { Notice } from "@client/ui";

export function OwnComfyNotice() {
  return (
    <Notice tone="warning" title="A clean managed install is recommended">
      Blombo starts this ComfyUI with its own Python and adds the Blombo bridge to its custom_nodes.
      Other custom nodes and packages in it can clash with Blombo's stages.
    </Notice>
  );
}
