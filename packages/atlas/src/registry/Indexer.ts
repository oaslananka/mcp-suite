import { ServerStore } from "./ServerStore.js";

export class Indexer {
  constructor(private readonly store: ServerStore) {}

  rebuild(): { count: number } {
    return { count: this.store.search("").total };
  }
}
