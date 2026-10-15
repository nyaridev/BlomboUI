/**
 * The built-in Generate layout. Loaded models on top,
 * prompts with Generate / Interrupt / Cancel beside them, parameter cards next to the stage.
 * Blocks bind by role so this one layout works for every generate workflow.
 */
import type { LayoutDocument } from "@shared/layout/schema";

export const DEFAULT_LAYOUT: LayoutDocument = {
  format: "blombo.layout/1",
  id: "default",
  name: "Default",
  regions: {
    models: [{ type: "feature", feature: "loaded-models", id: "models" }],
    prompt: [{ type: "feature", feature: "prompts", id: "prompts" }],
    actions: [{ type: "feature", feature: "generate-actions", id: "actions" }],
    params: [
      {
        type: "card",
        id: "card-sampling",
        title: "Sampling",
        icon: "activity",
        children: [
          { type: "param", id: "p-sampler", bind: "role:sampler.name", control: "select", span: 7 },
          {
            type: "param",
            id: "p-scheduler",
            bind: "role:sampler.scheduler",
            control: "select",
            span: 5,
          },
          { type: "param", id: "p-steps", bind: "role:sampler.steps", control: "slider", span: 12 },
          { type: "param", id: "p-cfg", bind: "role:sampler.cfg", control: "slider", span: 12 },
          {
            type: "param",
            id: "p-clipskip",
            bind: "role:clip.skip",
            control: "segmented",
            span: 12,
            hidden: true,
          },
        ],
      },
      { type: "feature", feature: "resolution", id: "resolution" },
      { type: "feature", feature: "seed", id: "seed" },
      { type: "stage", stage: "hires", id: "stage-hires" },
      { type: "stage", stage: "adetailer", id: "stage-adetailer" },
      { type: "stage", stage: "controlnet", id: "stage-controlnet" },
      { type: "params-rest", id: "rest", title: "More from this workflow" },
    ],
    stage: [{ type: "feature", feature: "image-stage", id: "stage" }],
  },
  sizes: { params: 420 },
};

/** A second built-in preset to show switching: compact scrub fields, stages first. */
export const COMPACT_LAYOUT: LayoutDocument = {
  ...DEFAULT_LAYOUT,
  id: "compact",
  name: "Compact",
  regions: {
    ...DEFAULT_LAYOUT.regions,
    params: [
      {
        type: "card",
        id: "card-sampling",
        title: "Sampling",
        icon: "activity",
        children: [
          {
            type: "param",
            id: "p-sampler",
            bind: "role:sampler.name",
            control: "select",
            span: 12,
            size: "sm",
          },
          {
            type: "param",
            id: "p-scheduler",
            bind: "role:sampler.scheduler",
            control: "segmented",
            span: 12,
            size: "sm",
          },
          {
            type: "param",
            id: "p-steps",
            bind: "role:sampler.steps",
            control: "scrub",
            span: 6,
            size: "sm",
          },
          {
            type: "param",
            id: "p-cfg",
            bind: "role:sampler.cfg",
            control: "scrub",
            span: 6,
            size: "sm",
          },
          {
            type: "param",
            id: "p-clipskip",
            bind: "role:clip.skip",
            control: "chips",
            span: 12,
            size: "sm",
          },
        ],
      },
      { type: "feature", feature: "seed", id: "seed" },
      { type: "feature", feature: "resolution", id: "resolution" },
      { type: "stage", stage: "hires", id: "stage-hires" },
      { type: "stage", stage: "adetailer", id: "stage-adetailer" },
      { type: "stage", stage: "controlnet", id: "stage-controlnet" },
      { type: "params-rest", id: "rest", title: "More from this workflow" },
    ],
  },
  sizes: { params: 380 },
};
