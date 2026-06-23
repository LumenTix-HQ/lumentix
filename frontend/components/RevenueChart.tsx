'use client';

interface RevenueDataPoint {
  label: string;
  value: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  currency?: string;
}

export function RevenueChart({ data, currency = 'XLM' }: RevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Revenue</h3>
        <p className="text-gray-500 text-sm text-center py-8">No revenue data available.</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Revenue</h3>

      <div
        className="flex items-end gap-2 h-40"
        role="img"
        aria-label={`Revenue bar chart showing ${data.length} periods`}
      >
        {data.map((point, i) => {
          const heightPct = Math.round((point.value / maxValue) * 100);
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1 flex-1 h-full justify-end"
            >
              <span className="text-xs text-gray-400 hidden sm:block truncate max-w-full text-center">
                {point.value > 0 ? point.value.toLocaleString() : ''}
              </span>
              <div
                className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-t transition-all duration-300 min-h-[4px]"
                style={{ height: `${heightPct}%` }}
                title={`${point.label}: ${point.value.toLocaleString()} ${currency}`}
              />
              <span className="text-xs text-gray-500 truncate max-w-full text-center">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mt-3 text-right">
        Total:{' '}
        <span className="text-gray-300 font-medium">
          {data.reduce((sum, d) => sum + d.value, 0).toLocaleString()} {currency}
        </span>
      </p>
    </div>
  );
}
