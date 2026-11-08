import { useRef, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera';
import { scanPhoto } from '../../services/BeanService.js';
import { EMPTY_BEAN, ROAST_LEVELS, applyScan } from './beanUtils.js';

const TEXT_FIELDS = [
  ['roaster', 'Roaster'],
  ['origin', 'Origin'],
  ['region', 'Region / farm'],
  ['process', 'Process'],
  ['varietal', 'Varietal'],
];

export function BeanForm({ initial, scanner, onSave, onCancel }) {
  const [bean, setBean] = useState({ ...EMPTY_BEAN, ...initial });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanned, setScanned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef(null);
  const canScan = !!scanner?.endpoint;

  const set = (key, value) => setBean(prev => ({ ...prev, [key]: value }));

  const onPhoto = async e => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setScanning(true);
    setScanError('');
    try {
      const result = await scanPhoto(scanner, file);
      setBean(prev => applyScan(prev, result));
      setScanned(true);
    } catch (err) {
      setScanError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const submit = async e => {
    e.preventDefault();
    if (!bean.name.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({ ...bean, name: bean.name.trim() });
    } catch (err) {
      setSaveError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className='flex flex-col gap-4' data-testid='bean-form'>
      <div className='flex flex-col gap-2'>
        <input
          ref={fileRef}
          type='file'
          accept='image/*'
          capture='environment'
          className='hidden'
          data-testid='photo-input'
          onChange={onPhoto}
        />
        <button
          type='button'
          className='btn btn-outline'
          disabled={!canScan || scanning}
          onClick={() => fileRef.current?.click()}
        >
          <FontAwesomeIcon icon={faCamera} />
          {scanning ? 'Reading bag…' : 'Scan bag with camera'}
        </button>
        {!canScan && (
          <span className='text-base-content/60 text-xs'>
            Set up the scanner (button above the list) to fill details from a photo.
          </span>
        )}
        {scanError && (
          <div className='text-error text-sm' role='alert'>
            {scanError}
          </div>
        )}
        {scanned && (
          <div className='text-success text-sm'>Filled from photo — check the details below.</div>
        )}
      </div>

      <label className='form-control'>
        <span className='mb-1 block text-sm font-medium'>Name *</span>
        <input
          className='input input-bordered w-full'
          required
          maxLength={80}
          value={bean.name}
          onInput={e => set('name', e.currentTarget.value)}
          placeholder='e.g. Ethiopia Guji'
        />
      </label>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        {TEXT_FIELDS.map(([key, label]) => (
          <label className='form-control' key={key}>
            <span className='mb-1 block text-sm font-medium'>{label}</span>
            <input
              className='input input-bordered w-full'
              maxLength={80}
              value={bean[key]}
              onInput={e => set(key, e.currentTarget.value)}
            />
          </label>
        ))}
        <label className='form-control'>
          <span className='mb-1 block text-sm font-medium'>Roast level</span>
          <select
            className='select select-bordered w-full'
            value={bean.roastLevel}
            onChange={e => set('roastLevel', e.currentTarget.value)}
          >
            <option value=''>—</option>
            {ROAST_LEVELS.map(l => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className='form-control'>
          <span className='mb-1 block text-sm font-medium'>Roast date</span>
          <input
            className='input input-bordered w-full'
            type='date'
            value={bean.roastDate}
            onInput={e => set('roastDate', e.currentTarget.value)}
          />
        </label>
      </div>

      <label className='form-control'>
        <span className='mb-1 block text-sm font-medium'>Tasting notes</span>
        <textarea
          className='textarea textarea-bordered w-full'
          rows='2'
          maxLength={200}
          value={bean.tastingNotes}
          onInput={e => set('tastingNotes', e.currentTarget.value)}
        />
      </label>

      {saveError && (
        <div className='text-error text-sm' role='alert'>
          {saveError}
        </div>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost' onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type='submit' className='btn btn-primary' disabled={saving || !bean.name.trim()}>
          {saving ? 'Saving…' : 'Save bean'}
        </button>
      </div>
    </form>
  );
}
