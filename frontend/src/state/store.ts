import { create } from 'zustand';

interface AppState {
  groqKey: string;
  openRouterKey: string;
  openRouterModel: string;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  setKeys: (groq: string, openrouter: string, orModel: string) => void;
  setConnectionStatus: (status: boolean) => void;
  setListening: (status: boolean) => void;
  setSpeaking: (status: boolean) => void;
  appendTranscript: (text: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  groqKey: '',
  openRouterKey: '',
  openRouterModel: '',
  isConnected: false,
  isListening: false,
  isSpeaking: false,
  transcript: '',
  
  setKeys: (groq, openrouter, orModel) => set({ groqKey: groq, openRouterKey: openrouter, openRouterModel: orModel }),
  setConnectionStatus: (status) => set({ isConnected: status }),
  setListening: (status) => set({ isListening: status }),
  setSpeaking: (status) => set({ isSpeaking: status }),
  appendTranscript: (text) => set((state) => ({ transcript: state.transcript + ' ' + text })),
}));
