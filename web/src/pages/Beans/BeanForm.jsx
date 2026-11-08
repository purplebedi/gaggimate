import { useState } from 'preact/hooks';
import { EMPTY_BEAN, ROAST_LEVELS } from './beanUtils.js';

const TEXT_FIELDS = [
  ['roaster', 'Roaster'],
  ['origin', 'Origin'],
  ['region', 'Region / farm'],
  ['process', 'Process'],
  ['varietal', 'Varietal'],
];

export function BeanForm({
  initial,
  notice,
  onSave,
  onCancel,
  cancelLabel = 'Cancel',
  hideFinish = false,
  saveDisabled = false,
  saveHint = '',
}) {
  const [bean, setBean] = useState({ ...EMPTY_BEAN, ...initial });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const set = (key, value) => setBean(prev => ({ ...prev, [key]: value }));

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
      {notice}

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
        {!hideFinish && (
          <label className='form-control'>
            <span className='mb-1 block text-sm font-medium'>Bag finish</span>
            <select
              className='select select-bordered w-full'
              value={bean.finish || 'matte'}
              onChange={e => set('finish', e.currentTarget.value)}
            >
              <option value='matte'>Matte</option>
              <option value='glossy'>Glossy</option>
              <option value='kraft'>Kraft paper</option>
            </select>
          </label>
        )}
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
          {cancelLabel}
        </button>
        <button
          type='submit'
          className='btn btn-primary'
          disabled={saving || saveDisabled || !bean.name.trim()}
        >
          {saving ? 'Saving…' : saveHint || 'Save bean'}
        </button>
      </div>
    </form>
  );
}
