import { forwardRef, type SVGProps } from 'react'
import type { LucideProps } from 'lucide-react'

export const HorseHead = forwardRef<SVGSVGElement, LucideProps>(function HorseHead(
  { color = 'currentColor', size = 24, strokeWidth = 2, className, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(props as SVGProps<SVGSVGElement>)}
    >
      <path d="M11.5 12H11" />
      <path d="M5 15a4 4 0 0 0 4 4h7.8l.3.3a3 3 0 0 0 4-4.46L12 7c0-3-1-5-1-5S8 3 8 7c-4 1-6 3-6 3" />
      <path d="M6.14 17.8S4 19 2 22" />
    </svg>
  )
})
