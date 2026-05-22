import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  groqKey: string;
  openRouterKey: string;
  openRouterModel: string;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  debugLogs: string[];
  isDebugVisible: boolean;
  isVerboseDebug: boolean;
  kokoroVoice: string;
  currentVolume: number;
  setKeys: (groq: string, openrouter: string, orModel: string) => void;
  setKokoroVoice: (voice: string) => void;
  setCurrentVolume: (vol: number) => void;
  setConnectionStatus: (status: boolean) => void;
  setListening: (status: boolean) => void;
  setSpeaking: (status: boolean) => void;
  setVerboseDebug: (verbose: boolean) => void;
  appendTranscript: (text: string) => void;
  addDebugLog: (log: string) => void;
  setDebugVisible: (visible: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      groqKey: '',
      openRouterKey: '',
      openRouterModel: '',
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      transcript: '',
      debugLogs: [],
      isDebugVisible: false,
      isVerboseDebug: false,
      kokoroVoice: 'af_heart',
      currentVolume: 0,
      
      setKeys: (groq, openrouter, orModel) => set({ groqKey: groq, openRouterKey: openrouter, openRouterModel: orModel }),
      setKokoroVoice: (voice) => set({ kokoroVoice: voice }),
      setCurrentVolume: (vol) => set({ currentVolume: vol }),
      setConnectionStatus: (status) => set({ isConnected: status }),
      setListening: (status) => set({ isListening: status }),
      setSpeaking: (status) => set({ isSpeaking: status }),
      setVerboseDebug: (verbose) => set({ isVerboseDebug: verbose }),
      appendTranscript: (text) => set((state) => ({ transcript: state.transcript + ' ' + text })),
      addDebugLog: (log) => set((state) => ({ debugLogs: [...state.debugLogs, log] })),
      setDebugVisible: (visible) => set({ isDebugVisible: visible }),
    }),
    {
      name: 'mira-storage',
      partialize: (state) => ({ groqKey: state.groqKey, openRouterKey: state.openRouterKey, openRouterModel: state.openRouterModel }),
    }
  )
);
