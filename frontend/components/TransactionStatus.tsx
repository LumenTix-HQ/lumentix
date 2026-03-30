"use client";

export interface TransactionStatusProps {
  status: "pending" | "success" | "error" | "processing";
  message?: string;
  transactionId?: string;
  onRetry?: () => void;
  onViewDetails?: (transactionId: string) => void;
}

export default function TransactionStatus({
  status,
  message,
  transactionId,
  onRetry,
  onViewDetails,
}: TransactionStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case "pending":
      case "processing":
        return (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        );
      case "success":
        return (
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "error":
        return (
          <svg
            className="w-6 h-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "pending":
      case "processing":
        return "bg-blue-50 border-blue-200 text-blue-700";
      case "success":
        return "bg-green-50 border-green-200 text-green-700";
      case "error":
        return "bg-red-50 border-red-200 text-red-700";
      default:
        return "bg-gray-50 border-gray-200 text-gray-700";
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">{getStatusIcon()}</div>
        <div className="flex-1">
          <h4 className="font-medium capitalize">
            {status === "pending" && "Transaction Pending"}
            {status === "processing" && "Processing Transaction"}
            {status === "success" && "Transaction Successful"}
            {status === "error" && "Transaction Failed"}
          </h4>

          {message && <p className="text-sm mt-1 opacity-90">{message}</p>}

          {transactionId && status === "success" && (
            <div className="mt-3">
              <p className="text-xs font-medium mb-1">Transaction ID:</p>
              <div className="bg-white/50 rounded p-2">
                <code className="text-xs break-all">{transactionId}</code>
              </div>
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={() => onViewDetails?.(transactionId)}
                  className="text-xs underline hover:no-underline"
                >
                  View on Explorer
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(transactionId)}
                  className="text-xs underline hover:no-underline"
                >
                  Copy ID
                </button>
              </div>
            </div>
          )}

          {status === "error" && onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 text-sm underline hover:no-underline"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
