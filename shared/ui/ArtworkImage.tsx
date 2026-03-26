/**
 * ArtworkImage - Shared Next.js Image wrapper for external artwork (Spotify, Tidal, etc.).
 *
 * Use `fill` mode for images that should fill a positioned parent container.
 * Use explicit `width`/`height` for images with known pixel dimensions.
 * Lazy-loads by default; set `priority` for above-the-fold images.
 */

import Image from 'next/image';

interface ArtworkImageBaseProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  onClick?: React.MouseEventHandler<HTMLImageElement> | undefined;
  title?: string | undefined;
}

interface ArtworkImageFillProps extends ArtworkImageBaseProps {
  fill: true;
  width?: never;
  height?: never;
}

interface ArtworkImageSizedProps extends ArtworkImageBaseProps {
  fill?: false;
  width: number;
  height: number;
}

type ArtworkImageProps = ArtworkImageFillProps | ArtworkImageSizedProps;

export function ArtworkImage({
  src,
  alt,
  className,
  sizes,
  priority = false,
  onClick,
  title,
  ...rest
}: ArtworkImageProps) {
  if ('fill' in rest && rest.fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={className}
        sizes={sizes ?? '128px'}
        priority={priority}
        onClick={onClick}
        title={title}
      />
    );
  }

  const { width, height } = rest as ArtworkImageSizedProps;
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      sizes={sizes}
      priority={priority}
      onClick={onClick}
      title={title}
    />
  );
}
