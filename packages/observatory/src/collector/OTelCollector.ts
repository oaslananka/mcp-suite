import { SQLiteStore, SpanData } from "../storage/SQLiteStore.js";

export class OTelCollector {
  constructor(private readonly store: SQLiteStore) {}

  receiveSpan(span: SpanData): void {
    this.store.insertSpan(span);
  }
}
