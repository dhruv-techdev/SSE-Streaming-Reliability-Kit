import React from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  PlayCircle,
  Filter,
  Activity,
  FileText,
  Link2,
  TestTube,
  GitBranch,
} from 'lucide-react';

const features = [
  {
    icon: RefreshCw,
    title: 'Exponential Backoff',
    desc: 'Configurable retry with jitter, max attempts, max time. Circuit breaker prevents infinite loops.',
  },
  {
    icon: PlayCircle,
    title: 'Resume Support',
    desc: 'Last-Event-ID with pluggable storage (memory, file, localStorage). Server replay buffer with TTL.',
  },
  {
    icon: Filter,
    title: 'Deduplication',
    desc: 'Bounded LRU cache detects replayed events. Ordering enforcement with configurable rules.',
  },
  {
    icon: Activity,
    title: 'Liveness Detection',
    desc: 'Heartbeat monitoring with grace period. Auto-reconnect when server goes silent.',
  },
  {
    icon: FileText,
    title: 'Structured Logging',
    desc: 'JSON logs with consistent schema. Log levels, sanitization, and component tags.',
  },
  {
    icon: Link2,
    title: 'Correlation IDs',
    desc: 'stream_id per connection, optional trace_id for distributed tracing across services.',
  },
  {
    icon: TestTube,
    title: 'Fault Injection',
    desc: '10 pre-built scenarios: network drop, server restart, timeout, duplicates, cannot-resume.',
  },
  {
    icon: GitBranch,
    title: 'CI Pipeline',
    desc: 'GitHub Actions with lint, format, test, harness gates. PR template included.',
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24" style={{ background: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 04 — FEATURES
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Everything you need.
            <br />
            Nothing you don't.
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Production-ready features built from 28 user stories and 243 traced requirements.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-5 rounded-xl transition-all hover:-translate-y-1"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <f.icon size={22} style={{ color: '#00ff88' }} />
              <h3 className="font-bold text-white mt-4 mb-2 text-sm">{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
