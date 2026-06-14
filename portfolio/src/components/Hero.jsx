import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

const lines = [
  { text: '> npm install sse-streaming-reliability-kit', color: '#6b7280', delay: 0 },
  { text: 'added 1 package in 1.2s', color: '#9ca3af', delay: 600 },
  { text: '', delay: 800 },
  { text: '> npm run dev', color: '#6b7280', delay: 1000 },
  { text: 'SSE Streaming Reliability Kit v1.0.0', color: '#00ff88', delay: 1400 },
  { text: 'Server:   http://localhost:3000', color: '#e5e5e5', delay: 1700 },
  { text: 'Stream:   http://localhost:3000/stream', color: '#e5e5e5', delay: 1800 },
  { text: '', delay: 1900 },
  { text: '[CONNECT] stream-monsps6a-ti21kq3f  {total:1}', color: '#3b82f6', delay: 2200 },
  { text: '[EVENT]   domain.stream.tick seq=1  ✓', color: '#00ff88', delay: 2700 },
  { text: '[EVENT]   domain.stream.tick seq=2  ✓', color: '#00ff88', delay: 3200 },
  { text: '[EVENT]   domain.stream.tick seq=3  ✓', color: '#00ff88', delay: 3700 },
];

function AnimatedTerminal() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    lines.forEach((line, i) => setTimeout(() => setVisible(i + 1), line.delay));
  }, []);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#0a0a0a', border: '1px solid #1c1c1c' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: '#111', borderBottom: '1px solid #1c1c1c' }}
      >
        <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
        <span className="mono text-xs ml-3" style={{ color: '#6b7280' }}>
          terminal — npm run dev
        </span>
      </div>
      <div className="p-5 min-h-[260px] mono text-sm space-y-1">
        {lines.slice(0, visible).map((line, i) => (
          <div key={i} style={{ color: line.color || '#6b7280' }}>
            {line.text || '\u00A0'}
          </div>
        ))}
        {visible < lines.length && <span className="cursor" />}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="min-h-screen flex items-center pt-20 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#00ff88 1px, transparent 1px), linear-gradient(90deg, #00ff88 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,255,136,0.04), transparent)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full py-12">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded mono text-xs"
                style={{
                  background: 'rgba(0,255,136,0.08)',
                  border: '1px solid rgba(0,255,136,0.2)',
                  color: '#00ff88',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                Production Ready
              </div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded mono text-xs"
                style={{
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  color: '#60a5fa',
                }}
              >
                MIT License
              </div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded mono text-xs"
                style={{
                  background: 'rgba(168,85,247,0.08)',
                  border: '1px solid rgba(168,85,247,0.25)',
                  color: '#c084fc',
                }}
              >
                Open Source
              </div>
            </div>

            <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              SSE Streaming
              <br />
              <span style={{ color: '#00ff88' }}>Reliability Kit</span>
            </h1>

            <p className="text-lg mb-8 leading-relaxed" style={{ color: '#9ca3af' }}>
              Never lose an event again. Free, open-source, production-grade auto-reconnection,
              resume from last event, deduplication, and Prometheus observability — all out of the
              box.
            </p>

            {/* npm install command */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg mb-8 group cursor-pointer"
              style={{ background: '#0f0f0f', border: '1px solid #2a2a2a' }}
              onClick={() =>
                navigator.clipboard?.writeText('npm install sse-streaming-reliability-kit')
              }
            >
              <span className="mono text-sm" style={{ color: '#6b7280' }}>
                $
              </span>
              <span className="mono text-sm flex-1" style={{ color: '#e5e5e5' }}>
                npm install sse-streaming-reliability-kit
              </span>
              <span
                className="mono text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#00ff88' }}
              >
                copy
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { val: '498', label: 'Tests Passing' },
                { val: '38', label: 'Test Files' },
                { val: '10/10', label: 'Scenarios' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="p-4 rounded-lg text-center"
                  style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
                >
                  <div className="text-2xl font-bold" style={{ color: '#00ff88' }}>
                    {s.val}
                  </div>
                  <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 flex-wrap">
              <a
                href="https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit"
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: '#00ff88', color: '#080808' }}
              >
                View on GitHub
              </a>
              <a
                href="https://www.npmjs.com/package/sse-streaming-reliability-kit"
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 rounded-lg font-semibold text-sm transition-all"
                style={{ background: '#cb3837', color: '#fff' }}
              >
                View on npm
              </a>
              <a
                href="#terminals"
                className="px-6 py-3 rounded-lg font-semibold text-sm transition-all"
                style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#e5e5e5' }}
              >
                See Live Output
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <AnimatedTerminal />
          </motion.div>
        </div>
      </div>

      <a
        href="#problem"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce"
        style={{ color: '#6b7280' }}
      >
        <ArrowDown size={22} />
      </a>
    </section>
  );
}
