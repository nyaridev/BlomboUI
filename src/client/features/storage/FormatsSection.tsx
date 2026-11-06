/**
 * The Saved data view's formats: the shape of each file the profile saves, grouped by area,
 * read from the schema the app checks it with, so it can't drift from the code. Fields are
 * listed in words (text, yes / no, list of …) with their defaults.
 */
import type { IconName } from "@client/icons/Icon";
import { Badge, Collapsible } from "@client/ui";
import { CivitaiSidecar } from "@shared/gallery";
import { SnippetsFile } from "@shared/history";
import { BlomboImageMeta, ImageSettings, ImageSummary } from "@shared/imageinfo";
import { LayoutDocument } from "@shared/layout/schema";
import { Profile, ProfileRegistry, ProfileSecrets } from "@shared/profile";
import { Settings } from "@shared/settings";
import { WorkflowManifest } from "@shared/workflow/manifest";
import { useMemo } from "react";
import { z } from "zod";
import { GroupHeading, Section, shortValue } from "./parts";
import { schemaRows } from "./schemaTree";

interface Format {
  title: string;
  file: string;
  text: string;
  schema: z.ZodType;
}

const GROUPS: Array<{ title: string; icon: IconName; text: string; formats: Format[] }> = [
  {
    title: "Profile files",
    icon: "user",
    text: "JSON files in the profile's folder (profiles.json sits one level up, for every profile).",
    formats: [
      {
        title: "Profile",
        file: "profile.json",
        text: "Name, theme, accent and folders",
        schema: Profile,
      },
      {
        title: "Settings",
        file: "settings.json",
        text: "Every setting, by page",
        schema: Settings,
      },
      {
        title: "Civitai key",
        file: "secrets.json",
        text: "Never sent to the page",
        schema: ProfileSecrets,
      },
      {
        title: "Snippets",
        file: "snippets.json",
        text: "Saved prompt snippets",
        schema: SnippetsFile,
      },
      {
        title: "Profile list",
        file: "data/profiles.json",
        text: "Their order and the one opened on launch",
        schema: ProfileRegistry,
      },
    ],
  },
  {
    title: "Workflows and layouts",
    icon: "workflow",
    text: "What makes a workflow and how the Generate screen shows it.",
    formats: [
      {
        title: "Workflow",
        file: "workflows/<id>/workflow.json",
        text: "Its parameters, values and stages",
        schema: WorkflowManifest,
      },
      {
        title: "Generate layout",
        file: "layouts/<id>.json",
        text: "Blocks and where they sit",
        schema: LayoutDocument,
      },
    ],
  },
  {
    title: "Images",
    icon: "image",
    text: "What travels inside an image or beside it, and what the gallery keeps about it.",
    formats: [
      {
        title: "Blombo's record in the image",
        file: 'the image\'s "blombo" entry',
        text: "Workflow, seed, values, prompts, models with hashes",
        schema: BlomboImageMeta,
      },
      {
        title: "Civitai details",
        file: "<image>.civitai.json",
        text: "Beside an image added from Civitai",
        schema: CivitaiSidecar,
      },
      {
        title: "Gallery summary",
        file: "database: images.summary",
        text: "What the lightbox shows",
        schema: ImageSummary,
      },
      {
        title: "Settings to reuse",
        file: "database: images.settings",
        text: "What Use these settings puts back",
        schema: ImageSettings,
      },
    ],
  },
];

export function FormatsSection() {
  return (
    <Section
      id="formats"
      title="How each file is laid out"
      text="The fields each saved file has, what they hold and what they start as. A value that's missing or broken on disk falls back to its default on its own; the rest of the file is kept."
    >
      <div className="flex flex-col gap-6">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-2.5">
            <GroupHeading icon={g.icon} title={g.title} text={g.text} />
            <div className="flex flex-col gap-1.5 pl-11 max-lg:pl-0">
              {g.formats.map((f) => (
                <FormatCard key={f.file} format={f} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FormatCard({ format: f }: { format: Format }) {
  const rows = useMemo(
    () =>
      schemaRows(
        z.toJSONSchema(f.schema, { io: "input", unrepresentable: "any" }) as Record<
          string,
          unknown
        >,
      ),
    [f.schema],
  );
  return (
    <Collapsible
      title={f.title}
      subtitle={f.text}
      actions={<span className="hidden font-mono text-2xs text-fg-4 lg:inline">{f.file}</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-fg-4">
              <th className="pb-1.5 font-normal">Field</th>
              <th className="pb-1.5 font-normal">Holds</th>
              <th className="pb-1.5 text-right font-normal">Starts as</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={`${i}-${r.name}`}>
                <td className="py-1.5 pr-3 align-top whitespace-nowrap">
                  <span className="flex items-center gap-1.5" style={{ paddingLeft: r.depth * 18 }}>
                    {r.depth ? <span className="text-fg-4">└</span> : null}
                    <span className="font-mono text-fg">{r.name}</span>
                    {/* A field with a default shows it on the right instead. */}
                    {!r.required && r.def === null ? <Badge>optional</Badge> : null}
                  </span>
                </td>
                <td className="py-1.5 pr-3 align-top break-words text-fg-2">{r.type}</td>
                <td className="py-1.5 text-right align-top font-mono break-all text-fg-3">
                  {r.def !== null ? shortValue(JSON.parse(r.def), 48) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}
