import { useAppStore } from '../lib/store';

const statusConfig = {
  online: { label: 'Online', dot: 'bg-green-500', text: 'text-green-700' },
  offline: { label: 'Offline', dot: 'bg-red-500', text: 'text-red-600' },
  syncing: { label: 'Sincronizando...', dot: 'bg-yellow-400', text: 'text-yellow-700' },
};

export function StatusBar() {
  const status = useAppStore((s) => s.connStatus);
  const profile = useAppStore((s) => s.profile);
  const cfg = statusConfig[status];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between text-sm z-40">
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
        <span className={`font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>
      {profile && (
        <span className="text-gray-500">
          {profile.name} &mdash; {profile.role}
        </span>
      )}
    </div>
  );
}
