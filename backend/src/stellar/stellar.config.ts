export const stellarConfig = () => ({
  stellar: {
    horizonUrl:
      process.env.HORIZON_URL ||
      process.env.STELLAR_HORIZON_URL ||
      'https://horizon-testnet.stellar.org',
    networkPassphrase:
      process.env.NETWORK_PASSPHRASE ||
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      'Test SDF Network ; September 2015',
  },
});
