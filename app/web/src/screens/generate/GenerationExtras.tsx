import { ExpandSection } from '@/components/primitives/ExpandSection.tsx'
import { useState } from 'react'

export function GenerationExtras() {
  const [hires, setHires] = useState(false)
  const [adetailer, setAdetailer] = useState(false)
  const [controlnet, setControlnet] = useState(false)

  return (
    <>
      <ExpandSection title="Hires. fix" enabled={hires} onEnabled={setHires} fit>
        <p className="text-sm text-muted">Hires. fix settings will go here.</p>
      </ExpandSection>
      <ExpandSection title="ADetailer" enabled={adetailer} onEnabled={setAdetailer} fit>
        <p className="text-sm text-muted">ADetailer settings will go here.</p>
      </ExpandSection>
      <ExpandSection title="ControlNet" enabled={controlnet} onEnabled={setControlnet} fit>
        <p className="text-sm text-muted">ControlNet settings will go here.</p>
      </ExpandSection>
    </>
  )
}
