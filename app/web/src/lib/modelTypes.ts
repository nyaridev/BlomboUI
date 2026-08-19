export type ModelTypeSection = { title: string; options: string[] }

export const MODEL_TYPE_SECTIONS: ModelTypeSection[] = [
  { title: 'Anima', options: ['Anima'] },
  { title: 'AuraFlow', options: ['AuraFlow'] },
  { title: 'Chroma', options: ['Chroma'] },
  { title: 'CogVideoX', options: ['CogVideoX'] },
  { title: 'Baidu', options: ['Ernie'] },
  {
    title: 'Black Forest Labs',
    options: [
      'Flux.1 S',
      'Flux.1 D',
      'Flux.1 Krea',
      'Flux.1 Kontext',
      'Flux.2 D',
      'Flux.2 Klein 9B',
      'Flux.2 Klein 9B-base',
      'Flux.2 Klein 4B',
      'Flux.2 Klein 4B-base',
      'Flux 3 Video',
    ],
  },
  { title: 'xAI', options: ['Grok'] },
  { title: 'Alibaba - Taotian', options: ['HappyHorse'] },
  { title: 'HiDream', options: ['HiDream', 'HiDream-O1'] },
  { title: 'Tencent', options: ['Hunyuan 1', 'Hunyuan Video'] },
  { title: 'Ideogram', options: ['Ideogram 4.0'] },
  { title: 'Boogu', options: ['Boogu'] },
  { title: 'SDXL Community', options: ['Illustrious', 'NoobAI'] },
  { title: 'Kolors', options: ['Kolors'] },
  { title: 'Krea AI', options: ['Krea 2'] },
  { title: 'Lightricks', options: ['LTXV', 'LTXV2', 'LTXV 2.3', 'LTXV 2.5'] },
  { title: 'Lens', options: ['Lens'] },
  { title: 'Lumina', options: ['Lumina'] },
  { title: 'Microsoft', options: ['MageFlow', 'MAI'] },
  { title: 'Mochi', options: ['Mochi'] },
  { title: 'PixArt', options: ['PixArt a', 'PixArt E'] },
  { title: 'Pony Diffusion', options: ['Pony', 'Pony V7'] },
  {
    title: 'Alibaba',
    options: [
      'Qwen',
      'Qwen 2',
      'Qwen 3',
      'Wan Video 1.3B t2v',
      'Wan Video 14B t2v',
      'Wan Video 14B i2v 480p',
      'Wan Video 14B i2v 720p',
      'Wan Video 2.2 TI2V-5B',
      'Wan Video 2.2 I2V-A14B',
      'Wan Video 2.2 T2V-A14B',
      'Wan Video 2.5 T2V',
      'Wan Video 2.5 I2V',
      'Wan Image 2.7',
      'Wan Video 2.7',
    ],
  },
  {
    title: 'Stability AI',
    options: [
      'SD 1.4',
      'SD 1.5',
      'SD 1.5 LCM',
      'SD 1.5 Hyper',
      'SD 2.0',
      'SD 2.1',
      'SDXL 1.0',
      'SDXL Lightning',
      'SDXL Hyper',
    ],
  },
  { title: 'Reve AI', options: ['Reve'] },
  { title: 'Alibaba - Tongyi Lab', options: ['ZImageTurbo', 'ZImageBase'] },
  { title: 'Hailuo H3 by MiniMax', options: ['MiniMax H3'] },
  { title: 'ACE Audio', options: ['ACE Audio'] },
]

export const MODEL_TYPES = MODEL_TYPE_SECTIONS.flatMap((section) => section.options)

export const DEFAULT_VISIBLE_MODEL_TYPES = [
  'Anima',
  'Illustrious',
  'NoobAI',
  'Krea 2',
  'SD 1.5',
  'SDXL 1.0',
  'Pony',
  'Flux.1 D',
  'Flux.1 S',
  'Wan Video 2.2 TI2V-5B',
  'Wan Video 2.2 I2V-A14B',
  'Wan Video 2.2 T2V-A14B',
]

export function defaultHiddenModelTypes() {
  return MODEL_TYPES.filter((item) => !DEFAULT_VISIBLE_MODEL_TYPES.includes(item))
}

export function filterTypeSections(sections: ModelTypeSection[], keep: (item: string) => boolean) {
  return sections
    .map((section) => ({ title: section.title, options: section.options.filter(keep) }))
    .filter((section) => section.options.length > 0)
}

const TYPE_ALIASES: Record<string, string> = {
  sdxl: 'SDXL 1.0',
  'sdxl 0.9': 'SDXL 1.0',
  'flux.1 dev': 'Flux.1 D',
  'flux.1 schnell': 'Flux.1 S',
  'illustrious xl': 'Illustrious',
  'pony diffusion': 'Pony',
  'noobai xl': 'NoobAI',
}

export function matchModelType(value: string) {
  const want = value.trim().toLowerCase()
  if (!want) {
    return ''
  }
  return MODEL_TYPES.find((item) => item.toLowerCase() === want) || TYPE_ALIASES[want] || ''
}
