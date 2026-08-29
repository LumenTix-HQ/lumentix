import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
} from '@stellar/stellar-sdk';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15;

/**
 * Thin client for invoking the LumentixContract (Soroban smart contract) that
 * backs on-chain event cancellation and mass ticket refunds. Unlike
 * StellarService (classic Horizon payments), this talks to a Soroban RPC
 * endpoint and submits contract-invocation transactions.
 */
@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly server: rpc.Server;
  private readonly networkPassphrase: string;
  private readonly contractId?: string;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ??
      'https://soroban-testnet.stellar.org';
    this.networkPassphrase =
      this.configService.get<string>('stellar.networkPassphrase') ??
      'Test SDF Network ; September 2015';
    this.contractId = this.configService.get<string>('LUMENTIX_CONTRACT_ID');

    this.server = new rpc.Server(rpcUrl);
  }

  private getContract(): Contract {
    if (!this.contractId) {
      throw new InternalServerErrorException('LUMENTIX_CONTRACT_ID is not configured');
    }
    return new Contract(this.contractId);
  }

  /** Sign, submit and poll a contract-invocation transaction to completion. */
  private async invoke(secret: string, method: string, args: unknown[]): Promise<unknown> {
    const keypair = Keypair.fromSecret(secret);
    const account = await this.server.getAccount(keypair.publicKey());
    const contract = this.getContract();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...(args as Parameters<Contract['call']>[1][])))
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(keypair);

    const sendResult = await this.server.sendTransaction(prepared);
    if (sendResult.status === 'ERROR') {
      throw new InternalServerErrorException(
        `Soroban transaction submission failed for ${method}`,
      );
    }

    let response = await this.server.getTransaction(sendResult.hash);
    let attempts = 0;
    while (
      response.status === rpc.Api.GetTransactionStatus.NOT_FOUND &&
      attempts < MAX_POLL_ATTEMPTS
    ) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      response = await this.server.getTransaction(sendResult.hash);
      attempts += 1;
    }

    if (response.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new InternalServerErrorException(
        `Soroban transaction for ${method} did not complete successfully (status: ${response.status})`,
      );
    }

    return response.returnValue ? scValToNative(response.returnValue) : undefined;
  }

  /** Trigger LumentixContract.cancel_event so the cancellation is recorded on-chain. */
  async cancelEventOnChain(organizerSecret: string, contractEventId: string): Promise<void> {
    const keypair = Keypair.fromSecret(organizerSecret);
    this.logger.log(`Cancelling contract event ${contractEventId} on-chain`);
    await this.invoke(organizerSecret, 'cancel_event', [
      new Address(keypair.publicKey()).toScVal(),
      nativeToScVal(BigInt(contractEventId), { type: 'u64' }),
    ]);
  }

  /** Trigger LumentixContract.execute_mass_refund; returns the number of tickets refunded. */
  async executeMassRefund(organizerSecret: string, contractEventId: string): Promise<number> {
    const keypair = Keypair.fromSecret(organizerSecret);
    this.logger.log(`Executing mass refund for contract event ${contractEventId}`);
    const result = await this.invoke(organizerSecret, 'execute_mass_refund', [
      new Address(keypair.publicKey()).toScVal(),
      nativeToScVal(BigInt(contractEventId), { type: 'u64' }),
    ]);
    return Number(result ?? 0);
  }

  /**
   * Read-only check that every eligible ticket for a cancelled contract event
   * has been refunded. Simulated locally (no signature/submission needed
   * since the contract function requires no auth).
   */
  async verifyRefundCompletion(contractEventId: string): Promise<boolean> {
    const contract = this.getContract();
    const dummySource = new Account(Keypair.random().publicKey(), '0');

    const tx = new TransactionBuilder(dummySource, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'verify_refund_completion',
          nativeToScVal(BigInt(contractEventId), { type: 'u64' }),
        ),
      )
      .setTimeout(30)
      .build();

    const simulation = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new InternalServerErrorException(
        `Soroban simulation failed for verify_refund_completion: ${simulation.error}`,
      );
    }

    const retval = (simulation as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    return retval ? Boolean(scValToNative(retval)) : false;
  }
}
