"use client";

import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { wsTransport } from '../websocket/transport';
import { motion } from 'framer-motion';
import SettingsPanel from '../components/SettingsPanel';
import { audioCapture } from '../audio/capture';

export default function Home() {
  const { isConnected, isListening, isSpeaking, transcript } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (wsTransport) {
      wsTransport.connect();
    }
  }, []);

  const handleOrbClick = () => {
    if (isListening) {
      audioCapture?.stop();
    } else {
      audioCapture?.start();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center font-sans overflow-hidden relative">
      {/* Background Ambience */}
      <motion.div 
        animate={{ opacity: isSpeaking ? 0.2 : 0.05 }}
        className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 pointer-events-none"
      />

      <div className="z-10 flex flex-col items-center w-full max-w-2xl px-6">
        <h1 className="text-4xl font-light tracking-widest text-white/80 mb-2">MIRA</h1>
        <div className="flex items-center gap-2 mb-12">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} shadow-[0_0_10px_currentColor]`} />
          <span className="text-sm text-neutral-400 uppercase tracking-wider">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* Orbs / Visualization */}
        <div 
          onClick={handleOrbClick}
          className="relative h-64 w-64 flex items-center justify-center mb-12 cursor-pointer group"
        >
          <motion.div
            animate={{
              scale: isSpeaking ? [1, 1.2, 1] : isListening ? [1, 1.05, 1] : 1,
              opacity: isSpeaking ? 0.8 : isListening ? 0.4 : 0.1
            }}
            transition={{
              duration: isSpeaking ? 1.5 : 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute inset-0 rounded-full bg-indigo-500 blur-3xl group-hover:bg-indigo-400 transition-colors"
          />
          <div className="w-32 h-32 rounded-full border border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-center shadow-2xl group-hover:border-white/30 transition-all">
            {isSpeaking ? (
              <span className="text-indigo-300 animate-pulse font-medium">Speaking</span>
            ) : isListening ? (
              <span className="text-green-300 font-medium">Listening...</span>
            ) : (
              <span className="text-neutral-400 font-medium tracking-wide">Press to Speak</span>
            )}
          </div>
        </div>

        {/* Transcript Box */}
        <div className="w-full h-48 bg-black/20 border border-white/5 rounded-2xl p-6 backdrop-blur-lg overflow-y-auto font-light text-neutral-300 shadow-inner">
          {transcript || "Say something..."}
        </div>
      </div>

      <button 
        onClick={() => setShowSettings(true)}
        className="absolute bottom-8 right-8 px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-md text-sm tracking-wide transition-colors border border-white/10"
      >
        Settings
      </button>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
