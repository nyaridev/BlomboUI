import { xyCellCount } from '@/views/generate/panels/generation/sections/params/xyPlot.ts'
import { GenerateChrome } from '@/views/generate/panels/chrome/GenerateChrome.tsx'
import { GenerateActions } from '@/views/generate/panels/chrome/sections/actions/GenerateActions.tsx'
import { PromptStack } from '@/views/generate/panels/chrome/sections/prompt/PromptStack.tsx'
import { GenerateWorkspace } from '@/views/generate/panels/workspace/GenerateWorkspace.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import {
  createJob,
  getJob,
  getLatestJob,
  getWorkflows,
  interruptJob,
  postIssueLog,
  uploadJobImages,
  type Job,
  type ModelEntry,
  type ModelLists,
  type WorkflowInfo,
} from '@/lib/api.ts'
import { digitKey, overlayOpen } from '@/lib/hotkeys.ts'
import { autoLoraId, nextSeed, nextSeed32, usedSeed, usedSeed32, useGenerateStore, workflowHasPack } from '@/stores/generateStore.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { GENERATE_TABS, orderedGenerateTabs, type GenerateTab } from '@/views/generate/panels/workspace/tabs.ts'
import {
  etaSeconds,
  formatDuration,
  hiresProgressLabel,
  hiresDiffusion,
  idsFromJob,
  jobSeconds,
  packAdetailerJob,
  progressLabel,
  progressSegments,
  promptMatrixLines,
  xyPlotCellCount,
  tabForSwap,
} from '@/views/generate/panels/generation/generateHelpers.ts'

