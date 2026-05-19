"use client";

import { useState } from 'react';
import { useAppStore } from '../state/store';
import { wsTransport } from '../websocket/transport';

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { groqKey, openRouterKey, setKeys } = useAppStore();
  const [groq, setGroq] = useState(groqKey);
  const [openRouter, setOpenRouter] = useState(openRouterKey);

  const handleSave = () => {
    setKeys(groq, openRouter);
    if (wsTransport) {
      wsTransport.sendEvent('CREDENTIALS', {
        groq_api_key: groq,
        openrouter_api_key: openRouter
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
