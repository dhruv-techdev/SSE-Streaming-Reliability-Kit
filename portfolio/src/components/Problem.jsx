import React from 'react';
import { motion } from 'framer-motion';
import { WifiOff, RefreshCw, Copy, AlertTriangle, Clock } from 'lucide-react';

const problems = [
  {
    icon: WifiOff,
    title: 'Connection Drops',
    desc: 'Network blips and load balancer timeouts kill SSE connections silently with no recovery.',
    impact: 'Events lost, stale data',
  },
  {
    icon: RefreshCw,
    title: 'No Auto-Resume',
    desc: 'Native EventSource reconnects but starts from scratch — missing every event during downtime.',
    impact: 'Data gaps, broken state',
  },
  {
    icon: Copy,
    title: 'Duplicate Events',
    desc: 'Replay after reconnect can deliver already-seen events causing duplicate processing.',
    impact: 'Double charges, wrong counts',
  },
  {
    icon: AlertTriangle,
    title: 'Silent Failures',
    desc: 'Without heartbeats there is no way to detect zombie connections that stopped delivering data.',
    impact: 'Users stuck unknowingly',
  },
  {
    icon: Clock,
    title: 'No Observability',
    desc: 'When things break in production there are no metrics or correlation IDs to debug with.',
    impact: 'Hours wasted debugging',
  },
];

export default function Problem() {
  return (
    <section id="problem" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 01 — THE PROBLEM
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            SSE breaks in production.
            <br />
            Always.
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Server-Sent Events are simple until something goes wrong. And in production, something
            always goes wrong.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {problems.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="p-6 rounded-xl transition-all hover:-translate-y-1"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.1)' }}
                >
                  <p.icon size={20} style={{ color: '#ef4444' }} />
                </div>
                <span className="mono text-xs" style={{ color: '#374151' }}>
                  0{i + 1}
                </span>
              </div>
              <h3 className="font-bold text-white mb-2">{p.title}</h3>
              <p className="text-sm mb-4" style={{ color: '#9ca3af' }}>
                {p.desc}
              </p>
              <div
                className="mono text-xs pt-3"
                style={{ color: '#ef4444', borderTop: '1px solid #1c1c1c' }}
              >
                → {p.impact}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
