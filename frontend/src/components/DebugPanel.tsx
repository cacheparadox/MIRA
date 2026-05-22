import { useAppStore } from '../state/store';
import { useEffect, useRef } from 'react';

export default function DebugPanel() {
  const { debugLogs, isDebugVisible, isVerboseDebug, setDebugVisible, setVerboseDebug } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debugLogs, isDebugVisible]);

  if (!isDebugVisible) {
    return (
      <button 
        onClick={() => setDebugVisible(true)}
        className="absolute top-8 left-8 px-4 py-1.5 bg-black/20 hover:bg-black/40 text-neutral-400 text-xs rounded border border-white/5 transition-all"
      >
        Show Debug
      </button>
    );
  }

  return (
    <div className="absolute top-8 left-8 w-96 h-80 bg-black/80 border border-white/10 rounded-lg shadow-2xl flex flex-col font-mono text-xs overflow-hidden z-50">
      <div className="flex justify-between items-center p-2 border-b border-white/10 bg-white/5 text-neutral-300">
        <div className="flex items-center gap-3">
          <span>Debug Console</span>
          <label className="flex items-center gap-1.5 cursor-pointer text-neutral-500 hover:text-neutral-300">
            <input 
              type="checkbox" 
              checked={isVerboseDebug}
              onChange={(e) => setVerboseDebug(e.target.checked)}
              className="accent-indigo-500"
            />
            <span>Verbose</span>
          </label>
        </div>
        <button onClick={() => setDebugVisible(false)} className="hover:text-white px-2">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-green-400/90 whitespace-pre-wrap">
        {debugLogs.filter(log => isVerboseDebug || !log.includes('[VERBOSE]')).length === 0 ? (
          <div className="text-neutral-500 italic">No logs yet...</div>
        ) : (
          debugLogs
            .filter(log => isVerboseDebug || !log.includes('[VERBOSE]'))
            .map((log, i) => (
              <div key={i} className="break-words">
                {log.startsWith('[VERBOSE]') ? log : <><span className="text-neutral-500">[{new Date().toLocaleTimeString()}]</span> {log}</>}
              </div>
            ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
