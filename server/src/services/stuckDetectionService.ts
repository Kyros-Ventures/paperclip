/**
 * StuckDetectionService — minimal stub for test compatibility.
 * The full implementation (TEC-167: stuck agent escalation, Telegram alerts, recovery)
 * was in an orphaned commit and never merged to main.
 * 
 * This stub exists because stuck-detection-recovery.test.ts was committed
 * as part of TEC-408 (Notifications Center) and needs an import target.
 * 
 * TODO(TEC-167): Replace with full implementation when stuck agent escalation is merged.
 */

export class StuckDetectionService {
  private config: Record<string, unknown> = {};

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
  }

  startMonitoring(_intervalMs: number = 60000): void {
    // Stub — full implementation in orphaned commit 79415d0e
  }

  stopMonitoring(): void {
    // Stub
  }

  async recordHeartbeat(
    _agentId: string,
    _companyId: string,
    _data: Record<string, unknown> = {}
  ): Promise<void> {
    // Stub
  }

  async checkAllAgents(): Promise<void> {
    // Stub
  }

  async getAgentHealth(_agentId: string): Promise<unknown> {
    return null;
  }

  async attemptRecovery(_agentId: string): Promise<boolean> {
    return false;
  }

  notifyLevel(
    _agent: Record<string, unknown>,
    _level: number,
    _minutes: number
  ): Promise<void> {
    return Promise.resolve();
  }
}

export const stuckDetectionService = new StuckDetectionService();
