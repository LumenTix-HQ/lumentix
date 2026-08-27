'use client';

interface EscrowBalanceCardProps {
  expected: number;
  actual: number;
  currency?: string;
}

export function EscrowBalanceCard({
  expected,
  actual,
  currency = 'XLM',
}: EscrowBalanceCardProps) {
  const isDeficit = actual < expected;
  const diff = Math.abs(actual - expected);
  const pct = expected > 0 ? Math.round((actual / expected) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Escrow Balance</h3>

      <div className="flex items-end gap-2 mb-1">
        <span
          className={`text-3xl font-bold ${isDeficit ? 'text-red-400' : 'text-green-400'}`}
        >
          {actual.toLocaleString()}
        </span>
        <span className="text-gray-400 text-sm mb-1">{currency}</span>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Expected:{' '}
        <span className="text-gray-300 font-medium">
          {expected.toLocaleString()} {currency}
        </span>
      </p>

      {/* Progress bar */}
      <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            isDeficit ? 'bg-red-500' : 'bg-green-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Escrow funded at ${pct}%`}
        />
      </div>

      <div className="flex justify-between items-center">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isDeficit
              ? 'bg-red-900/50 text-red-300'
              : 'bg-green-900/50 text-green-300'
          }`}
        >
          {isDeficit ? 'Deficit' : 'Fully Funded'}
        </span>
        <span className="text-xs text-gray-500">
          {isDeficit ? `-${diff.toLocaleString()}` : `+${diff.toLocaleString()}`}{' '}
          {currency}
        </span>
      </div>
    </div>
  );
}
