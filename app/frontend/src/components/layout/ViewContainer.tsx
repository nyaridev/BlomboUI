import { Navigate } from 'react-router-dom'
import { FILL_PATHS, REDIRECTS, paneClass } from '@/app/router.tsx'
import { ErrorsView } from '@/views/errors/ErrorsView.tsx'
import { FileInfoView } from '@/views/fileinfo/FileInfoView.tsx'
import { GalleryView } from '@/views/gallery/GalleryView.tsx'
import { GenerateView } from '@/views/generate/GenerateView.tsx'
import { HistoryView } from '@/views/history/HistoryView.tsx'
import { ModelsView } from '@/views/models/ModelsView.tsx'
import { ScopesView } from '@/views/scopes/ScopesView.tsx'
import { SettingsView } from '@/views/settings/SettingsView.tsx'
import { WildcardsView } from '@/views/wildcards/WildcardsView.tsx'

export function ViewContainer({ pathname }: { pathname: string }) {
  return (
    <>
      {REDIRECTS.map(([from, to]) => (pathname === from ? <Navigate key={from} to={to} replace /> : null))}
      <div className={paneClass(pathname === '/')}>
        <GenerateView />
      </div>
      <div className={paneClass(pathname === '/file-info', true)}>
        <FileInfoView />
      </div>
      <div className={paneClass(pathname === '/gallery', true)}>
        <GalleryView />
      </div>
      <div className={paneClass(pathname === '/models', true)}>
        <ModelsView />
      </div>
      <div className={paneClass(pathname === '/wildcards', true)}>
        <WildcardsView />
      </div>
      <div className={paneClass(pathname === '/scopes', true)}>
        <ScopesView />
      </div>
      <div className={paneClass(pathname === '/settings', true)}>
        <SettingsView />
      </div>
      <div className={paneClass(pathname === '/history', true)}>
        <HistoryView />
      </div>
      <div className={paneClass(pathname === '/errors', true)}>
        <ErrorsView />
      </div>
    </>
  )
}

export function mainOverflowHidden(pathname: string) {
  return FILL_PATHS.has(pathname)
}
