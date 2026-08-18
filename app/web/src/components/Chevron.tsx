export function Chevron({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path
        d={dir === 'up' ? 'M1 5.5 4 2.5 7 5.5' : 'M1 2.5 4 5.5 7 2.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
