"use client";

import { useState } from 'react';
import { useAppStore } from '../state/store';
import { wsTransport } from '../websocket/transport';

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { groqKey, openRouterKey, openRouterModel, kokoroVoice, backendUrl, setKeys, setKokoroVoice, setBackendUrl } = useAppStore();
  const [groq, setGroq] = useState(groqKey);
  const [openRouter, setOpenRouter] = useState(openRouterKey);
  const [orModel, setOrModel] = useState(openRouterModel || "meta-llama/llama-3-8b-instruct:free");
  const [voice, setVoice] = useState(kokoroVoice || "af_heart");
  const [backend, setBackend] = useState(backendUrl || "");

  const handleSave = () => {
    setKeys(groq, openRouter, orModel);
    setKokoroVoice(voice);
    
    let reconnectNeeded = false;
    if (backend !== backendUrl) {
      setBackendUrl(backend);
      reconnectNeeded = true;
    }

    if (wsTransport) {
      if (reconnectNeeded) {
        wsTransport.connect();
      }
      
      wsTransport.sendEvent('CREDENTIALS', {
        groq_api_key: groq,
        openrouter_api_key: openRouter,
        model: orModel,
        kokoro_voice: voice
      });
    }
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-800 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-light mb-6 text-white/90">API Credentials</h2>
        
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Groq API Key (for Whisper STT)</label>
            <input 
              type="password"
              value={groq}
              onChange={(e) => setGroq(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="gsk_..."
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">OpenRouter API Key (for LLM)</label>
            <input 
              type="password"
              value={openRouter}
              onChange={(e) => setOpenRouter(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="sk-or-v1-..."
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">OpenRouter Model String</label>
            <input 
              type="text"
              value={orModel}
              onChange={(e) => setOrModel(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="meta-llama/llama-3-8b-instruct:free"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Backend WebSocket URL (for Custom Servers/Tunnels)</label>
            <input 
              type="text"
              value={backend}
              onChange={(e) => setBackend(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="wss://mira-backend.trycloudflare.com/ws"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">MIRA's Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
            >
              <option value="af_heart">Heart (Warm & Natural)</option>
              <option value="af_bella">Bella (Friendly)</option>
              <option value="af_nicole">Nicole (Clear & Articulate)</option>
              <option value="af_sarah">Sarah (Upbeat)</option>
              <option value="af_sky">Sky (Soft)</option>
              <option value="am_michael">Michael (Deep & Calm)</option>
              <option value="am_adam">Adam (Energetic)</option>
              <option value="bm_george">George (Authoritative)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-lg text-white font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
