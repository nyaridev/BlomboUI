import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'

export function GalleryImageToolbar({
  favorite,
  onFileInfo,
  onFavorite,
  onRemove,
}: {
  favorite: boolean
  onFileInfo: () => void
  onFavorite: () => void
  onRemove: () => void
}) {
  return (
    <>
      <IconButton label onClick={onFileInfo}>
        <AppIcon id="info" />
        File Info
      </IconButton>
      <IconButton label onClick={onRemove}>
        <AppIcon id="trash-2" />
        Remove
      </IconButton>
      <IconButton on={favorite} aria-label={favorite ? 'Unfavorite' : 'Favorite'} onClick={onFavorite}>
        <AppIcon id="star" className={favorite ? 'fill-current text-yellow' : ''} />
      </IconButton>
    </>
  )
}
