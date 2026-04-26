import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { useAppStore } from './store';
import { logAction } from './logger';

const TAURI_RUNNING =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getCurrentVersion(): Promise<string> {
  if (!TAURI_RUNNING) return '0.0.0-dev';
  try {
    return await getVersion();
  } catch {
    return '0.0.0-dev';
  }
}

export async function checkForUpdate(): Promise<void> {
  const setUpdateStatus = useAppStore.getState().setUpdateStatus;
  const currentVersion = await getCurrentVersion();
  const checkedAt = () => new Date().toISOString();

  if (!TAURI_RUNNING) {
    setUpdateStatus({
      state: 'up_to_date',
      currentVersion,
      checkedAt: checkedAt(),
    });
    return;
  }

  setUpdateStatus({ state: 'checking' });

  try {
    const update = await check();

    if (update) {
      setUpdateStatus({
        state: 'available',
        version: update.version,
        notes: update.body,
        checkedAt: checkedAt(),
      });
      logAction('update_check', {
        result: 'available',
        current_version: currentVersion,
        available_version: update.version,
      });
    } else {
      setUpdateStatus({
        state: 'up_to_date',
        currentVersion,
        checkedAt: checkedAt(),
      });
      logAction('update_check', {
        result: 'up_to_date',
        current_version: currentVersion,
      });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    setUpdateStatus({ state: 'error', error, checkedAt: checkedAt() });
    logAction('update_check', {
      result: 'error',
      current_version: currentVersion,
      error,
    });
  }
}

export async function downloadAndInstall(): Promise<void> {
  if (!TAURI_RUNNING) {
    throw new Error('Atualização só funciona no app instalado');
  }

  const setUpdateStatus = useAppStore.getState().setUpdateStatus;
  const currentVersion = await getCurrentVersion();

  const update = await check();
  if (!update) {
    setUpdateStatus({
      state: 'up_to_date',
      currentVersion,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  let downloaded = 0;
  let total = 0;

  setUpdateStatus({
    state: 'downloading',
    version: update.version,
    downloaded,
    total,
  });

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0;
        setUpdateStatus({
          state: 'downloading',
          version: update.version,
          downloaded: 0,
          total,
        });
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        setUpdateStatus({
          state: 'downloading',
          version: update.version,
          downloaded,
          total,
        });
        break;
      case 'Finished':
        setUpdateStatus({ state: 'installing', version: update.version });
        break;
    }
  });

  logAction('update_install', {
    from_version: currentVersion,
    to_version: update.version,
  });

  await relaunch();
}
