export class DemoSessionBudget {
  requests = 0;
  estimatedUsd = 0;
  reservedUsd = 0;
  stoppedReason: string | null = null;
  constructor(
    readonly maxRequests: number,
    readonly targetUsd: number,
  ) {}
  reserve(payloadBytes: number, maxOutputTokens: number) {
    if (this.stoppedReason) throw new Error(this.stoppedReason);
    if (this.reservedUsd) throw new Error("provider_request_active");
    if (
      !Number.isSafeInteger(payloadBytes) ||
      payloadBytes < 1 ||
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens < 1 ||
      maxOutputTokens > 1024
    )
      throw new Error("invalid_provider_reservation");
    if (this.requests >= this.maxRequests) {
      this.stoppedReason = "request_limit";
      throw new Error(this.stoppedReason);
    }
    const reservation =
      ((payloadBytes + 4096) * 0.3 + maxOutputTokens * 1.2) / 1_000_000;
    if (this.estimatedUsd + reservation > this.targetUsd) {
      this.stoppedReason = "estimate_limit";
      throw new Error(this.stoppedReason);
    }
    this.reservedUsd = reservation;
    this.requests++;
  }
  settle(inputTokens: number, outputTokens: number) {
    if (!this.reservedUsd) throw new Error("no_pending_reservation");
    if (
      ![inputTokens, outputTokens].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      this.fail("usage_unreported");
      return;
    }
    this.estimatedUsd += (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
    this.reservedUsd = 0;
    if (this.estimatedUsd >= this.targetUsd)
      this.stoppedReason = "estimate_limit";
  }
  fail(reason: string) {
    this.estimatedUsd += this.reservedUsd;
    this.reservedUsd = 0;
    this.stoppedReason = reason;
  }
}
