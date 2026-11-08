import { useState } from 'preact/hooks';
import { saveScannerConfig } from '../../services/BeanService.js';
import { sanitizeToken, testScanner } from './scannerTest.js';

export function ScannerSettings({ apiService, scanner, onSaved }) {
  const [endpoint, setEndpoint] = useState(scanner.endpoint || '');
  const [token, setToken] = useState(scanner.token || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState([]);
  const [cleaned, setCleaned] = useState('');

  const save = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const clean = sanitizeToken(token);
      const next = { endpoint: endpoint.trim(), token: clean };
      setToken(clean);
      await saveScannerConfig(apiService, next);
      onSaved(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const clean = sanitizeToken(token);
    setCleaned(
      clean !== token.trim()
        ? 'Tidied the pasted token (removed "SCANNER_TOKEN=", quotes or spaces).'
        : '',
    );
    setToken(clean);
    setTesting(true);
    setResults([]);
    try {
      setResults(await testScanner({ endpoint: endpoint.trim(), token: clean }));
    } finally {
      setTesting(false);
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
          type={showToken ? 'text' : 'password'}
          name='scanner-token'
          autoComplete='new-password' // stops Chrome autofilling a saved password here
          spellCheck={false}
          value={token}
          onInput={e => setToken(e.currentTarget.value)}
        />
      </label>
      <label className='flex items-center gap-2 text-xs'>
        <input
          type='checkbox'
          className='checkbox checkbox-xs'
          checked={showToken}
          onChange={e => setShowToken(e.currentTarget.checked)}
        />
        Show token
      </label>
      {error && <div className='text-error text-sm'>{error}</div>}
      <div className='flex flex-wrap gap-2'>
        <button className='btn btn-primary btn-sm' type='submit' disabled={saving}>
          {saving ? 'Saving…' : 'Save scanner settings'}
        </button>
        <button
          className='btn btn-outline btn-sm'
          type='button'
          onClick={test}
          disabled={testing || !endpoint.trim()}
          data-testid='scanner-test'
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {cleaned && <div className='text-info text-sm'>{cleaned}</div>}
      {results.length > 0 && (
        <ul className='flex flex-col gap-1 text-sm' data-testid='scanner-test-results'>
          {results.map(r => (
            <li key={r.text} className={r.ok ? 'text-success' : 'text-error'}>
              {r.ok ? '✓' : '✗'} {r.text}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
