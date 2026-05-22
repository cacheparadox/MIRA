import { useAppStore } from '../state/store';
import { audioCapture } from '../audio/capture';

class WebSocketTransport {
  private ws: WebSocket | null = null;
  private url: string;

  private playbackContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlayingAudio: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor(url: string) {
    this.url = url;
    if (typeof window !== 'undefined') {
      this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  resumeAudioContext() {
    if (this.playbackContext && this.playbackContext.state === 'suspended') {
      this.playbackContext.resume();
    }
  }

  connect() {
    this.url = useAppStore.getState().backendUrl || process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:8000/ws';
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      useAppStore.getState().setConnectionStatus(true);
      
      // Send credentials upon connect
      const { groqKey, openRouterKey, openRouterModel } = useAppStore.getState();
      this.sendEvent('CREDENTIALS', {
        groq_api_key: groqKey,
        openrouter_api_key: openRouterKey,
        model: openRouterModel
      });
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      useAppStore.getState().setConnectionStatus(false);
      setTimeout(() => this.connect(), 3000); // Reconnect
    };
  }

  // properties moved to top

  private handleMessage(data: string | Blob | ArrayBuffer) {
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        if (message.type === 'TRANSCRIPT') {
          useAppStore.getState().appendTranscript(message.payload);
        } else if (message.type === 'HARD_STOP') {
          useAppStore.getState().setSpeaking(false);
          this.audioQueue = [];
          if (this.currentSource) {
            try { this.currentSource.stop(); } catch (e) {}
            this.currentSource.disconnect();
            this.currentSource = null;
          }
        } else if (message.type === 'AUDIO_START') {
          useAppStore.getState().setSpeaking(true);
        } else if (message.type === 'AUDIO_END') {
          useAppStore.getState().setSpeaking(false);
          if (audioCapture) {
            audioCapture.clearBuffer();
          }
        } else if (message.type === 'DEBUG') {
          useAppStore.getState().addDebugLog(message.payload);
        }
      } catch (e) {
        console.error("Failed to parse JSON message", e);
      }
    } else if (data instanceof Blob) {
      this.playAudioBlob(data);
    }
  }

  private async playAudioBlob(blob: Blob) {
    if (!this.playbackContext) return;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      this.audioQueue.push(arrayBuffer);
      if (!this.isPlayingAudio) {
        this.playNextAudio();
      }
    } catch (e) {
      console.error("Error queueing audio blob", e);
    }
  }

  private async playNextAudio() {
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false;
      return;
    }
    
    this.isPlayingAudio = true;
    const arrayBuffer = this.audioQueue.shift()!;
    
    if (!this.playbackContext) return;
    if (this.playbackContext.state === 'suspended') {
      await this.playbackContext.resume();
    }

    if (!this.analyser) {
      this.analyser = this.playbackContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.playbackContext.destination);
    }

    try {
      const audioBuffer = await this.playbackContext.decodeAudioData(arrayBuffer);
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser!);
      
      this.currentSource = source;
      
      source.onended = () => {
        if (this.animationFrameId && this.audioQueue.length === 0) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
          useAppStore.getState().setCurrentVolume(0);
        }
        this.playNextAudio();
      };

      source.start(0);
      if (!this.animationFrameId) {
        this.monitorPlaybackVolume();
      }
    } catch (e) {
      console.error("Error playing audio chunk", e);
      this.playNextAudio();
    }
  }

  private monitorPlaybackVolume = () => {
    if (!this.analyser) return;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Only update if we're actually speaking (prevents overriding capture volume when quiet)
    if (useAppStore.getState().isSpeaking) {
      useAppStore.getState().setCurrentVolume(rms);
    }

    this.animationFrameId = requestAnimationFrame(this.monitorPlaybackVolume);
  };

  sendEvent(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  sendAudio(blob: Blob) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // In a real app we'd convert blob to base64 or send raw bytes
      // For now, assume we send raw bytes
      this.ws.send(blob);
    }
  }
}

// In Next.js, we must be careful with window objects
export const wsTransport = typeof window !== 'undefined' ? new WebSocketTransport(process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:8000/ws') : null;
