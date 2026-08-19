const PATH = {
  up: 'M1 5.5 4 2.5 7 5.5',
  down: 'M1 2.5 4 5.5 7 2.5',
  left: 'M5.5 1 2.5 4 5.5 7',
  right: 'M2.5 1 5.5 4 2.5 7',
} as const

export function Chevron({ dir, size = 8 }: { dir: keyof typeof PATH; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true">
      <path
        d={PATH[dir]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
