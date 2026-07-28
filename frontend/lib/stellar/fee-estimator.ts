export async function estimateFee(): Promise<string> {
  const res = await fetch('https://horizon-testnet.stellar.org/fee_stats');
  const data = await res.json();
  return data.fee_charged?.p50 ?? '100'; // stroops
}
