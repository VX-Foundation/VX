import type { RealtimeMessage } from './realtime.js';

export interface RealtimePeer {
  id: string;
  topics: ReadonlySet<string>;
  send(message: RealtimeMessage): void | Promise<void>;
  close?(reason?: string): void;
}

export interface RealtimeBackplane {
  publish(channel: string, message: RealtimeMessage): Promise<void>;
  subscribe(channel: string, listener: (message: RealtimeMessage) => void): Promise<() => void>;
}

export class RealtimeHub {
  private readonly peers = new Map<string, RealtimePeer>();
  private stopBackplane: (() => void) | undefined;

  constructor(private readonly channel = 'vx:realtime', private readonly backplane?: RealtimeBackplane) {}

  async start(): Promise<void> {
    if (!this.backplane || this.stopBackplane) return;
    this.stopBackplane = await this.backplane.subscribe(this.channel, (message) => void this.deliver(message));
  }

  add(peer: RealtimePeer): () => void {
    if (this.peers.has(peer.id)) throw new Error(`Realtime peer '${peer.id}' is already connected.`);
    this.peers.set(peer.id, peer);
    return () => this.peers.delete(peer.id);
  }

  async publish(message: RealtimeMessage, options: { localOnly?: boolean } = {}): Promise<void> {
    await this.deliver(message);
    if (!options.localOnly) await this.backplane?.publish(this.channel, message);
  }

  async stop(): Promise<void> {
    this.stopBackplane?.();
    this.stopBackplane = undefined;
    for (const peer of this.peers.values()) peer.close?.('Hub stopped');
    this.peers.clear();
  }

  private async deliver(message: RealtimeMessage): Promise<void> {
    const deliveries: Promise<void>[] = [];
    for (const peer of this.peers.values()) {
      if (!peer.topics.has(message.topic) && !peer.topics.has('*')) continue;
      deliveries.push(Promise.resolve(peer.send(message)));
    }
    await Promise.allSettled(deliveries);
  }
}
