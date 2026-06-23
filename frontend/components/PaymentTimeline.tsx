'use client';

interface TimelineStep {
  label: string;
  description: string;
  completed: boolean;
  active: boolean;
}

interface PaymentTimelineProps {
  status: string;
}

const STATUS_STEPS: Record<string, TimelineStep[]> = {
  CONFIRMED: [
    { label: 'Initiated', description: 'Payment transaction created', completed: true, active: false },
    { label: 'Broadcast', description: 'Transaction sent to Stellar network', completed: true, active: false },
    { label: 'Confirmed', description: 'Transaction confirmed on ledger', completed: true, active: false },
    { label: 'Ticket Issued', description: 'Ticket generated and available', completed: true, active: false },
  ],
  PENDING: [
    { label: 'Initiated', description: 'Payment transaction created', completed: true, active: false },
    { label: 'Broadcast', description: 'Transaction sent to Stellar network', completed: true, active: true },
    { label: 'Confirmed', description: 'Awaiting ledger confirmation', completed: false, active: false },
    { label: 'Ticket Issued', description: 'Ticket will be issued after confirmation', completed: false, active: false },
  ],
  REFUNDED: [
    { label: 'Original Payment', description: 'Payment was processed', completed: true, active: false },
    { label: 'Refund Initiated', description: 'Refund transaction created', completed: true, active: false },
    { label: 'Refund Broadcast', description: 'Refund sent to Stellar network', completed: true, active: false },
    { label: 'Refund Complete', description: 'Funds returned to your wallet', completed: true, active: false },
  ],
  FAILED: [
    { label: 'Initiated', description: 'Payment transaction created', completed: true, active: false },
    { label: 'Broadcast', description: 'Transaction sent to Stellar network', completed: true, active: false },
    { label: 'Failed', description: 'Transaction failed to process', completed: false, active: true },
    { label: 'Ticket Issued', description: 'No ticket issued', completed: false, active: false },
  ],
};

export default function PaymentTimeline({ status }: PaymentTimelineProps) {
  const steps = STATUS_STEPS[status] || STATUS_STEPS.PENDING;

  return (
    <div className="py-2">
      <div className="relative">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-start gap-3 pb-4 last:pb-0">
            {/* Connector line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  step.completed
                    ? 'bg-green-500 border-green-500'
                    : step.active
                      ? 'bg-indigo-500 border-indigo-500 animate-pulse'
                      : 'bg-gray-200 border-gray-300'
                }`}
              />
              {index < steps.length - 1 && (
                <div
                  className={`w-0.5 h-8 ${
                    step.completed ? 'bg-green-300' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  step.completed
                    ? 'text-green-700'
                    : step.active
                      ? 'text-indigo-700'
                      : 'text-gray-500'
                }`}
              >
                {step.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
            </div>

            {step.completed && (
              <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
