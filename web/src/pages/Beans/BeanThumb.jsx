import { useEffect, useRef, useState } from 'preact/hooks';
import { bagTextureUrl } from '../../services/BeanService.js';
import { loadArtThumb } from './bagTextures.js';
import { beanPalette } from './beanUtils.js';

/**
 * A bean's picture for list cards: the AI illustration when it has one (trimmed to the bag, loaded only once the card
 * is on screen), otherwise the flattened photo texture, otherwise a swatch in the bean's colour. Any failure falls
 * through to the next option, so a card never shows a broken image.
 */
export function BeanThumb({ bean }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [art, setArt] = useState('');
  const [artFailed, setArtFailed] = useState(false);
  const [texFailed, setTexFailed] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      entries => entries.some(e => e.isIntersecting) && (setVisible(true), io.disconnect()),
      { rootMargin: '300px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    setArt('');
    setArtFailed(false);
    if (!visible || !bean.artFront) return undefined;
    let cancelled = false;
    loadArtThumb(bean.artFront).then(
      url => !cancelled && setArt(url),
      () => !cancelled && setArtFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [visible, bean.artFront]);

  const texture = bean.hasPhoto && !texFailed ? bagTextureUrl(bean, 'front') : '';
  const wantsArt = !!bean.artFront && !artFailed;
  const palette = beanPalette(bean).base;

  return (
    <div
      ref={ref}
      className='flex h-16 w-16 shrink-0 items-center justify-center'
      data-testid='bean-thumb'
    >
      {art ? (
        <img
          src={art}
          alt=''
          data-thumb='art'
          className='h-full w-full object-contain drop-shadow-md'
        />
      ) : wantsArt ? (
        <div
          className='h-14 w-12 animate-pulse rounded-md opacity-40'
          style={{ background: palette }}
          data-thumb='loading'
        />
      ) : texture ? (
        <img
          src={texture}
          alt=''
          data-thumb='texture'
          loading='lazy'
          onError={() => setTexFailed(true)}
          className='h-full w-full rounded-md object-contain shadow'
        />
      ) : (
        <div
          className='h-14 w-11 rounded-md shadow'
          style={{ background: palette }}
          data-thumb='swatch'
        />
      )}
    </div>
  );
}
