import { AppIcon } from '@/components/AppIcon.tsx'

function ComfyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="3.2" cy="7" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.8" cy="3.4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.8" cy="10.6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.7 6.3 9.3 4.1M4.7 7.7 9.3 9.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function FooterLinks({ comfyUrl }: { comfyUrl: string }) {
  return (
    <div className="ml-auto flex items-center gap-0">
      <a
        className="flex items-center justify-center p-0.5 text-muted hover:text-ink"
        href={comfyUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open ComfyUI"
        title="Open ComfyUI"
      >
        <ComfyIcon />
      </a>
      <a
        className="flex items-center justify-center p-0.5 text-muted hover:text-ink"
        href="https://github.com/nyaridev/BlomboUI"
        target="_blank"
        rel="noreferrer"
        aria-label="BlomboUI on GitHub"
        title="GitHub"
      >
        <AppIcon id="github" />
      </a>
    </div>
  )
}
