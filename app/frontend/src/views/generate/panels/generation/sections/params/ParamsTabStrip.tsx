import { TabsList, TabsTrigger } from '@/components/controls/tabs/TabsControl.tsx'

export type PassTab = 'first' | 'controlnet' | 'hires' | 'adetailer'

export function ParamsTabStrip({
  value,
  onValueChange,
  showHires,
  hiresOn,
  adetailerOn,
  controlnetOn,
  onHires,
  onAdetailer,
  onControlnet,
  locked = false,
}: {
  value: PassTab
  onValueChange: (value: PassTab) => void
  showHires: boolean
  hiresOn: boolean
  adetailerOn: boolean
  controlnetOn: boolean
  onHires: (enabled: boolean) => void
  onAdetailer: (enabled: boolean) => void
  onControlnet: (enabled: boolean) => void
  locked?: boolean
}) {
  return (
    <TabsList
      value={value}
      onValueChange={(next) => onValueChange(next as PassTab)}
      className="tabs-rail shrink-0"
    >
      <TabsTrigger value="first" active={value === 'first'}>
        First Pass
      </TabsTrigger>
      <TabsTrigger
        value="controlnet"
        active={value === 'controlnet'}
        checked={controlnetOn}
        disabled={locked}
        onCheckedChange={(enabled) => {
          onControlnet(enabled)
          if (enabled) {
            onValueChange('controlnet')
          }
        }}
      >
        ControlNet
      </TabsTrigger>
      {showHires ? (
        <TabsTrigger
          value="hires"
          active={value === 'hires'}
          checked={hiresOn}
          disabled={locked}
          onCheckedChange={(enabled) => {
            onHires(enabled)
            if (enabled) {
              onValueChange('hires')
            }
          }}
        >
          Hires. fix
        </TabsTrigger>
      ) : null}
      <TabsTrigger
        value="adetailer"
        active={value === 'adetailer'}
        checked={adetailerOn}
        disabled={locked}
        onCheckedChange={(enabled) => {
          onAdetailer(enabled)
          if (enabled) {
            onValueChange('adetailer')
          }
        }}
      >
        ADetailer
      </TabsTrigger>
    </TabsList>
  )
}
