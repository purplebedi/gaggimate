import { useEffect, useRef, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { scanPhotos } from '../../services/BeanService.js';
import uuidv4 from '../../utils/uuid.js';
import { makeCover } from './cover.js';
import { BeanForm } from './BeanForm.jsx';
import { EMPTY_BEAN, applyScan } from './beanUtils.js';

const MAX_PHOTOS = 4;
const PHOTO_LABELS = ['Front', 'Back', 'Side', 'Extra'];

/**
 * Add-bean flow: take photos (front, back, ...) -> read them -> review/edit the
 * filled-in fields -> save. Without a configured scanner it is just the form.
 *
 * Photos are owned by the page (it opens the camera from the tap on "Add bean",
 * which browsers only allow inside a user gesture).
 */
export function AddBean({ scanner, photos, onPickPhoto, onRemovePhoto, onSave, onCancel }) {
  const canScan = !!scanner?.endpoint;
  const [step, setStep] = useState(canScan ? 'capture' : 'review');
  const [bean, setBean] = useState(EMPTY_BEAN);
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [id] = useState(() => uuidv4());
  const [boxes, setBoxes] = useState([]); // per photo: bbox the scanner found (or null)
  const [coverChoice, setCoverChoice] = useState(0); // photo index, or -1 for the generated label
  const [cover, setCover] = useState(null); // {blob, url, color}
  const [coverBusy, setCoverBusy] = useState(false);
  const coverUrlRef = useRef('');

  const read = async () => {
    setScanning(true);
    setError('');
    try {
      const result = await scanPhotos(
        scanner,
        photos.map(p => p.file),
      );
      setBean(prev => applyScan(prev, result));
      const info = Array.isArray(result?.photos) ? result.photos : [];
      setBoxes(photos.map((_, i) => info.find(p => p.index === i + 1)?.bbox || null));
      const front = info.find(p => p.role === 'front');
      setCoverChoice(front ? front.index - 1 : 0);
      setScanned(true);
      setStep('review');
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // build the shelf cover (cropped, tiny JPEG) whenever the chosen photo changes
  useEffect(() => {
    if (step !== 'review') return undefined;
    let cancelled = false;
    const photo = coverChoice >= 0 ? photos[coverChoice] : null;
    if (!photo) {
      setCover(null);
      return undefined;
    }
    setCoverBusy(true);
    makeCover(photo.file, boxes[coverChoice] || null)
      .then(result => {
        if (cancelled) return;
        URL.revokeObjectURL(coverUrlRef.current);
        coverUrlRef.current = URL.createObjectURL(result.blob);
        setCover({ ...result, url: coverUrlRef.current });
      })
      .catch(() => !cancelled && setCover(null))
      .finally(() => !cancelled && setCoverBusy(false));
    return () => {
      cancelled = true;
    };
  }, [step, coverChoice, photos, boxes]);
  useEffect(() => () => URL.revokeObjectURL(coverUrlRef.current), []);

  const save = form => onSave({ ...form, id, createdAt: Math.floor(Date.now() / 1000) }, cover);

  if (step === 'review') {
    return (
      <>
        <h2 className='mb-4 text-xl font-bold'>{scanned ? 'Check the details' : 'Add bean'}</h2>
        <BeanForm
          // remount if a rescan replaces the fields
          key={scanned ? 'scanned' : 'manual'}
          initial={bean}
          notice={
            <>
              {scanned && (
                <div className='text-success text-sm' data-testid='scan-notice'>
                  Filled in from your photos. Fix anything that looks wrong before saving.
                </div>
              )}
              {photos.length > 0 && (
                <div className='flex flex-col gap-2' data-testid='cover-picker'>
                  <div className='text-sm font-medium'>Shelf cover</div>
                  <div className='flex flex-wrap items-center gap-3'>
                    <div className='bg-base-200 relative flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md'>
                      {cover && coverChoice >= 0 ? (
                        <img
                          src={cover.url}
                          alt='Shelf cover preview'
                          data-testid='cover-preview'
                          className='h-full w-full object-cover'
                        />
                      ) : (
                        <span className='text-base-content/50 px-1 text-center text-[0.65rem]'>
                          {coverBusy ? 'Cropping…' : 'Generated label'}
                        </span>
                      )}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {photos.map((p, i) => (
                        <button
                          key={p.url}
                          type='button'
                          aria-label={`Use ${PHOTO_LABELS[i] || 'extra'} photo as cover`}
                          aria-pressed={coverChoice === i}
                          onClick={() => setCoverChoice(i)}
                          className={`h-14 w-14 overflow-hidden rounded-md ring-2 ${coverChoice === i ? 'ring-primary' : 'opacity-70 ring-transparent'}`}
                        >
                          <img src={p.url} alt='' className='h-full w-full object-cover' />
                        </button>
                      ))}
                      <button
                        type='button'
                        aria-pressed={coverChoice === -1}
                        onClick={() => setCoverChoice(-1)}
                        className={`btn btn-xs h-14 w-14 rounded-md ${coverChoice === -1 ? 'btn-primary' : 'btn-outline'}`}
                      >
                        No photo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          }
          cancelLabel={canScan ? 'Back to photos' : 'Cancel'}
          onCancel={canScan ? () => setStep('capture') : onCancel}
          onSave={save}
        />
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4' data-testid='capture-step'>
      <h2 className='text-xl font-bold'>Scan the bag</h2>
      <p className='text-base-content/70 text-sm'>
        {photos.length === 0
          ? 'Take a photo of the front of the bag.'
          : 'Add the back too if it has more details (roast date, tasting notes), then read the bag.'}
      </p>

      {photos.length > 0 && (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4' data-testid='photo-list'>
          {photos.map((p, i) => (
            <div key={p.url} className='relative'>
              <img
                src={p.url}
                alt={`${PHOTO_LABELS[i] || 'Extra'} of bag`}
                className='aspect-square w-full rounded-lg object-cover'
              />
              <span className='badge badge-neutral badge-sm absolute bottom-1 left-1'>
                {PHOTO_LABELS[i] || 'Extra'}
              </span>
              <button
                type='button'
                className='btn btn-circle btn-xs absolute top-1 right-1'
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => onRemovePhoto(i)}
                disabled={scanning}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type='button'
        className={`btn ${photos.length === 0 ? 'btn-primary' : 'btn-outline'}`}
        onClick={onPickPhoto}
        disabled={scanning || photos.length >= MAX_PHOTOS}
      >
        <FontAwesomeIcon icon={faCamera} />
        {photos.length === 0 ? 'Take photo' : 'Add another photo (e.g. back)'}
      </button>

      {error && (
        <div className='text-error text-sm' role='alert'>
          {error}
        </div>
      )}

      <div className='flex flex-wrap justify-between gap-2'>
        <button type='button' className='btn btn-ghost' onClick={onCancel} disabled={scanning}>
          Cancel
        </button>
        <div className='flex gap-2'>
          <button
            type='button'
            className='btn btn-ghost'
            onClick={() => setStep('review')}
            disabled={scanning}
          >
            Enter manually
          </button>
          <button
            type='button'
            className='btn btn-primary'
            onClick={read}
            disabled={scanning || photos.length === 0}
          >
            {scanning ? 'Reading bag…' : 'Read bag'}
          </button>
        </div>
      </div>
    </div>
  );
}
