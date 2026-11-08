import { useRef, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera';
import { bagTextureUrl, deleteBagTextures, uploadBagTexture } from '../../services/BeanService.js';
import { buildFrontOnly, buildPanel } from './makeBag.js';
import { renderEndpoint, requestRender } from './renderClient.js';

/** Replace or remove a saved bean's bag photos. Commits immediately via onChange(partialBean). */
export function BagEditor({ apiService, scanner, bean, onChange }) {
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const front = bagTextureUrl(bean, 'front');
  const back = bagTextureUrl(bean, 'back');

  const run = async fn => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(`Couldn't save the photo: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const pickFront = e => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    run(async () => {
      const r = await buildFrontOnly(file);
      await uploadBagTexture(bean.id, r.blob, 'front');
      await onChange({ hasPhoto: true, photoV: Date.now(), ar: r.aspect, color: r.color });
    });
  };
  const pickBack = e => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    run(async () => {
      const r = await buildPanel({ file, aspect: bean.ar || 0.75 });
      await uploadBagTexture(bean.id, r.blob, 'back');
      await onChange({ hasBack: true, photoV: Date.now() });
    });
  };
  // re-render from the textures stored on the machine (lower detail than the original photos, but no re-shoot needed)
  const rerender = () =>
    run(async () => {
      const get = async side => (await fetch(bagTextureUrl(bean, side))).blob();
      const result = await requestRender(scanner, {
        front: await get('front'),
        back: back ? await get('back') : null,
      });
      await onChange({ artFront: result.front, artBack: result.back || '' });
    });
  const remove = () =>
    run(async () => {
      await deleteBagTextures(apiService, bean.id);
      await onChange({
        hasPhoto: false,
        hasBack: false,
        photoV: 0,
        color: '',
        ar: 0,
        artFront: '',
        artBack: '',
      });
    });

  const tile = (url, label) => (
    <div className='flex flex-col items-center gap-1'>
      <div className='bg-base-200 flex h-28 w-20 items-center justify-center overflow-hidden rounded-md'>
        {url ? (
          <img src={url} alt={`Current ${label}`} className='h-full w-full object-contain' />
        ) : (
          <span className='text-base-content/50 px-1 text-center text-[0.65rem]'>Generated</span>
        )}
      </div>
      <span className='text-base-content/60 text-xs'>{label}</span>
    </div>
  );

  return (
    <div className='flex flex-wrap items-center gap-4' data-testid='bag-editor'>
      <div className='flex gap-3'>
        {tile(front, 'Front')}
        {tile(back, 'Back')}
      </div>
      <div className='flex flex-col gap-2'>
        <input
          ref={frontRef}
          type='file'
          accept='image/*'
          capture='environment'
          className='hidden'
          data-testid='front-input'
          onChange={pickFront}
        />
        <input
          ref={backRef}
          type='file'
          accept='image/*'
          capture='environment'
          className='hidden'
          data-testid='back-input'
          onChange={pickBack}
        />
        <button
          type='button'
          className='btn btn-sm btn-outline'
          disabled={busy}
          onClick={() => frontRef.current?.click()}
        >
          <FontAwesomeIcon icon={faCamera} />
          {busy ? 'Saving…' : front ? 'Replace front photo' : 'Add front photo'}
        </button>
        <button
          type='button'
          className='btn btn-sm btn-outline'
          disabled={busy || !front}
          onClick={() => backRef.current?.click()}
        >
          <FontAwesomeIcon icon={faCamera} />
          {back ? 'Replace back photo' : 'Add back photo'}
        </button>
        {front && renderEndpoint(scanner) && (
          <button
            type='button'
            className='btn btn-sm btn-outline'
            disabled={busy}
            onClick={rerender}
            data-testid='rerender'
          >
            {busy ? 'Working…' : bean.artFront ? 'Re-illustrate' : 'Create illustration'}
          </button>
        )}
        {bean.artFront && (
          <button
            type='button'
            className='btn btn-sm btn-ghost'
            disabled={busy}
            onClick={() => run(() => onChange({ artFront: '', artBack: '' }))}
            data-testid='remove-render'
          >
            Use the 3D bag instead of the illustration
          </button>
        )}
        {(front || back) && (
          <button type='button' className='btn btn-sm btn-ghost' disabled={busy} onClick={remove}>
            Remove photos
          </button>
        )}
        {error && (
          <div className='text-error text-sm' role='alert'>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
