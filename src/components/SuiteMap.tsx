import { Suite, SUITE_TYPE_LABEL } from '../types';

interface SuiteMapProps {
  suites: Suite[];
  onSelect?: (suite: Suite) => void;
  selectable?: boolean;
}

const statusConfig = {
  free: {
    label: 'Livre',
    bg: 'bg-green-100 border-green-400',
    hover: 'hover:bg-green-200 cursor-pointer',
    text: 'text-green-800',
  },
  occupied: {
    label: 'Ocupado',
    bg: 'bg-red-100 border-red-400',
    hover: '',
    text: 'text-red-800',
  },
  cleaning: {
    label: 'Limpeza',
    bg: 'bg-yellow-100 border-yellow-400',
    hover: '',
    text: 'text-yellow-800',
  },
  maintenance: {
    label: 'Manutenção',
    bg: 'bg-gray-200 border-gray-400',
    hover: '',
    text: 'text-gray-700',
  },
};

export function SuiteMap({ suites, onSelect, selectable = false }: SuiteMapProps) {
  return (
    <div className="grid grid-cols-4 gap-4 p-4">
      {suites.map((suite) => {
        const cfg = statusConfig[suite.status];
        const canClick = selectable && suite.status === 'free';
        return (
          <button
            key={suite.id}
            onClick={() => canClick && onSelect?.(suite)}
            disabled={!canClick}
            className={`
              border-2 rounded-xl p-4 flex flex-col items-center gap-1
              transition-all duration-150
              ${cfg.bg} ${cfg.text}
              ${canClick ? cfg.hover + ' shadow hover:shadow-md' : 'cursor-default opacity-75'}
            `}
          >
            <span className="text-3xl font-black">{suite.number}</span>
            <span className="text-xs font-semibold uppercase tracking-wide">{SUITE_TYPE_LABEL[suite.type]}</span>
            <span className="text-sm mt-1 font-medium">{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}
