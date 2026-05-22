import { wsTransport } from '../websocket/transport';
import { useAppStore } from '../state/store';

class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && wsTransport) {
          wsTransport.sendAudio(e.data);
        }
      };

      // To lower latency, we chunk every 500ms
      this.mediaRecorder.start(500);
      useAppStore.getState().setListening(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  stop() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {
      console.error("Error stopping audio capture:", e);
    } finally {
      useAppStore.getState().setListening(false);
      
      // Notify backend that speech ended to trigger response
      if (wsTransport) {
        wsTransport.sendEvent('SPEECH_END', {});
      }
    }
  }
}

export const audioCapture = typeof window !== 'undefined' ? new AudioCapture() : null;
