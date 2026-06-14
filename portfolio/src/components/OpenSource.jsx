import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Github } from 'lucide-react';

const steps = [
  {
    step: '01',
    title: 'Install',
    code: 'npm install sse-streaming-reliability-kit',
  },
  {
    step: '02',
    title: 'Connect a stream',
    code: `import { connectSSE } from 'sse-streaming-reliability-kit/client';

const conn = connectSSE('https://api.example.com/events', {
  onEvent: (e) => console.log(e.type, e.payload),
  onOpen:  ()  => console.log('Connected'),
});`,
  },
  {
    step: '03',
    title: 'Add a server endpoint',
    code: `import { createSSEWriter, createEnvelope } from 'sse-streaming-reliability-kit/server';

app.get('/events', (req, res) => {
  const writer = createSSEWriter(res);
  writer.init();

  setInterval(() => {
    writer.sendEvent(createEnvelope('update', { ts: Date.now() }));
  }, 1000);
});`,
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handle}
      className="mono text-xs px-2.5 py-1 rounded transition-all"
      style={{
        background: copied ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
        color: copied ? '#00ff88' : '#6b7280',
        border: `1px solid ${copied ? 'rgba(0,255,136,0.3)' : '#2a2a2a'}`,
      }}
    >
      {copied ? 'copied!' : 'copy'}
    </button>
  );
}

export default function OpenSource() {
  return (
    <section id="open-source" className="py-24 border-t" style={{ borderColor: '#1c1c1c' }}>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // FREE &amp; OPEN SOURCE
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Built for every developer.
            <br />
            <span style={{ color: '#00ff88' }}>Forever free.</span>
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#9ca3af' }}>
            MIT licensed. No paywalls, no rate limits, no vendor lock-in. Clone it, fork it, ship it
            — it's yours.
          </p>

          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            {[
              {
                label: 'MIT License',
                color: '#60a5fa',
                bg: 'rgba(59,130,246,0.08)',
                border: 'rgba(59,130,246,0.25)',
              },
              {
                label: 'Open Source',
                color: '#c084fc',
                bg: 'rgba(168,85,247,0.08)',
                border: 'rgba(168,85,247,0.25)',
              },
              {
                label: 'No Paywalls',
                color: '#00ff88',
                bg: 'rgba(0,255,136,0.08)',
                border: 'rgba(0,255,136,0.2)',
              },
              {
                label: 'Node.js 18+',
                color: '#fbbf24',
                bg: 'rgba(251,191,36,0.08)',
                border: 'rgba(251,191,36,0.25)',
              },
            ].map((b) => (
              <span
                key={b.label}
                className="px-3 py-1.5 rounded mono text-xs"
                style={{ background: b.bg, border: `1px solid ${b.border}`, color: b.color }}
              >
                {b.label}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl overflow-hidden"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: '#111', borderBottom: '1px solid #1c1c1c' }}
              >
                <div className="flex items-center gap-3">
                  <span className="mono text-xs font-bold" style={{ color: '#00ff88' }}>
                    {s.step}
                  </span>
                  <span className="text-sm font-semibold text-white">{s.title}</span>
                </div>
                <CopyButton text={s.code} />
              </div>
              <pre
                className="p-4 mono text-xs overflow-x-auto"
                style={{ color: '#e5e5e5', lineHeight: '1.7' }}
              >
                {s.code}
              </pre>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl p-10 text-center"
          style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
        >
          <h3 className="text-2xl font-bold text-white mb-3">
            Start shipping reliable SSE streams today.
          </h3>
          <p className="mb-8" style={{ color: '#9ca3af' }}>
            One command. Free forever. No account required.
          </p>

          <div
            className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl mb-8 cursor-pointer group"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onClick={() =>
              navigator.clipboard?.writeText('npm install sse-streaming-reliability-kit')
            }
          >
            <span className="mono text-base" style={{ color: '#6b7280' }}>
              $
            </span>
            <span className="mono text-base" style={{ color: '#e5e5e5' }}>
              npm install sse-streaming-reliability-kit
            </span>
            <span
              className="mono text-sm opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: '#00ff88' }}
            >
              copy
            </span>
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a
              href="https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: '#00ff88', color: '#080808' }}
            >
              <Github size={16} />
              Star on GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/sse-streaming-reliability-kit"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-80"
              style={{ background: '#cb3837', color: '#fff' }}
            >
              View on npm
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
