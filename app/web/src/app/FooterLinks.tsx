function ComfyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="3.2" cy="7" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.8" cy="3.4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.8" cy="10.6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.7 6.3 9.3 4.1M4.7 7.7 9.3 9.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 1.2A5.8 5.8 0 0 0 1.2 7.1c0 2.6 1.7 4.8 4 5.6.3.06.4-.13.4-.3v-1.1c-1.63.36-2-0.8-2-0.8-.26-.68-.66-.86-.66-.86-.54-.38.04-.37.04-.37.6.04.91.62.91.62.54.94 1.42.67 1.77.51.05-.4.21-.67.38-.82-1.3-.15-2.67-.66-2.67-2.95 0-.65.23-1.18.6-1.6-.06-.15-.26-.76.06-1.58 0 0 .5-.16 1.64.61a5.6 5.6 0 0 1 3 0c1.14-.77 1.64-.61 1.64-.61.32.82.12 1.43.06 1.58.38.42.6.95.6 1.6 0 2.3-1.37 2.8-2.68 2.95.22.19.41.56.41 1.13v1.67c0 .17.1.37.4.3A5.81 5.81 0 0 0 12.8 7 5.8 5.8 0 0 0 7 1.2z"
      />
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
        <GithubIcon />
      </a>
    </div>
  )
}
