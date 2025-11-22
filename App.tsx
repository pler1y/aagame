import React, { useEffect, useState } from 'react';
import { runTests } from './test';

export default function App() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const results = runTests();
    setLogs(results);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8 font-mono">
      <h1 className="text-3xl font-bold mb-6 text-emerald-400">Xiangqi Logic Engine Test Runner</h1>
      
      <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold mb-4 border-b border-slate-600 pb-2">Test Output</h2>
        <div className="space-y-2">
          {logs.map((log, index) => (
            <div key={index} className={`
              p-2 rounded 
              ${log.startsWith('Error') ? 'bg-red-900/30 text-red-300' : ''}
              ${log.startsWith('===') ? 'font-bold text-emerald-300 mt-4' : ''}
              ${log.startsWith('---') ? 'text-yellow-200' : ''}
            `}>
              <span className="text-slate-500 mr-4 select-none">
                {(index + 1).toString().padStart(2, '0')}
              </span>
              {log}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 text-sm text-slate-500">
        <p>Check <code>gameEngine.ts</code> for implementation details.</p>
        <p>Check <code>test.ts</code> for scenario definitions.</p>
      </div>
    </div>
  );
}