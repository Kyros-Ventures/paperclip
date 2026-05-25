/**
 * NotificationService — minimal stub for test compatibility.
 * sendTelegramNotification and notifyAgentStuck are implemented
 * by the real service. This file exists so stuckDetectionService
 * has an import target.
 */
export async function sendTelegramNotification(
  _title: string,
  _message: string,
  _priority: string = "normal",
): Promise<void> {
  // Stub — real implementation in Telegram notification module
}

export async function notifyAgentStuck(
  _agentId: string,
  _reason: string,
): Promise<void> {
  // Stub
}

export const notificationService = {
  sendTelegramNotification,
  notifyAgentStuck,
};
