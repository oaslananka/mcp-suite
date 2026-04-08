export interface AnomalyResult {
  metric: string;
  actualValue: number;
  expectedValue: number;
  zScore: number;
  serverName: string;
  toolName: string;
  timestamp: Date;
}

export interface AlertChannel {
  name: string;
  type: "slack" | "email" | "webhook" | "pagerduty";
  config: Record<string, string>;
  send(alert: AnomalyResult): Promise<void>;
}

export class AlertManager {
  private readonly channels: AlertChannel[] = [];
  private readonly recentAlerts = new Map<string, number>();

  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  async trigger(anomaly: AnomalyResult): Promise<void> {
    const key = `${anomaly.metric}:${anomaly.serverName}:${anomaly.toolName}`;
    const now = Date.now();
    const lastSentAt = this.recentAlerts.get(key) ?? 0;
    if (now - lastSentAt < 5 * 60_000) {
      return;
    }

    this.recentAlerts.set(key, now);
    await Promise.all(this.channels.map((channel) => channel.send(anomaly)));
  }
}
