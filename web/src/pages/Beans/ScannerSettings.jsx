import { useState } from 'preact/hooks';
import { saveScannerConfig } from '../../services/BeanService.js';

export function ScannerSettings({ apiService, scanner, onSaved }) {
  const [endpoint, setEndpoint] = useState(scanner.endpoint || '');
  const [token, setToken] = useState(scanner.token || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const next = { endpoint: endpoint.trim(), token: token.trim() };
      await saveScannerConfig(apiService, next);
      onSaved(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className='flex flex-col gap-3' data-testid='scanner-form'>
      <p className='text-base-content/70 text-sm'>
        Photo scanning sends the bag photo to your own scanner service. Leave empty to enter beans
        by hand.
      </p>
      <label className='form-control'>
        <span className='mb-1 block text-sm font-medium'>Scanner URL</span>
        <input
          className='input input-bordered w-full'
          type='url'
          placeholder='https://bean-scanner.example.workers.dev/scan'
          value={endpoint}
          onInput={e => setEndpoint(e.currentTarget.value)}
        />
      </label>
      <label className='form-control'>
        <span className='mb-1 block text-sm font-medium'>Token</span>
        <input
          className='input input-bordered w-full'
          type='password'
          autoComplete='off'
          value={token}
          onInput={e => setToken(e.currentTarget.value)}
        />
      </label>
      {error && <div className='text-error text-sm'>{error}</div>}
      <div>
        <button className='btn btn-primary btn-sm' type='submit' disabled={saving}>
          {saving ? 'Saving…' : 'Save scanner settings'}
        </button>
      </div>
    </form>
  );
}
