interface WalletInstallPromptProps {
  onDismiss?: () => void;
}

export default function WalletInstallPrompt({ onDismiss }: WalletInstallPromptProps) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0">🔑</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-yellow-400 text-sm">Freighter wallet not found</p>
        <p className="text-yellow-300/70 text-xs mt-1 leading-relaxed">
          Lumentix requires the Freighter browser extension to connect your Stellar wallet.
        </p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs font-semibold text-yellow-400 underline hover:text-yellow-300 transition-colors"
        >
          Install Freighter →
        </a>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-yellow-500/60 hover:text-yellow-300 text-lg leading-none flex-shrink-0 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}
