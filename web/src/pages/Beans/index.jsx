import { useCallback, useContext, useEffect, useRef, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear';
import { ApiServiceContext, machine } from '../../services/ApiService.js';
import { deleteBean, listBeans, saveBean, setActiveBean } from '../../services/BeanService.js';
import PageLayout from '../../components/PageLayout.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Card from '../../components/Card.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { AddBean } from './AddBean.jsx';
import { BeanForm } from './BeanForm.jsx';
import { BeanDetail } from './BeanDetail.jsx';
import { ScannerSettings } from './ScannerSettings.jsx';
import { beanTitle, daysOffRoast } from './beanUtils.js';

const connected = computed(() => machine.value.connected);

function Modal({ children, onClose, label }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className='modal modal-open z-[10000]' role='dialog' aria-label={label}>
      <div className='modal-box max-h-[90vh] max-w-2xl overflow-y-auto'>{children}</div>
      <div className='modal-backdrop' onClick={onClose} />
    </div>
  );
}

export function Beans() {
  const apiService = useContext(ApiServiceContext);
  const [state, setState] = useState({ beans: [], activeBeanId: '', scanner: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // {type:'add'|'edit'|'detail'|'scanner', bean?}
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState([]); // [{file, url}] for the add-bean flow
  const fileRef = useRef(null);

  const clearPhotos = useCallback(() => {
    setPhotos(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.url));
      return [];
    });
  }, []);

  const onFiles = e => {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    setPhotos(prev =>
      [...prev, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, 4),
    );
  };

  const removePhoto = i =>
    setPhotos(prev => {
      URL.revokeObjectURL(prev[i]?.url);
      return prev.filter((_, idx) => idx !== i);
    });

  // Must run inside the tap handler: browsers only open the camera from a user gesture.
  const startAdd = () => {
    clearPhotos();
    setModal({ type: 'add' });
    if (state.scanner?.endpoint) fileRef.current?.click();
  };

  const load = useCallback(async () => {
    try {
      setError('');
      setState(await listBeans(apiService));
    } catch (err) {
      setError(err.message || 'Failed to load beans');
    } finally {
      setLoading(false);
    }
  }, [apiService]);

  useEffect(() => {
    if (connected.value) load();
  }, [connected.value, load]);

  const run = async fn => {
    try {
      setError('');
      await fn();
      await load();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
  };

  const close = () => {
    clearPhotos();
    setModal(null);
  };
  const needle = query.trim().toLowerCase();
  const visible = state.beans
    .filter(b => !needle || `${b.name} ${b.roaster} ${b.origin}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const current = modal?.bean && state.beans.find(b => b.id === modal.bean.id);

  return (
    <PageLayout>
      <PageHeader
        title='Beans'
        actions={
          <>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => setModal({ type: 'scanner' })}
              aria-label='Scanner settings'
            >
              <FontAwesomeIcon icon={faGear} />
              Scanner
            </button>
            <button className='btn btn-primary btn-sm' onClick={startAdd}>
              <FontAwesomeIcon icon={faPlus} />
              Add bean
            </button>
          </>
        }
      />

      {error && (
        <div className='alert alert-error' role='alert'>
          {error}
        </div>
      )}

      {!connected.value ? (
        <Card>
          <p>Waiting for the machine to connect…</p>
        </Card>
      ) : loading ? (
        <div className='flex justify-center py-16'>
          <Spinner size={8} />
        </div>
      ) : state.beans.length === 0 ? (
        <Card>
          <div className='flex flex-col items-center gap-3 py-8 text-center'>
            <div className='text-lg font-semibold'>No beans yet</div>
            <p className='text-base-content/70 max-w-md text-sm'>
              Add the bag you are using, set it as active, and every shot you pull will be tagged
              with it so you can see how each coffee rates.
            </p>
            <button className='btn btn-primary' onClick={startAdd}>
              Add your first bean
            </button>
          </div>
        </Card>
      ) : (
        <>
          {state.beans.length > 6 && (
            <input
              className='input input-bordered w-full max-w-sm'
              placeholder='Search beans'
              aria-label='Search beans'
              value={query}
              onInput={e => setQuery(e.currentTarget.value)}
            />
          )}
          <div
            className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
            data-testid='bean-grid'
          >
            {visible.map(bean => {
              const age = daysOffRoast(bean.roastDate);
              const active = bean.id === state.activeBeanId;
              return (
                <button
                  key={bean.id}
                  className={`card bg-base-100 border-2 text-left shadow-xl transition hover:shadow-2xl ${active ? 'border-success' : 'border-transparent'}`}
                  onClick={() => setModal({ type: 'detail', bean })}
                  data-testid='bean-card'
                >
                  <div className='card-body gap-1 p-4'>
                    <div className='flex items-start justify-between gap-2'>
                      <h2 className='card-title text-base'>{beanTitle(bean)}</h2>
                      {active && <span className='badge badge-success badge-sm'>Active</span>}
                    </div>
                    <div className='text-base-content/70 text-sm'>
                      {[bean.origin, bean.process].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className='text-base-content/60 text-xs'>
                      {[bean.roastLevel, age !== null && `${age}d off roast`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className='text-base-content/60 col-span-full text-sm'>No matching beans.</div>
            )}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type='file'
        accept='image/*'
        capture='environment'
        multiple
        className='hidden'
        data-testid='photo-input'
        onChange={onFiles}
      />
      {modal?.type === 'add' && (
        <Modal onClose={close} label='Add bean'>
          <AddBean
            scanner={state.scanner}
            photos={photos}
            onPickPhoto={() => fileRef.current?.click()}
            onRemovePhoto={removePhoto}
            onCancel={close}
            onSave={async bean => {
              const saved = await saveBean(apiService, bean);
              if (!state.activeBeanId) await setActiveBean(apiService, saved.id);
              await load();
              close();
            }}
          />
        </Modal>
      )}
      {modal?.type === 'edit' && current && (
        <Modal onClose={close} label='Edit bean'>
          <h2 className='mb-4 text-xl font-bold'>Edit bean</h2>
          <BeanForm
            initial={current}
            onCancel={() => setModal({ type: 'detail', bean: current })}
            onSave={async bean => {
              await saveBean(apiService, bean);
              await load();
              setModal({ type: 'detail', bean });
            }}
          />
        </Modal>
      )}
      {modal?.type === 'detail' && current && (
        <Modal onClose={close} label='Bean details'>
          <BeanDetail
            apiService={apiService}
            bean={current}
            isActive={current.id === state.activeBeanId}
            onClose={close}
            onEdit={() => setModal({ type: 'edit', bean: current })}
            onSetActive={() => run(() => setActiveBean(apiService, current.id))}
            onDelete={() =>
              run(async () => {
                await deleteBean(apiService, current.id);
                close();
              })
            }
          />
        </Modal>
      )}
      {modal?.type === 'scanner' && (
        <Modal onClose={close} label='Scanner settings'>
          <h2 className='mb-4 text-xl font-bold'>Scanner settings</h2>
          <ScannerSettings
            apiService={apiService}
            scanner={state.scanner}
            onSaved={scanner => {
              setState(prev => ({ ...prev, scanner }));
              close();
            }}
          />
        </Modal>
      )}
    </PageLayout>
  );
}