export function GenerateView() {
  const checkpoint = useGenerateStore((s) => s.checkpoint)
  const width = useGenerateStore((s) => s.width)
  const height = useGenerateStore((s) => s.height)
  const steps = useGenerateStore((s) => s.steps)
  const cfg = useGenerateStore((s) => s.cfg)
  const clipSkip = useGenerateStore((s) => s.clipSkip)
  const seed = useGenerateStore((s) => s.seed)
  const seedAfter = useGenerateStore((s) => s.seedAfter)
  const setSeed = useGenerateStore((s) => s.setSeed)
  const batchSize = useGenerateStore((s) => s.batchSize)
  const batchCount = useGenerateStore((s) => s.batchCount)
  const sampler = useGenerateStore((s) => s.sampler)
  const scheduler = useGenerateStore((s) => s.scheduler)
  const workflow = useGenerateStore((s) => s.workflow)
  const templateId = useGenerateStore((s) => s.templateId) || 'default'
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const outputGridPath = useGenerateStore((s) => s.outputGridPath)
  const outputImageName = useGenerateStore((s) => s.outputImageName)
  const outputGridName = useGenerateStore((s) => s.outputGridName)
  const outputHiresPath = useGenerateStore((s) => s.outputHiresPath)
  const outputHiresName = useGenerateStore((s) => s.outputHiresName)
  const outputPathEnabled = useGenerateStore((s) => s.outputPathEnabled)
  const hires = useGenerateStore((s) => s.hires)
  const setHires = useGenerateStore((s) => s.setHires)
  const adetailer = useGenerateStore((s) => s.adetailer)
  const setAdetailer = useGenerateStore((s) => s.setAdetailer)
  const rembg = useGenerateStore((s) => s.rembg)
  const rembgFiles = useGenerateStore((s) => s.rembgFiles)
  const imageUpscale = useGenerateStore((s) => s.imageUpscale)
  const imageUpscaleFiles = useGenerateStore((s) => s.imageUpscaleFiles)
  const caption = useGenerateStore((s) => s.caption)
  const captionFiles = useGenerateStore((s) => s.captionFiles)
  const setImageUpscale = useGenerateStore((s) => s.setImageUpscale)
  const script = useGenerateStore((s) => s.script)
  const promptMatrix = useGenerateStore((s) => s.promptMatrix)
  const xyPlot = useGenerateStore((s) => s.xyPlot)
  const modelTileStyle = useGenerateStore((s) => s.modelTileStyle)
  const activeLoraOrder = useGenerateStore((s) => s.activeLoraOrder)
  const activeLoraStrengths = useGenerateStore((s) => s.activeLoraStrengths)
  const toggleAutoLora = useGenerateStore((s) => s.toggleAutoLora)
  const setCheckpoint = useGenerateStore((s) => s.setCheckpoint)
  const vae = useGenerateStore((s) => s.vae)
  const textEncoder = useGenerateStore((s) => s.textEncoder)
  const setVae = useGenerateStore((s) => s.setVae)
  const setTextEncoder = useGenerateStore((s) => s.setTextEncoder)
  const swapTarget = useGenerateStore((s) => s.swapTarget)
  const setSwapTarget = useGenerateStore((s) => s.setSwapTarget)
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const gridFormat = useSettingsStore((s) => s.gridFormat)
  const batchGridRows = useSettingsStore((s) => s.batchGridRows)
  const batchGridFill = useSettingsStore((s) => s.batchGridFill)
  const batchGridOnCancel = useSettingsStore((s) => s.batchGridOnCancel)
  const saveInterrupted = useSettingsStore((s) => s.saveInterrupted)
  const interruptedInGrid = useSettingsStore((s) => s.interruptedInGrid)
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs)
  const generateTabOrder = useSettingsStore((s) => s.generateTabOrder)
  const generateTabKeysFollowLayout = useSettingsStore((s) => s.generateTabKeysFollowLayout)
  const loraAutoApplyDefault = useSettingsStore((s) => s.loraAutoApply)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const diffusionModels = useModelsStore((s) => s.diffusion_models)
  const loraItems = useModelsStore((s) => s.loras)
  const wildcardItems = useModelsStore((s) => s.wildcards)
  const vaeItems = useModelsStore((s) => s.vae)
  const textEncoders = useModelsStore((s) => s.text_encoders)
  const upscaleModels = useModelsStore((s) => s.upscale_models)
  const sams = useModelsStore((s) => s.sams)
  const ultralytics = useModelsStore((s) => s.ultralytics)

  const health = useHealthStore((s) => s.health)

  const [job, setJob] = useState<Job | null>(null)
  const [imageIds, setImageIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<GenerateTab>('Generation')
  const [starting, setStarting] = useState(false)
  const genRowRef = useRef<HTMLDivElement>(null)
  const runLock = useRef(false)
  const [paramsWidth, setParamsWidth] = useState<number | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([])
  const seenFail = useRef('')
  const location = useLocation()
  const navigate = useNavigate()
  const workflowParams = workflows.find((item) => item.id === workflow)?.params ?? []
  const rembgMode = workflowParams.includes('rembg')
  const upscaleMode = workflowParams.includes('upscale')
  const captionMode = workflowParams.includes('caption')
  const fileUtility = rembgMode || upscaleMode || captionMode

  useEffect(() => {
    void getWorkflows()
      .then((items) => {
        setWorkflows(items)
        const state = useGenerateStore.getState()
        const listed = items.some((item) => item.id === state.workflow)
        const id = listed ? state.workflow : items.some((item) => item.id === 'sd15') ? 'sd15' : items[0]?.id
        if (!id) {
          return
        }
        const item = items.find((row) => row.id === id)
        if (!item) {
          return
        }
        if (id !== state.workflow || !workflowHasPack(state.paramsByWorkflow, state.modelsByWorkflow, id)) {
          state.setWorkflow(id, item.defaults)
        }
      })
      .catch(() => setWorkflows([]))
  }, [])

  useEffect(() => {
    const incoming = location.state as { tab?: string } | null
    if (incoming?.tab) {
      const next = (incoming.tab === 'Lora' ? 'LoRa' : incoming.tab) as GenerateTab
      if (GENERATE_TABS.includes(next)) {
        setTab(next)
      }
    }
  }, [location.key])
  const busy = starting || job?.status === 'queued' || job?.status === 'running'
  const jobId = job?.id

  useEffect(() => {
    void getLatestJob()
      .then((latest) => {
        if (latest) {
          setJob(latest)
          setImageIds(idsFromJob(latest))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!jobId || starting) {
      return
    }
    let gone = false
    function apply(next: Job) {
      if (gone) {
        return
      }
      setJob(next)
      setImageIds(idsFromJob(next))
      if (next.status === 'failed') {
        const message = next.error || 'Generate failed'
        const key = `${next.id}:${message}`
        if (seenFail.current !== key) {
          seenFail.current = key
          setError(message)
          void useIssuesStore.getState().load()
        }
      }
    }
    if (!busy) {
      void getJob(jobId).then(apply).catch(() => {})
      return () => {
        gone = true
      }
    }
    const timer = window.setInterval(() => {
      void getJob(jobId).then(apply).catch(() => {})
    }, 500)
    return () => {
      gone = true
      window.clearInterval(timer)
    }
  }, [jobId, busy, starting])

  const toastedMissing = useRef('')
  useEffect(() => {
    if (!busy) {
      toastedMissing.current = ''
      return
    }
    const raw = job?.payload?.wildcard_missing
    const missing = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string' && Boolean(item))
      : []
    if (!missing.length) {
      return
    }
    const key = `${job?.id}:${missing.join(',')}`
    if (toastedMissing.current === key) {
      return
    }
    toastedMissing.current = key
    toast(`Missing wildcard: ${missing.join(', ')}`, 'error')
  }, [busy, job])

  async function generate() {
    const rembgMode = workflowParams.includes('rembg')
    const upscaleMode = workflowParams.includes('upscale')
    const captionMode = workflowParams.includes('caption')
    const fileUtility = rembgMode || upscaleMode || captionMode
    if (!fileUtility && !checkpoint.trim()) {
      return
    }
    if (fileUtility) {
      const input = rembgMode ? rembg : upscaleMode ? imageUpscale : caption
      const files = rembgMode ? rembgFiles : upscaleMode ? imageUpscaleFiles : captionFiles
      if (input.inputMode === 'files' && !files.length) {
        return
      }
      if (input.inputMode === 'directory' && !input.inputDir.trim()) {
        return
      }
    }
    if (upscaleMode && imageUpscale.engine === 'model' && !imageUpscale.upscaleModel.trim()) {
      return
    }
    if (!fileUtility && workflowParams.includes('textEncoder') && !textEncoder.trim()) {
      return
    }
    if (!fileUtility && workflowParams.includes('vae') && !vae.trim()) {
      return
    }
    if (!fileUtility && workflowParams.includes('hires') && hires.enabled && !hires.upscaleModel.trim()) {
      return
    }
    if (!fileUtility && adetailer.enabled && adetailer.units.some((unit) => unit.enabled !== false && !unit.detector.trim())) {
      return
    }
    if (
      !fileUtility &&
      adetailer.enabled &&
      adetailer.units.some(
        (unit) =>
          unit.enabled !== false &&
          unit.modelOverride &&
          (!unit.checkpoint.trim() ||
            (hiresDiffusion(unit.checkpoint, diffusionModels) && (!unit.vae.trim() || !unit.textEncoder.trim()))),
      )
    ) {
      return
    }
    if (!fileUtility && workflowParams.includes('hires') && hires.enabled && hires.modelOverride && !hires.checkpoint.trim()) {
      return
    }
    if (
      !fileUtility &&
      workflowParams.includes('hires') &&
      hires.enabled &&
      hires.modelOverride &&
      hiresDiffusion(hires.checkpoint, diffusionModels) &&
      (!hires.vae.trim() || !hires.textEncoder.trim())
    ) {
      return
    }
    setError(null)
    setStarting(true)
    setImageIds([])
    const activeLines = promptMatrixLines(promptMatrix.lines)
    const activePromptMatrix = script === 'prompt-matrix' && activeLines.length ? promptMatrix : null
    const xyCells = xyCellCount(xyPlot)
    const activeXyPlot = script === 'xy-plot' && xyCells ? xyPlot : null
    const keepMinusOne = Boolean(activeXyPlot?.keepMinusOne && seed < 0)
    const used = upscaleMode
      ? usedSeed32(imageUpscale.seed, imageUpscale.seedAfter)
      : keepMinusOne
        ? seed
        : usedSeed(seed, seedAfter)
    const previous = seed
    const previousUpscaleSeed = imageUpscale.seed
    const previousHiresSeed = hires.seed
    const hiresUsed = hires.seedOverride ? usedSeed(hires.seed, hires.seedAfter) : hires.seed
    const previousAdetailerSeeds = adetailer.units.map((unit) => unit.seed)
    const adetailerUsed = adetailer.units.map((unit) =>
      unit.seedOverride ? usedSeed(unit.seed, unit.seedAfter) : unit.seed,
    )
    const previousIds = job ? idsFromJob(job) : []
    const count = Math.max(1, Math.min(100, Math.round(Number(batchCount)) || 1))
    const seedSteps = activeXyPlot
      ? xyCells
      : activePromptMatrix
        ? activePromptMatrix.useBatch
          ? activeLines.length * count
          : activeLines.length
        : count
    if (upscaleMode) {
      setImageUpscale({ seed: nextSeed32(used, imageUpscale.seedAfter, seedSteps) })
    } else if (!(keepMinusOne && seed < 0)) {
      setSeed(nextSeed(used, seedAfter, seedSteps))
    }
    if (hires.enabled && hires.seedOverride) {
      setHires({ seed: nextSeed(hiresUsed, hires.seedAfter, seedSteps) })
    }
    if (adetailer.enabled) {
      setAdetailer({
        units: adetailer.units.map((unit, index) =>
          unit.seedOverride && unit.enabled !== false
            ? { ...unit, seed: nextSeed(adetailerUsed[index] ?? unit.seed, unit.seedAfter, seedSteps) }
            : unit,
        ),
      })
    }
    try {
      const gen = useGenerateStore.getState()
      const inputFiles = rembgMode ? rembgFiles : upscaleMode ? imageUpscaleFiles : captionFiles
      const inputMode = rembgMode ? rembg.inputMode : upscaleMode ? imageUpscale.inputMode : caption.inputMode
      const inputDir = rembgMode ? rembg.inputDir : upscaleMode ? imageUpscale.inputDir : caption.inputDir
      const inputPaths =
        fileUtility && inputMode === 'files' ? await uploadJobImages(inputFiles) : undefined
      const next = await createJob({
        prompt: gen.prompt,
        negative_prompt: gen.negativePrompt,
        checkpoint,
        vae: vae.trim() || undefined,
        text_encoder: textEncoder.trim() || undefined,
        width,
        height,
        steps,
        cfg: Math.max(1, cfg),
        clip_skip: Math.max(0, Math.min(10, Math.round(clipSkip))),
        clip_type: gen.clipType,
        clip_device: gen.clipDevice,
        seed: used,
        seed_after: upscaleMode ? imageUpscale.seedAfter : seedAfter,
        batch_size: Math.max(1, Math.min(8, Math.round(Number(batchSize)) || 1)),
        batch_count: Math.max(1, Math.min(100, Math.round(Number(batchCount)) || 1)),
        batch_grid: fileUtility ? false : activeXyPlot ? true : activePromptMatrix ? activePromptMatrix.saveGrid : batchGrid,
        batch_grid_max: batchGridMax,
        batch_grid_quality: batchGridQuality,
        batch_grid_format: gridFormat,
        batch_grid_rows: batchGridRows,
        batch_grid_fill: batchGridFill,
        batch_grid_on_cancel: batchGridOnCancel,
        save_interrupted: saveInterrupted,
        interrupted_in_grid: interruptedInGrid,
        sampler,
        scheduler,
        workflow,
        template: templateId,
        output_image_path:
          rembgMode || upscaleMode || captionMode || outputPathEnabled ? outputImagePath.trim() || undefined : undefined,
        output_grid_path: outputPathEnabled ? outputGridPath.trim() || undefined : undefined,
        output_image_name: captionMode
          ? outputImageName
          : outputPathEnabled
            ? outputImageName.trim() || undefined
            : undefined,
        output_grid_name: outputPathEnabled ? outputGridName.trim() || undefined : undefined,
        output_hires_path: outputPathEnabled ? outputHiresPath.trim() || undefined : undefined,
        output_hires_name: outputPathEnabled ? outputHiresName.trim() || undefined : undefined,
        hires: fileUtility
          ? undefined
          : {
          enabled: hires.enabled,
          scale: hires.scale,
          size_mode: hires.sizeMode,
          width: hires.width,
          height: hires.height,
          aspect: hires.aspect,
          megapixels: hires.megapixels,
          upscale_model: hires.upscaleModel,
          steps: hires.steps,
          cfg: hires.cfg,
          cfg_override: hires.cfgOverride,
          sampler: hires.sampler,
          sampler_override: hires.samplerOverride,
          scheduler: hires.scheduler,
          scheduler_override: hires.schedulerOverride,
          denoise: hires.denoise,
          seed: hires.seedOverride ? hiresUsed : hires.seed,
          seed_after: hires.seedAfter,
          seed_override: hires.seedOverride,
          upscale_method: hires.upscaleMethod,
          crop: hires.crop,
          prompt_override: hires.promptOverride,
          prompt: hires.prompt,
          negative_override: hires.negativeOverride,
          negative_prompt: hires.negativePrompt,
          model_override: hires.modelOverride,
          checkpoint: hires.checkpoint,
          vae: hires.vae,
          text_encoder: hires.textEncoder,
          kind: hiresDiffusion(hires.checkpoint, diffusionModels) ? 'diffusion_models' : 'checkpoints',
          lora_override: hires.loraOverride,
          loras: hires.loras,
          save_before: hires.saveBefore,
          clear_vram: hires.clearVram,
          attention_override: hires.attentionOverride,
          attention_engine: hires.attentionEngine,
          sage_attention: hires.sageAttention,
          allow_compile: hires.allowCompile,
        },
        adetailer: fileUtility ? undefined : packAdetailerJob(adetailer, adetailerUsed, diffusionModels),
        attention: fileUtility
          ? undefined
          : {
              enabled: gen.attention.enabled,
              engine: gen.attention.engine,
              sage_attention: gen.attention.sageAttention,
              allow_compile: gen.attention.allowCompile,
            },
        prompt_matrix:
          fileUtility || !activePromptMatrix
            ? undefined
            : {
              lines: activePromptMatrix.lines,
              save_grid: activePromptMatrix.saveGrid,
              use_batch: activePromptMatrix.useBatch,
              mode: activePromptMatrix.mode,
              target: activePromptMatrix.target,
              search: activePromptMatrix.search,
            },
        xy_plot:
          fileUtility || !activeXyPlot
            ? undefined
            : {
              x: activeXyPlot.x,
              y: activeXyPlot.y,
              draw_legend: activeXyPlot.drawLegend,
              draw_type: activeXyPlot.drawType,
              keep_minus_one: activeXyPlot.keepMinusOne,
              include_sub_images: activeXyPlot.includeSubImages,
              respect_instant_lora: Boolean(activeXyPlot.respectInstantLora),
              grid_margin: activeXyPlot.gridMargin,
            },
        auto_loras: fileUtility
          ? []
          : activeLoraOrder
          .filter((id) => id.startsWith(autoLoraId('')))
          .map((id) => id.slice(autoLoraId('').length))
          .filter((path) => {
            if (!path) {
              return false
            }
            const item = loraItems.find((row) => row.path === path)
            return !item || Boolean(item.auto_apply ?? loraAutoApplyDefault)
          })
          .map((path) => ({
            path,
            strength: activeLoraStrengths[path] ?? loraItems.find((row) => row.path === path)?.strength ?? 1,
          })),
        rembg: rembgMode
          ? {
              engine: rembg.engine,
              rmbg_model: rembg.rmbgModel,
              birefnet_model: rembg.birefnetModel,
              sensitivity: rembg.sensitivity,
              process_res: rembg.processRes,
              mask_blur: rembg.maskBlur,
              mask_offset: rembg.maskOffset,
              invert_output: rembg.invertOutput,
              refine_foreground: rembg.refineForeground,
              background: rembg.background,
              background_color: rembg.backgroundColor,
              input_mode: rembg.inputMode,
              input_dir: rembg.inputDir,
              preserve_metadata: rembg.preserveMetadata,
            }
          : undefined,
        upscale: upscaleMode
          ? {
              engine: imageUpscale.engine,
              input_mode: imageUpscale.inputMode,
              input_dir: imageUpscale.inputDir,
              upscale_model: imageUpscale.upscaleModel,
              scale: imageUpscale.scale,
              size_mode: imageUpscale.sizeMode,
              width: imageUpscale.width,
              height: imageUpscale.height,
              aspect: imageUpscale.aspect,
              megapixels: imageUpscale.megapixels,
              upscale_method: imageUpscale.upscaleMethod as 'nearest-exact' | 'bilinear' | 'area' | 'bicubic' | 'lanczos',
              crop: imageUpscale.crop as 'disabled' | 'center',
              seed: used,
              color_correction: imageUpscale.colorCorrection,
              resolution: imageUpscale.resolution,
              max_resolution: imageUpscale.maxResolution,
              max_resolution_override: imageUpscale.maxResolutionOverride,
              batch_size: 1,
              uniform_batch_size: false,
              temporal_overlap: imageUpscale.temporalOverlap,
              prepend_frames: imageUpscale.prependFrames,
              input_noise_scale: imageUpscale.inputNoiseScale,
              latent_noise_scale: imageUpscale.latentNoiseScale,
              offload_device: imageUpscale.offloadDevice,
              enable_debug: imageUpscale.enableDebug,
              dit_model: imageUpscale.ditModel,
              dit_device: imageUpscale.ditDevice,
              blocks_to_swap: imageUpscale.blocksToSwap,
              swap_io_components: imageUpscale.swapIoComponents,
              dit_offload_device: imageUpscale.ditOffloadDevice,
              dit_cache_model: imageUpscale.ditCacheModel,
              attention_mode: imageUpscale.attentionMode,
              vae_model: imageUpscale.vaeModel,
              vae_device: imageUpscale.vaeDevice,
              encode_tiled: imageUpscale.encodeTiled,
              encode_tile_size: imageUpscale.encodeTileSize,
              encode_tile_overlap: imageUpscale.encodeTileOverlap,
              decode_tiled: imageUpscale.decodeTiled,
              decode_tile_size: imageUpscale.decodeTileSize,
              decode_tile_overlap: imageUpscale.decodeTileOverlap,
              tile_debug: imageUpscale.tileDebug,
              vae_offload_device: imageUpscale.vaeOffloadDevice,
              vae_cache_model: imageUpscale.vaeCacheModel,
              allow_compile: imageUpscale.allowCompile,
              compile_backend: imageUpscale.compileBackend,
              compile_mode: imageUpscale.compileMode,
              compile_fullgraph: imageUpscale.compileFullgraph,
              compile_dynamic: imageUpscale.compileDynamic,
              dynamo_cache_size_limit: imageUpscale.dynamoCacheSizeLimit,
              dynamo_recompile_limit: imageUpscale.dynamoRecompileLimit,
            }
          : undefined,
        caption: captionMode
          ? {
              engine: caption.engine,
              wd14_model: caption.wd14Model,
              qwen_model: caption.qwenModel,
              quantization: caption.quantization,
              guidance: caption.guidance,
              prefix: caption.prefix,
              suffix: caption.suffix,
              megapixels: caption.megapixels,
              batch_count: caption.batchCount,
              save_image: caption.saveImage,
              threshold: caption.threshold,
              character_threshold: caption.characterThreshold,
              input_mode: caption.inputMode,
              input_dir: caption.inputDir,
            }
          : undefined,
        input_dir: fileUtility && inputMode === 'directory' ? inputDir.trim() : undefined,
        input_paths: inputPaths,
      })
      setJob(next)
      setImageIds([])
    } catch (err) {
      setSeed(previous)
      setImageUpscale({ seed: previousUpscaleSeed })
      setHires({ seed: previousHiresSeed })
      setAdetailer({
        units: adetailer.units.map((unit, index) => ({ ...unit, seed: previousAdetailerSeeds[index] ?? unit.seed })),
      })
      setImageIds(previousIds)
      setError(err instanceof Error ? err.message : 'Generate failed')
      void useIssuesStore.getState().load()
    } finally {
      setStarting(false)
    }
  }

  async function restart() {
    if (runLock.current) {
      return
    }
    runLock.current = true
    try {
      if (busy && jobId) {
        const stopped = await interrupt('cancel')
        if (!stopped) {
          return
        }
        for (let i = 0; i < 40; i++) {
          const next = await getJob(jobId)
          setJob(next)
          setImageIds(idsFromJob(next))
          if (next.status !== 'queued' && next.status !== 'running') {
            break
          }
          await new Promise((resolve) => window.setTimeout(resolve, 150))
        }
      }
      await generate()
    } finally {
      runLock.current = false
    }
  }

  async function interrupt(mode: 'skip' | 'cancel') {
    if (!busy || !jobId) {
      return false
    }
    try {
      const next = await interruptJob(jobId, mode)
      setJob(next)
      setImageIds(idsFromJob(next))
      toast(mode === 'cancel' ? 'Generation cancelled' : 'Generation interrupted', 'info')
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : mode === 'cancel' ? 'Cancel failed' : 'Interrupt failed'
      void postIssueLog({
        kind: 'generate',
        code: mode === 'cancel' ? 'cancel_failed' : 'interrupt_failed',
        name: jobId,
        message,
      })
        .catch(() => {})
        .finally(() => {
          void useIssuesStore.getState().load()
        })
      setError(message)
      return false
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) {
        return
      }
      const digit = digitKey(event)
      if (event.altKey && !event.ctrlKey && !event.metaKey && digit && digit <= GENERATE_TABS.length) {
        event.preventDefault()
        const tabs = fileUtility
          ? (['Generation'] as GenerateTab[])
          : generateTabKeysFollowLayout
            ? orderedGenerateTabs(generateTabOrder, hiddenGenerateTabs)
            : GENERATE_TABS
        const id = tabs[digit - 1]
        if (!id || (!generateTabKeysFollowLayout && id !== 'Generation' && hiddenGenerateTabs.includes(id))) {
          return
        }
        navigate('/')
        setTab(id)
        if (tabForSwap(swapTarget) && tabForSwap(swapTarget) !== id) {
          setSwapTarget(null)
        }
        return
      }
      if (overlayOpen()) {
        return
      }
      if (event.key === 'Escape') {
        if (busy) {
          event.preventDefault()
          void interrupt('skip')
        }
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') {
        return
      }
      event.preventDefault()
      if (event.altKey) {
        void interrupt('cancel')
        return
      }
      if (event.shiftKey) {
        void restart()
        return
      }
      if (!busy && health?.comfy.reachable === true && (fileUtility || checkpoint.trim())) {
        void generate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, checkpoint, generate, generateTabKeysFollowLayout, generateTabOrder, health, hiddenGenerateTabs, interrupt, navigate, fileUtility, restart, swapTarget])

  const comfyOk = health?.comfy.reachable === true
  const canGenerate =
    comfyOk &&
    (fileUtility
      ? (rembgMode
          ? rembg.inputMode === 'directory'
            ? Boolean(rembg.inputDir.trim())
            : rembgFiles.length > 0
          : upscaleMode
            ? imageUpscale.inputMode === 'directory'
              ? Boolean(imageUpscale.inputDir.trim())
              : imageUpscaleFiles.length > 0
            : caption.inputMode === 'directory'
              ? Boolean(caption.inputDir.trim())
              : captionFiles.length > 0) &&
        (!upscaleMode || imageUpscale.engine !== 'model' || Boolean(imageUpscale.upscaleModel.trim()))
      : Boolean(checkpoint.trim()) &&
        (!workflowParams.includes('textEncoder') || Boolean(textEncoder.trim())) &&
        (!workflowParams.includes('vae') || Boolean(vae.trim())) &&
        (!workflowParams.includes('hires') || !hires.enabled || Boolean(hires.upscaleModel.trim())) &&
        (!workflowParams.includes('hires') || !hires.enabled || !hires.modelOverride || Boolean(hires.checkpoint.trim())) &&
        (!workflowParams.includes('hires') ||
          !hires.enabled ||
          !hires.modelOverride ||
          !hiresDiffusion(hires.checkpoint, diffusionModels) ||
          (Boolean(hires.vae.trim()) && Boolean(hires.textEncoder.trim()))) &&
        (!adetailer.enabled || adetailer.units.filter((unit) => unit.enabled !== false).every((unit) => Boolean(unit.detector.trim()))) &&
        (!adetailer.enabled ||
          adetailer.units.every(
            (unit) =>
              unit.enabled === false ||
              !unit.modelOverride ||
              (Boolean(unit.checkpoint.trim()) &&
                (!hiresDiffusion(unit.checkpoint, diffusionModels) ||
                  (Boolean(unit.vae.trim()) && Boolean(unit.textEncoder.trim())))),
          )))
  const payload = job?.payload ?? {}
  const missingLoras = Array.isArray(payload.lora_missing)
    ? payload.lora_missing.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : []
  const loraWarning = missingLoras.length ? `Missing LoRA: ${missingLoras.join(', ')}` : null
  const warning = loraWarning
  const baseBatchTotal =
    Math.max(1, Number(payload.batch_size) || 1) * Math.max(1, Number(payload.batch_count) || 1)
  const matrixPayload =
    payload.prompt_matrix && typeof payload.prompt_matrix === 'object' && !Array.isArray(payload.prompt_matrix)
      ? (payload.prompt_matrix as { lines?: unknown; use_batch?: unknown })
      : null
  const matrixPayloadLines = promptMatrixLines(matrixPayload?.lines)
  const xyCells = xyPlotCellCount(payload.xy_plot)
  const batchTotal = xyCells
    ? xyCells
    : matrixPayloadLines.length
      ? matrixPayload?.use_batch === false
        ? matrixPayloadLines.length
        : baseBatchTotal * matrixPayloadLines.length
      : baseBatchTotal
  const batched = batchTotal > 1
  const progress = job?.progress
  const progressMax = progress?.max || 0
  const progressValue = progress?.value || 0
  const progressPct = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const progressStage = progress?.stage
  const hiresBar = Boolean(progressStage)
  const jobProg = job?.job_progress
  const jobMax = jobProg?.max || 0
  const jobValue = jobProg?.value || 0
  const jobPct = jobMax > 0 ? Math.min(100, (jobValue / jobMax) * 100) : 0
  const eta = etaSeconds(job?.started_at ?? null, progressValue, progressMax)
  const currentLabel = hiresBar
    ? hiresProgressLabel(progressStage, progressPct, batched ? null : eta, progress?.step, progress?.steps)
    : batched
      ? progressMax > 0
        ? `${progressValue} / ${progressMax}`
        : 'Starting…'
      : progressLabel(progressPct, eta)
  const overallLabel = batched
    ? progressLabel(jobPct, etaSeconds(job?.started_at ?? null, jobValue, jobMax))
    : null
  const seconds = job ? jobSeconds(job) : null
  const imageCount = imageIds.length || batchTotal
  const timing =
    seconds == null
      ? null
      : imageCount > 1
        ? `${formatDuration(seconds)} · ${formatDuration(seconds / imageCount)}/img`
        : formatDuration(seconds)
  const visibleTabs = fileUtility ? [] : orderedGenerateTabs(generateTabOrder, hiddenGenerateTabs)
  const shownTab = visibleTabs.includes(tab) ? tab : (visibleTabs[0] ?? 'Generation')
  const showTextEncoder = workflowParams.includes('textEncoder')
  const showVae = workflowParams.includes('vae')
  const baseItems = useMemo(() => [...checkpoints, ...diffusionModels], [checkpoints, diffusionModels])
  const baseItemKind = useMemo(() => {
    const unetSet = new Set(diffusionModels)
    return (item: ModelEntry): keyof ModelLists => (unetSet.has(item) ? 'diffusion_models' : 'checkpoints')
  }, [diffusionModels])
  const otherItems = useMemo(
    () => [...vaeItems, ...textEncoders, ...upscaleModels, ...sams, ...ultralytics],
    [sams, textEncoders, ultralytics, upscaleModels, vaeItems],
  )
  const otherItemKind = useMemo(() => {
    const teSet = new Set(textEncoders)
    const upscaleSet = new Set(upscaleModels)
    const samSet = new Set(sams)
    const ultraSet = new Set(ultralytics)
    return (item: ModelEntry): keyof ModelLists => {
      if (teSet.has(item)) {
        return 'text_encoders'
      }
      if (upscaleSet.has(item)) {
        return 'upscale_models'
      }
      if (samSet.has(item)) {
        return 'sams'
      }
      if (ultraSet.has(item)) {
        return 'ultralytics'
      }
      return 'vae'
    }
  }, [sams, textEncoders, ultralytics, upscaleModels])
  const otherSelected = [
    ...(showTextEncoder ? [textEncoder] : []),
    ...(showVae ? [vae] : []),
  ].filter(Boolean)
  const baseValue = checkpoint

  return (
    <div
      data-generate-root
      className={[
        'flex min-h-full min-w-0 flex-col gap-3',
        shownTab === 'Generation' ? 'h-full' : '',
      ].join(' ')}
    >
      {fileUtility ? null : (
      <GenerateChrome
        style={modelTileStyle}
        onOpenTab={setTab}
        showTextEncoder={showTextEncoder}
        showVae={showVae}
        prompt={<PromptStack negativeDisabled={cfg <= 1} />}
        actions={
          <GenerateActions
            busy={busy}
            canGenerate={canGenerate}
            onGenerate={() => void generate()}
            onInterrupt={(mode) => void interrupt(mode)}
          />
        }
      />
      )}

      <GenerateWorkspace
        shownTab={shownTab}
        visibleTabs={visibleTabs}
        onTab={setTab}
        swapTab={tabForSwap(swapTarget)}
        swapTarget={swapTarget}
        onSwapTarget={setSwapTarget}
        genRowRef={genRowRef}
        paramsWidth={paramsWidth}
        onParamsWidth={setParamsWidth}
        warning={warning}
        comfyOk={comfyOk}
        lastSeed={
          [...(job?.gallery ?? [])]
            .reverse()
            .find((item) => typeof item.seed === 'number')?.seed ??
          (typeof payload.seed === 'number' ? payload.seed : null)
        }
        workflowParams={workflowParams}
        starting={starting}
        imageIds={imageIds}
        jobId={jobId}
        job={job}
        busy={busy}
        progressPct={progressPct}
        currentLabel={currentLabel}
        progressSegments={
          hiresBar
            ? progressSegments(
                Boolean((payload.hires as { enabled?: unknown } | undefined)?.enabled),
                Boolean((payload.adetailer as { enabled?: unknown } | undefined)?.enabled),
              )
            : undefined
        }
        jobPct={jobPct}
        overallLabel={overallLabel}
        timing={timing}
        baseKind="checkpoints"
        baseItems={baseItems}
        baseItemKind={baseItemKind}
        baseValue={baseValue}
        onCheckpoint={setCheckpoint}
        onVae={setVae}
        onTextEncoder={setTextEncoder}
        otherItems={otherItems}
        otherItemKind={otherItemKind}
        otherSelected={otherSelected}
        loraItems={loraItems}
        activeLoraOrder={activeLoraOrder}
        loraAutoApplyDefault={loraAutoApplyDefault}
        wildcardItems={wildcardItems}
        onToggleAutoLora={toggleAutoLora}
        actions={
          fileUtility ? (
            <GenerateActions
              layout="bar"
              label="Process"
              busy={busy}
              canGenerate={canGenerate}
              onGenerate={() => void generate()}
              onInterrupt={(mode) => void interrupt(mode)}
            />
          ) : undefined
        }
      />
      {error ? (
        <ConfirmDialog
          title="Generate failed"
          body={error}
          onClose={() => setError(null)}
          actions={[{ label: 'Close', kind: 'primary', onClick: () => setError(null) }]}
        />
      ) : null}
    </div>
  )
}
