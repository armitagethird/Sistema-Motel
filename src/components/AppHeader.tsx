interface AppHeaderProps {
  userName: string;
  occupiedCount: number;
  freeCount: number;
  onLogout: () => void;
}

const MOTEL_ADDRESS = 'Rua Celso Magalhães 02, Felipinho, São Luís - MA';
const MOTEL_PHONE = '(98) 98862-1245';

export function AppHeader({ userName, occupiedCount, freeCount, onLogout }: AppHeaderProps) {
  return (
    <header className="bg-gray-900 text-white px-8 py-4 flex items-center justify-between border-b border-gray-700 shrink-0">
      {/* Identidade do motel */}
      <div className="flex items-center gap-4">
        <img
          src="/logo.jpg"
          alt="Paraíso Motel"
          className="h-14 w-14 rounded-xl object-cover shrink-0"
        />
        <div>
          <h1 className="text-2xl font-black leading-tight">Paraíso Motel</h1>
          <p className="text-gray-400 text-xs">{MOTEL_ADDRESS}</p>
          <p className="text-gray-400 text-xs">{MOTEL_PHONE}</p>
        </div>
      </div>

      {/* Status de suítes + usuário */}
      <div className="flex items-center gap-6">
        <span className="text-gray-400 text-sm">
          {occupiedCount} ocupadas · {freeCount} livres
        </span>
        <span className="text-gray-300 text-lg">{userName}</span>
        <button
          onClick={onLogout}
          className="text-gray-400 hover:text-white text-sm underline"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
