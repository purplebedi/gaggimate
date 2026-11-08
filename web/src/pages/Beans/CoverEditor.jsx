import { useRef, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera';
import { coverUrl, deleteCover, uploadCover } from '../../services/BeanService.js';
import { makeCover } from './cover.js';

/** Replace or remove a saved bean's shelf cover photo. Commits immediately via onChange(partialBean). */
export function CoverEditor({ apiService, bean, onChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = coverUrl(bean);

  const pick = async e => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const cover = await makeCover(file, null);
      await uploadCover(bean.id, cover.blob);
      await onChange({ hasPhoto: true, photoV: Date.now(), color: cover.color });
    } catch (err) {
      setError(`Couldn't save the photo: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteCover(apiService, bean.id);
      await onChange({ hasPhoto: false, photoV: 0, color: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex items-center gap-4' data-testid='cover-editor'>
      <div className='bg-base-200 flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md'>
        {url ? (
          <img src={url} alt='Current cover' className='h-full w-full object-cover' />
        ) : (
          <span className='text-base-content/50 px-1 text-center text-[0.65rem]'>
            Generated label
          </span>
        )}
      </div>
      <div className='flex flex-col gap-2'>
        <input
          ref={fileRef}
          type='file'
          accept='image/*'
          capture='environment'
          className='hidden'
          data-testid='cover-input'
          onChange={pick}
        />
        <button
          type='button'
          className='btn btn-sm btn-outline'
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <FontAwesomeIcon icon={faCamera} />
          {busy ? 'Saving…' : url ? 'Replace cover photo' : 'Add cover photo'}
        </button>
        {url && (
          <button type='button' className='btn btn-sm btn-ghost' disabled={busy} onClick={remove}>
            Remove photo
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
