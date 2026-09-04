import { AuthorAliasesSection, AUTHOR_ALIASES_QUERY } from '@/views/settings/panels/content/sections/civitai/AuthorAliasesSection.tsx'
import { ProfilesSection, PROFILES_QUERY } from '@/views/settings/panels/content/sections/general/ProfilesSection.tsx'
import { GeneralSection, GENERAL_QUERY } from '@/views/settings/panels/content/sections/general/GeneralSection.tsx'
import { DownloadSection, DOWNLOAD_QUERY } from '@/views/settings/panels/content/sections/civitai/DownloadSection.tsx'
import { HistorySection, HISTORY_QUERY } from '@/views/settings/panels/content/sections/civitai/HistorySection.tsx'
import { PickersSection, GALLERY_QUERY } from '@/views/settings/panels/content/sections/general/PickersSection.tsx'
import { GallerySection, GALLERY_TAB_QUERY } from '@/views/settings/panels/content/sections/gallery/GallerySection.tsx'
import { GridsSection, GRIDS_QUERY } from '@/views/settings/panels/content/sections/generate/GridsSection.tsx'
import { GenerationSection, GENERATION_QUERY } from '@/views/settings/panels/content/sections/generate/GenerationSection.tsx'
import { ModelsSection, MODELS_QUERY } from '@/views/settings/panels/content/sections/models/ModelsSection.tsx'
import { ManagerSection, MANAGER_QUERY } from '@/views/settings/panels/content/sections/models/ManagerSection.tsx'
import { ThumbnailsSection, THUMBNAILS_QUERY } from '@/views/settings/panels/content/sections/models/ThumbnailsSection.tsx'
import { BrowseSection, CIVITAI_BROWSE_QUERY } from '@/views/settings/panels/content/sections/civitai/BrowseSection.tsx'
import { LabelsSection, CIVITAI_LABELS_QUERY } from '@/views/settings/panels/content/sections/civitai/LabelsSection.tsx'
import { CivitaiAccountSection, CivitaiMetadataSection, CIVITAI_ACCOUNT_QUERY, CIVITAI_QUERY } from '@/views/settings/panels/content/sections/civitai/CivitaiSection.tsx'
import { PrimitivesSection } from '@/views/settings/panels/content/sections/other/PrimitivesSection.tsx'
import { DirectoriesSection, DIRECTORIES_QUERY } from '@/views/settings/panels/content/sections/files/DirectoriesSection.tsx'
import { SavingSection, SAVING_QUERY } from '@/views/settings/panels/content/sections/files/SavingSection.tsx'
import { TempSection, TEMP_QUERY } from '@/views/settings/panels/content/sections/files/TempSection.tsx'
import { ShortcutsSection, SHORTCUTS_QUERY } from '@/views/settings/panels/content/sections/other/ShortcutsSection.tsx'
import { TabsSection, TABS_QUERY } from '@/views/settings/panels/content/sections/general/TabsSection.tsx'
import { AutocompleteBehaviorSection, AutocompleteSection, AUTOCOMPLETE_GENERAL_QUERY, AUTOCOMPLETE_QUERY } from '@/views/settings/panels/content/sections/autocomplete/AutocompleteSection.tsx'
import { FrequentTagsSection, FREQUENT_TAGS_QUERY } from '@/views/settings/panels/content/sections/autocomplete/FrequentTagsSection.tsx'
import { TrashSection, REMOVED_QUERY } from '@/views/settings/panels/content/sections/other/TrashSection.tsx'

export const GROUPS = [
  {
    title: 'General',
    pages: [
      { id: 'Appearance', terms: GENERAL_QUERY, Panel: GeneralSection },
      { id: 'Profiles', terms: PROFILES_QUERY, Panel: ProfilesSection },
      { id: 'Tabs', terms: TABS_QUERY, Panel: TabsSection },
      { id: 'Pickers', terms: GALLERY_QUERY, Panel: PickersSection },
    ],
  },
  {
    title: 'Generate',
    pages: [
      { id: 'Generation', terms: GENERATION_QUERY, Panel: GenerationSection },
      { id: 'Grids', terms: GRIDS_QUERY, Panel: GridsSection },
    ],
  },
  {
    title: 'Files',
    pages: [
      { id: 'Directories', terms: DIRECTORIES_QUERY, Panel: DirectoriesSection },
      { id: 'Output', label: 'Saving', terms: SAVING_QUERY, Panel: SavingSection },
      { id: 'Temp', terms: TEMP_QUERY, Panel: TempSection },
    ],
  },
  {
    title: 'Gallery',
    pages: [{ id: 'Gallery', terms: GALLERY_TAB_QUERY, Panel: GallerySection }],
  },
  {
    title: 'Models',
    pages: [
      { id: 'Models', terms: MODELS_QUERY, Panel: ModelsSection },
      { id: 'Manager', terms: MANAGER_QUERY, Panel: ManagerSection },
      { id: 'Thumbnails', terms: THUMBNAILS_QUERY, Panel: ThumbnailsSection },
    ],
  },
  {
    title: 'Civitai',
    pages: [
      { id: 'civitai-account', label: 'Account', terms: CIVITAI_ACCOUNT_QUERY, Panel: CivitaiAccountSection },
      { id: 'civitai-browse', label: 'Browse', terms: CIVITAI_BROWSE_QUERY, Panel: BrowseSection },
      { id: 'civitai-labels', label: 'Labels', terms: CIVITAI_LABELS_QUERY, Panel: LabelsSection },
      { id: 'Download', terms: DOWNLOAD_QUERY, Panel: DownloadSection },
      { id: 'author-aliases', label: 'Author Aliases', terms: AUTHOR_ALIASES_QUERY, Panel: AuthorAliasesSection },
      { id: 'History', terms: HISTORY_QUERY, Panel: HistorySection },
      { id: 'Metadata', terms: CIVITAI_QUERY, Panel: CivitaiMetadataSection },
    ],
  },
  {
    title: 'Autocomplete',
    pages: [
      { id: 'autocomplete-general', label: 'Behavior', terms: AUTOCOMPLETE_GENERAL_QUERY, Panel: AutocompleteBehaviorSection },
      { id: 'autocomplete-tag-lists', label: 'Tag Lists', terms: AUTOCOMPLETE_QUERY, Panel: AutocompleteSection },
      { id: 'autocomplete-frequent-tags', label: 'Frequent Tags', terms: FREQUENT_TAGS_QUERY, Panel: FrequentTagsSection },
    ],
  },
  {
    title: 'Other',
    pages: [
      { id: 'Shortcuts', terms: SHORTCUTS_QUERY, Panel: ShortcutsSection },
      { id: 'Primitives', terms: '', search: false, Panel: PrimitivesSection },
      { id: 'Trash', terms: REMOVED_QUERY, Panel: TrashSection, danger: true, icon: 'trash-2' },
    ],
  },
] as const

export type PageId = (typeof GROUPS)[number]['pages'][number]['id']
