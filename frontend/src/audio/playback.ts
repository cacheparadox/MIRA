export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private queue: AudioBuffer[] = [];
  private isPlaying: boolean = false;
  private sourceNode: AudioBufferSourceNode | null = null;

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  async addChunk(arrayBuffer: ArrayBuffer) {
    if (!this.audioContext) this.init();
    
    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
      this.queue.push(audioBuffer);
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (e) {
      console.error("Error decoding audio chunk", e);
    }
  }

  private playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const buffer = this.queue.shift()!;
    this.sourceNode = this.audioContext!.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.connect(this.audioContext!.destination);
    
    this.sourceNode.onended = () => {
      this.playNext();
    };
    
    this.sourceNode.start();
  }

  stop() {
    this.queue = [];
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
  }
}

export const audioPlayer = typeof window !== 'undefined' ? new AudioPlayer() : null;
