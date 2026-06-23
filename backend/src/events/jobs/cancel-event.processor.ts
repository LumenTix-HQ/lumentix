@Processor('event-cancellation')
export class CancelEventProcessor {
  constructor(
    private readonly refundService: RefundService,
  ) {}

  @Process('cancel-event')
  async handle(job: Job<{ eventId: string }>) {
    await this.refundService.refundEvent(
      job.data.eventId,
    );

    return {
      refunded: true,
    };
  }
}