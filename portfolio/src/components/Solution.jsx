import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const solutions = [
  {
    problem: 'Connection drops',
    solution: 'Auto-reconnect with exponential backoff',
    detail: 'Configurable retry policy + circuit breaker',
  },
  {
    problem: 'Events lost',
    solution: 'Resume from Last-Event-ID',
    detail: 'Server replay buffer with TTL',
  },
  {
    problem: 'Duplicate processing',
    solution: 'Bounded LRU dedupe cache',
    detail: 'Auto-detects already-seen event IDs',
  },
  {
    problem: 'Zombie connections',
    solution: 'Heartbeat + liveness detection',
    detail: 'Configurable timeout triggers reconnect',
  },
  {
    problem: 'Production debugging',
    solution: 'Prometheus metrics + JSON logging',
    detail: 'stream_id and trace_id correlation',
  },
];

export default function Solution() {
  return (
    <section id="solution" className="py-24" style={{ background: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 02 — THE SOLUTION
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            A complete reliability layer.
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Each failure mode mapped to a battle-tested solution. Configurable, observable,
            production-ready.
          </p>
        </motion.div>

        <div className="space-y-3">
          {solutions.map((s, i) => (
            <motion.div
              key={s.problem}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="grid md:grid-cols-12 gap-4 p-5 rounded-xl items-center transition-all hover:translate-x-1"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <div className="md:col-span-1 mono text-xs" style={{ color: '#374151' }}>
                0{i + 1}
              </div>
              <div className="md:col-span-3">
                <span className="text-sm line-through" style={{ color: '#6b7280' }}>
                  {s.problem}
                </span>
              </div>
              <div className="md:col-span-4 flex items-center gap-2" style={{ color: '#00ff88' }}>
                <Check size={16} />
                <span className="font-semibold text-sm">{s.solution}</span>
              </div>
              <div className="md:col-span-4 mono text-xs" style={{ color: '#9ca3af' }}>
                {s.detail}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
