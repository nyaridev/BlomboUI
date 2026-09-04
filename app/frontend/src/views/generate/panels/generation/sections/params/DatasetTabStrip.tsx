import { TabsList, TabsTrigger } from '@/components/controls/tabs/TabsControl.tsx'

export type DatasetPassTab = 'sprites'

export function DatasetTabStrip({
  value,
  onValueChange,
}: {
  value: DatasetPassTab
  onValueChange: (value: DatasetPassTab) => void
}) {
  return (
    <TabsList
      value={value}
      onValueChange={(next) => onValueChange(next as DatasetPassTab)}
      className="tabs-rail shrink-0"
    >
      <TabsTrigger value="sprites" active={value === 'sprites'}>
        Sprites
      </TabsTrigger>
    </TabsList>
  )
}
