interface BigButtonProps {
  label: string;
  onClick: () => void;
  color?: 'green' | 'blue' | 'red' | 'yellow' | 'gray';
  disabled?: boolean;
  icon?: string;
}

const colorMap = {
  green: 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white',
  blue: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
  red: 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white',
  yellow: 'bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900',
  gray: 'bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white',
};

export function BigButton({ label, onClick, color = 'blue', disabled = false, icon }: BigButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-2
        w-full h-full rounded-2xl overflow-hidden
        font-bold text-xl leading-tight px-4 text-center shadow-lg
        transition-all duration-150 select-none
        ${colorMap[color]}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {icon && <span className="text-4xl leading-none">{icon}</span>}
      <span className="text-balance w-full">{label}</span>
    </button>
  );
}
