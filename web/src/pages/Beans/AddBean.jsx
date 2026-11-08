import { useEffect, useRef, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { resizePhoto, scanPhotos } from '../../services/BeanService.js';
import uuidv4 from '../../utils/uuid.js';
import { buildBagImages } from './makeBag.js';
import { requestRender } from './renderClient.js';
import { BeanForm } from './BeanForm.jsx';
import { EMPTY_BEAN, applyScan } from './beanUtils.js';

const MAX_PHOTOS = 4;
const PHOTO_LABELS = ['Front', 'Back', 'Side', 'Extra'];
const FINISHES = [
  ['matte', 'Matte'],
  ['glossy', 'Glossy'],
  ['kraft', 'Kraft paper'],
];

function PhotoPicker({ label, photos, value, onChange, noneLabel }) {
  return (
    <div className='flex flex-wrap items-center gap-2' role='group' aria-label={`${label} photo`}>
      <span className='w-12 text-xs font-medium'>{label}</span>
      {photos.map((p, i) => (
        <button
          key={p.url}
          type='button'
          aria-label={`Use photo ${i + 1} as ${label.toLowerCase()}`}
          aria-pressed={value === i}
          onClick={() => onChange(i)}
          className={`h-11 w-11 overflow-hidden rounded-md ring-2 ${value === i ? 'ring-primary' : 'opacity-60 ring-transparent'}`}
        >
          <img src={p.url} alt='' className='h-full w-full object-cover' />
        </button>
      ))}
      <button
        type='button'
        aria-pressed={value === -1}
        onClick={() => onChange(-1)}
        className={`btn btn-xs h-11 rounded-md ${value === -1 ? 'btn-primary' : 'btn-outline'}`}
      >
        {noneLabel}
      </button>
    </div>
  );
}

/**
 * Add-bean flow: take photos (front, back, ...) -> read them -> review/edit the filled-in fields and the flattened
 * bag textures -> save. Without a configured scanner it is just the form (photos can still be used as the bag).
 *
 * Photos are owned by the page (it opens the camera from the tap on "Add bean", which browsers only allow inside a
 * user gesture).
 */
export function AddBean({ scanner, photos, onPickPhoto, onRemovePhoto, onSave, onCancel }) {
  const canScan = !!scanner?.endpoint;
  const [step, setStep] = useState(canScan ? 'capture' : 'review');
  const [bean, setBean] = useState(EMPTY_BEAN);
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [id] = useState(() => uuidv4());
  const [meta, setMeta] = useState([]); // per photo: { quad, complete } from the scanner
  const [frontIdx, setFrontIdx] = useState(0);
  const [backIdx, setBackIdx] = useState(-1);
  const [finish, setFinish] = useState('matte');
  const [built, setBuilt] = useState(null); // { aspect, color, front:{blob,url}, back }
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [wantRender, setWantRender] = useState(true);
  const [render, setRender] = useState({
    status: 'idle',
    front: '',
    back: '',
    error: '',
    stale: false,
  });
  const renderAbort = useRef(null);
  const renderKey = useRef('');
  const urlsRef = useRef([]);

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
      setMeta(photos.map((_, i) => info.find(p => p.index === i + 1) || null));
      const front = info.find(p => p.role === 'front');
      const back = info.find(p => p.role === 'back' && p !== front);
      const fi = front ? front.index - 1 : 0;
      setFrontIdx(fi);
      setBackIdx(back ? back.index - 1 : photos.length > 1 ? (fi === 0 ? 1 : 0) : -1);
      if (['matte', 'glossy', 'kraft'].includes(result?.finish)) setFinish(result.finish);
      setScanned(true);
      setStep('review');
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // manual entry with photos taken: front = first, back = second
  const enterManually = () => {
    if (!scanned) {
      setFrontIdx(photos.length > 0 ? 0 : -1);
      setBackIdx(photos.length > 1 ? 1 : -1);
    }
    setStep('review');
  };

  // flatten + wrap: rebuild the two textures whenever the chosen photos change
  useEffect(() => {
    if (step !== 'review') return undefined;
    let cancelled = false;
    const f = frontIdx >= 0 ? photos[frontIdx] : null;
    if (!f) {
      setBuilt(null);
      return undefined;
    }
    const b = backIdx >= 0 && backIdx !== frontIdx ? photos[backIdx] : null;
    setBuilding(true);
    setBuildError('');
    buildBagImages({
      front: { file: f.file, quad: meta[frontIdx]?.quad || null },
      back: b
        ? { file: b.file, quad: meta[backIdx]?.quad || null, complete: meta[backIdx]?.complete }
        : null,
    })
      .then(r => {
        if (cancelled) return;
        urlsRef.current.forEach(u => URL.revokeObjectURL(u));
        urlsRef.current = [r.front.url, r.back?.url].filter(Boolean);
        setBuilt(r);
      })
      .catch(err => !cancelled && (setBuilt(null), setBuildError(err.message)))
      .finally(() => !cancelled && setBuilding(false));
    return () => {
      cancelled = true;
    };
  }, [step, frontIdx, backIdx, photos, meta]);
  useEffect(() => () => urlsRef.current.forEach(u => URL.revokeObjectURL(u)), []);

  // AI illustration: the ORIGINAL photos (not the flattened ones) go to the image model with the playground prompt; it
  // returns a Pixar-style, face-on illustration of each side. Starts by itself after a scan.
  const startRender = async () => {
    if (frontIdx < 0) return;
    renderAbort.current?.abort();
    const ctrl = new AbortController();
    renderAbort.current = ctrl;
    renderKey.current = `${frontIdx}|${backIdx}`;
    setRender({ status: 'running', front: '', back: '', error: '', stale: false });
    try {
      const f = photos[frontIdx];
      const b = backIdx >= 0 && backIdx !== frontIdx ? photos[backIdx] : null;
      const [front, back] = await Promise.all([
        resizePhoto(f.file),
        b ? resizePhoto(b.file) : null,
      ]);
      const result = await requestRender(scanner, { front, back, signal: ctrl.signal });
      if (!ctrl.signal.aborted)
        setRender({
          status: 'done',
          front: result.front,
          back: result.back || '',
          error: '',
          backError: result.backError || '',
          stale: false,
        });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setRender({
        status: 'error',
        front: '',
        back: '',
        error: err.message || 'Render failed',
        stale: false,
      });
    }
  };
  // kick it off once the photos are chosen after a scan
  useEffect(() => {
    if (
      step === 'review' &&
      scanned &&
      canScan &&
      wantRender &&
      frontIdx >= 0 &&
      render.status === 'idle'
    )
      startRender();
  }, [step, scanned, wantRender, frontIdx]);
  // changing which photo is front/back after a render makes it out of date (never re-spend automatically)
  useEffect(() => {
    if (render.status === 'done' && renderKey.current !== `${frontIdx}|${backIdx}`)
      setRender(r => (r.stale ? r : { ...r, stale: true }));
  }, [frontIdx, backIdx, render.status]);
  useEffect(() => () => renderAbort.current?.abort(), []);
  const skipRender = () => {
    renderAbort.current?.abort();
    setWantRender(false);
    setRender({ status: 'idle', front: '', back: '', error: '', stale: false });
  };

  const save = form =>
    onSave(
      {
        ...form,
        id,
        createdAt: Math.floor(Date.now() / 1000),
        finish,
        ...(built ? { ar: built.aspect, color: built.color } : {}),
        ...(render.status === 'done' && !render.stale
          ? { artFront: render.front, ...(render.back ? { artBack: render.back } : {}) }
          : {}),
      },
      built,
    );

  if (step === 'review') {
    return (
      <>
        <h2 className='mb-4 text-xl font-bold'>{scanned ? 'Check the details' : 'Add bean'}</h2>
        <BeanForm
          key={scanned ? 'scanned' : 'manual'}
          initial={bean}
          hideFinish
          saveDisabled={render.status === 'running'}
          saveHint={render.status === 'running' ? 'Waiting for the studio render…' : ''}
          notice={
            <>
              {scanned && (
                <div className='text-success text-sm' data-testid='scan-notice'>
                  Filled in from your photos. Fix anything that looks wrong before saving.
                </div>
              )}
              {photos.length > 0 && (
                <div className='flex flex-col gap-3' data-testid='bag-builder'>
                  <div className='text-sm font-medium'>3D bag</div>
                  <div className='flex flex-wrap items-start gap-4'>
                    <div className='flex gap-3'>
                      {[
                        ['Front', built?.front],
                        ['Back', built?.back],
                      ].map(([label, img]) => (
                        <div key={label} className='flex flex-col items-center gap-1'>
                          <div className='bg-base-200 flex h-32 w-24 items-center justify-center overflow-hidden rounded-md'>
                            {img ? (
                              <img
                                src={img.url}
                                alt={`${label} texture`}
                                data-testid={`tex-${label.toLowerCase()}`}
                                className='h-full w-full object-contain'
                              />
                            ) : (
                              <span className='text-base-content/50 px-1 text-center text-[0.65rem]'>
                                {building
                                  ? 'Flattening…'
                                  : label === 'Back'
                                    ? 'Plain back'
                                    : 'Generated'}
                              </span>
                            )}
                          </div>
                          <span className='text-base-content/60 text-xs'>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className='flex min-w-0 flex-1 flex-col gap-2'>
                      <PhotoPicker
                        label='Front'
                        photos={photos}
                        value={frontIdx}
                        onChange={setFrontIdx}
                        noneLabel='None'
                      />
                      <PhotoPicker
                        label='Back'
                        photos={photos}
                        value={backIdx}
                        onChange={setBackIdx}
                        noneLabel='None'
                      />
                      <label className='flex items-center gap-2 text-xs'>
                        <span className='w-12 font-medium'>Finish</span>
                        <select
                          className='select select-bordered select-xs'
                          value={finish}
                          onChange={e => setFinish(e.currentTarget.value)}
                          aria-label='Bag finish'
                        >
                          {FINISHES.map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  {buildError && (
                    <div className='text-error text-sm' role='alert'>
                      Couldn't flatten that photo ({buildError}). Pick another or save without it.
                    </div>
                  )}
                  {canScan && (
                    <div
                      className='bg-base-200 flex flex-col gap-2 rounded-lg p-3'
                      data-testid='render-box'
                    >
                      <label className='flex items-center gap-2 text-sm font-medium'>
                        <input
                          type='checkbox'
                          className='checkbox checkbox-sm'
                          checked={wantRender}
                          disabled={render.status === 'running'}
                          onChange={e => {
                            setWantRender(e.currentTarget.checked);
                            if (!e.currentTarget.checked)
                              setRender({
                                status: 'idle',
                                front: '',
                                back: '',
                                error: '',
                                stale: false,
                              });
                          }}
                        />
                        AI illustration
                      </label>
                      {wantRender && render.status === 'idle' && frontIdx < 0 && (
                        <span className='text-base-content/60 text-xs'>
                          Pick a front photo to illustrate.
                        </span>
                      )}
                      {wantRender && render.status === 'idle' && frontIdx >= 0 && (
                        <button
                          type='button'
                          className='btn btn-sm btn-outline self-start'
                          onClick={startRender}
                        >
                          Create illustration
                        </button>
                      )}
                      {render.status === 'running' && (
                        <div
                          className='flex items-center gap-2 text-sm'
                          role='status'
                          data-testid='render-running'
                        >
                          <span className='loading loading-spinner loading-sm' />
                          <span>Illustrating your bag in Pixar style… usually 20–60 s</span>
                          <button
                            type='button'
                            className='btn btn-ghost btn-xs'
                            onClick={skipRender}
                          >
                            Skip
                          </button>
                        </div>
                      )}
                      {render.status === 'done' && (
                        <div className='flex items-start gap-3'>
                          <div className='flex gap-2'>
                            {[
                              ['front', render.front],
                              ['back', render.back],
                            ].map(([side, src]) => (
                              <div key={side} className='flex flex-col items-center gap-1'>
                                <div className='bg-base-300 flex h-28 w-24 items-center justify-center rounded-md'>
                                  {src ? (
                                    <img
                                      src={src}
                                      alt={`Illustrated ${side}`}
                                      data-testid={`render-${side}`}
                                      crossOrigin='anonymous'
                                      className='h-full w-full object-contain'
                                    />
                                  ) : (
                                    <span className='text-base-content/50 px-1 text-center text-[0.65rem]'>
                                      {side === 'back' ? 'No back illustration' : ''}
                                    </span>
                                  )}
                                </div>
                                <span className='text-base-content/60 text-xs'>{side}</span>
                              </div>
                            ))}
                          </div>
                          <div className='flex flex-col gap-1 text-sm'>
                            <span className={render.stale ? 'text-warning' : 'text-success'}>
                              {render.stale
                                ? 'Photos changed since this illustration.'
                                : 'Illustration ready — this is what the shelf will show.'}
                            </span>
                            {render.backError && (
                              <span className='text-warning text-xs'>Back: {render.backError}</span>
                            )}
                            <button
                              type='button'
                              className='btn btn-xs btn-outline self-start'
                              onClick={startRender}
                            >
                              {render.stale ? 'Re-illustrate' : 'Illustrate again'}
                            </button>
                          </div>
                        </div>
                      )}
                      {render.status === 'error' && (
                        <div
                          className='flex flex-col gap-1 text-sm'
                          role='alert'
                          data-testid='render-error'
                        >
                          <span className='text-error'>
                            Couldn't make the illustration: {render.error}
                          </span>
                          <span className='text-base-content/60 text-xs'>
                            The shelf will use the 3D bag built from your photos instead.
                          </span>
                          <button
                            type='button'
                            className='btn btn-xs btn-outline self-start'
                            onClick={startRender}
                          >
                            Try again
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
          : 'Add the back too — both sides get wrapped onto your 3D bag — then read the bag.'}
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
            onClick={enterManually}
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
