import { useAppStore } from '../state/store';

class WebSocketTransport {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
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

  private handleMessage(data: string | Blob | ArrayBuffer) {
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        if (message.type === 'TRANSCRIPT') {
          useAppStore.getState().appendTranscript(message.payload);
        } else if (message.type === 'HARD_STOP') {
          // Handle interruption playback stop
          useAppStore.getState().setSpeaking(false);
        } else if (message.type === 'AUDIO_START') {
          useAppStore.getState().setSpeaking(true);
        } else if (message.type === 'AUDIO_END') {
          useAppStore.getState().setSpeaking(false);
        }
      } catch (e) {
        console.error("Failed to parse JSON message", e);
      }
    } else if (data instanceof Blob) {
      // Handle binary audio play
    }
  }

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
