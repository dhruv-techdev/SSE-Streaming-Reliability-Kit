import React, { useState } from 'react';
import { motion } from 'framer-motion';

const useCases = [
  {
    tag: '01 — AI CHAT',
    title: 'Stream AI responses token by token',
    description:
      'Pipe LLM output to the browser as it generates. If the connection drops mid-response, the client resumes from the last token — no repeated API calls, no lost output.',
    code: `import { connectSSE } from 'sse-streaming-reliability-kit/client';

connectSSE('https://api.myapp.com/ai/stream', {
  onEvent: (e) => {
    if (e.type === 'ai.token') {
      document.getElementById('output').innerText += e.payload.token;
    }
  },
  persistLastEventId: true,   // resume if tab loses connection
  enableDedupe: true,         // never render a token twice
  onClose: ({ willReconnect }) => {
    if (willReconnect) showReconnectingBanner();
  },
});`,
  },
  {
    tag: '02 — LIVE DASHBOARD',
    title: 'Real-time metrics without polling',
    description:
      'Replace setInterval + fetch loops with a single persistent stream. Reconnects automatically on network blip, replays any missed ticks from the buffer.',
    code: `// server — push metrics every second
import { createSSEWriter, createReplayBuffer, createEnvelope } from 'sse-streaming-reliability-kit/server';

const buffer = createReplayBuffer({ maxSize: 60 }); // keep last 60 ticks

app.get('/metrics/stream', (req, res) => {
  const writer = createSSEWriter(res);
  writer.init();

  // replay missed ticks for reconnecting clients
  const lastId = req.headers['last-event-id'];
  if (lastId) {
    buffer.getEventsAfter(lastId).events.forEach(e => writer.sendEvent(e));
  }

  const tick = setInterval(() => {
    const event = createEnvelope('metrics.update', {
      cpu: getCpuUsage(),
      memory: getMemoryUsage(),
      rps: getRequestsPerSecond(),
    });
    writer.sendEvent(event);
    buffer.add(event);
  }, 1000);

  req.on('close', () => clearInterval(tick));
});`,
  },
  {
    tag: '03 — ORDER TRACKING',
    title: 'Live delivery status updates',
    description:
      'Push order state changes the moment they happen. If a customer\'s phone loses signal for 30 seconds, they reconnect and instantly catch up — no "refresh to update" banner needed.',
    code: `// client — inside your order tracking page
import { connectSSE } from 'sse-streaming-reliability-kit/client';

const conn = connectSSE(\`/orders/\${orderId}/stream\`, {
  onEvent: (e) => {
    if (e.type === 'order.status') {
      updateTrackingUI(e.payload.status, e.payload.eta);
    }
    if (e.type === 'order.delivered') {
      showDeliveredScreen();
      conn.stop();
    }
  },
  retryPolicy: {
    baseDelayMs: 500,   // fast reconnect for mobile networks
    maxDelayMs: 5000,
  },
  persistLastEventId: true,  // catch up after signal loss
});`,
  },
  {
    tag: '04 — CI/CD BUILD LOGS',
    title: 'Stream build output line by line',
    description:
      'Show live terminal output as your pipeline runs. Each log line is an event — dedupe prevents double-printing on reconnect, ordering ensures lines appear in the right sequence.',
    code: `// server — stream build logs as they are written
import { createSSEWriter, createReplayBuffer, createEnvelope } from 'sse-streaming-reliability-kit/server';

const logBuffer = createReplayBuffer({ maxSize: 10000 });

app.get('/builds/:id/logs', (req, res) => {
  const writer = createSSEWriter(res);
  writer.init();

  // replay everything from the start for late joiners
  const lastId = req.headers['last-event-id'];
  if (lastId) {
    logBuffer.getEventsAfter(lastId).events.forEach(e => writer.sendEvent(e));
  }

  const unlisten = buildRunner.onLog(req.params.id, (line) => {
    const event = createEnvelope('build.log', { line, ts: Date.now() });
    writer.sendEvent(event);
    logBuffer.add(event);
  });

  req.on('close', unlisten);
});

// client
connectSSE(\`/builds/\${buildId}/logs\`, {
  onEvent: (e) => appendLogLine(e.payload.line),
  enableDedupe: true,    // no duplicate lines on reconnect
  enableOrdering: true,  // lines always in sequence
});`,
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
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
  const [active, setActive] = useState(0);
  const uc = useCases[active];

  return (
    <section id="open-source" className="py-24 border-t" style={{ borderColor: '#1c1c1c' }}>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 07 — REAL-WORLD USE CASES
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Drop it into any stack.
            <br />
            <span style={{ color: '#00ff88' }}>Works in minutes.</span>
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Four production scenarios — copy the code, swap the endpoint, ship it.
          </p>
        </motion.div>

        {/* Tab selector */}
        <div className="flex gap-2 flex-wrap mb-8">
          {useCases.map((uc, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="mono text-xs px-4 py-2 rounded-lg transition-all"
              style={{
                background: active === i ? 'rgba(0,255,136,0.1)' : '#0f0f0f',
                border: `1px solid ${active === i ? 'rgba(0,255,136,0.35)' : '#1c1c1c'}`,
                color: active === i ? '#00ff88' : '#6b7280',
              }}
            >
              {uc.tag}
            </button>
          ))}
        </div>

        {/* Active use case */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="grid lg:grid-cols-5 gap-6"
        >
          {/* Description */}
          <div
            className="lg:col-span-2 p-8 rounded-xl flex flex-col justify-between"
            style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
          >
            <div>
              <div className="mono text-xs mb-3" style={{ color: '#00ff88' }}>
                {uc.tag}
              </div>
              <h3 className="text-xl font-bold text-white mb-4">{uc.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#9ca3af' }}>
                {uc.description}
              </p>
            </div>
            <div
              className="mt-8 p-4 rounded-lg"
              style={{ background: '#080808', border: '1px solid #1c1c1c' }}
            >
              <div className="mono text-xs mb-1" style={{ color: '#6b7280' }}>
                install
              </div>
              <div className="mono text-sm" style={{ color: '#e5e5e5' }}>
                npm install sse-streaming-reliability-kit
              </div>
            </div>
          </div>

          {/* Code block */}
          <div
            className="lg:col-span-3 rounded-xl overflow-hidden"
            style={{ background: '#0a0a0a', border: '1px solid #1c1c1c' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: '#111', borderBottom: '1px solid #1c1c1c' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
                <span className="mono text-xs ml-2" style={{ color: '#6b7280' }}>
                  example.js
                </span>
              </div>
              <CopyButton text={uc.code} />
            </div>
            <pre
              className="p-6 mono text-xs overflow-x-auto"
              style={{ color: '#e5e5e5', lineHeight: '1.8' }}
            >
              {uc.code}
            </pre>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
