import { assetUrl, installation } from '../../config/installation'
import { cn } from '../../lib/cn'

type BrandLogoProps = {
  variant?: 'full' | 'symbol'
  tone?: 'color' | 'white'
  className?: string
  alt?: string
}

export function BrandLogo({ variant = 'full', tone = 'color', className, alt }: BrandLogoProps) {
  const src = variant === 'full' ? installation.logo.fullColor : installation.logo.symbolWhite
  const label = alt ?? `${installation.providerName} ${variant === 'full' ? 'logo' : 'símbolo'}`

  return (
    <img
      src={assetUrl(src)}
      alt={label}
      className={cn('block h-auto object-contain', tone === 'white' && 'brightness-0 invert', className)}
    />
  )
}
