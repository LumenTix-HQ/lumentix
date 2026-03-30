import { HealthCheckError } from '@nestjs/terminus';
import { StellarHealthIndicator } from './stellar.health';
import { StellarService } from '../stellar/stellar.service';

describe('StellarHealthIndicator', () => {
  const originalNetwork = process.env.STELLAR_NETWORK;
  let stellarService: { checkConnectivity: jest.Mock };
  let indicator: StellarHealthIndicator;

  beforeEach(() => {
    stellarService = {
      checkConnectivity: jest.fn(),
    };
    indicator = new StellarHealthIndicator(
      stellarService as unknown as StellarService,
    );
  });

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.STELLAR_NETWORK;
    } else {
      process.env.STELLAR_NETWORK = originalNetwork;
    }
  });

  it('returns up status with the configured network', async () => {
    process.env.STELLAR_NETWORK = 'mainnet';
    stellarService.checkConnectivity.mockResolvedValue(undefined);

    await expect(indicator.isHealthy('stellar')).resolves.toEqual({
      stellar: {
        status: 'up',
        network: 'mainnet',
      },
    });
  });

  it('defaults the network to testnet when env is missing', async () => {
    delete process.env.STELLAR_NETWORK;
    stellarService.checkConnectivity.mockResolvedValue(undefined);

    await expect(indicator.isHealthy('stellar')).resolves.toEqual({
      stellar: {
        status: 'up',
        network: 'testnet',
      },
    });
  });

  it('throws HealthCheckError when connectivity fails', async () => {
    stellarService.checkConnectivity.mockRejectedValue(
      new Error('Horizon unavailable'),
    );

    await expect(indicator.isHealthy('stellar')).rejects.toThrow(
      HealthCheckError,
    );
    await expect(indicator.isHealthy('stellar')).rejects.toMatchObject({
      causes: {
        stellar: {
          status: 'down',
          error: 'Horizon unavailable',
        },
      },
    });
  });
});
