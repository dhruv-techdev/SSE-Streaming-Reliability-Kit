import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Server, Radio, BarChart3, CheckCircle, Zap } from 'lucide-react';

const tabs = [
  { id: 'server', icon: Server, label: 'Server Start', cmd: 'npm run dev' },
  { id: 'client', icon: Radio, label: 'Client Demo', cmd: 'npm run client:demo' },
  { id: 'metrics', icon: BarChart3, label: 'Prometheus', cmd: 'curl localhost:3000/metrics' },
  { id: 'tests', icon: CheckCircle, label: 'Test Suite', cmd: 'npm test' },
  { id: 'harness', icon: Zap, label: 'Fault Injection', cmd: 'npm run harness run-all' },
];

const content = {
  server: (
    <>
      <div style={{ color: '#6b7280' }}>$ npm run dev</div>
      <div style={{ color: '#6b7280' }}>{`> sse-streaming-reliability-kit@1.0.0 dev`}</div>
      <div style={{ color: '#6b7280' }}>{`> node server/src/server.js`}</div>
      <div className="my-2" />
      <div style={{ color: '#9ca3af' }}>{`Server config: {`}</div>
      <div style={{ color: '#9ca3af' }}>{`  "port": 3000,`}</div>
      <div style={{ color: '#9ca3af' }}>{`  "host": "localhost",`}</div>
      <div style={{ color: '#9ca3af' }}>{`  "sse": {`}</div>
      <div style={{ color: '#9ca3af' }}>{`    "tickInterval": 2000,`}</div>
      <div style={{ color: '#9ca3af' }}>{`    "heartbeatInterval": 30000,`}</div>
      <div style={{ color: '#9ca3af' }}>{`    "maxBufferSize": 1000,`}</div>
      <div style={{ color: '#9ca3af' }}>{`    "maxReplayBatch": 100`}</div>
      <div style={{ color: '#9ca3af' }}>{`  },`}</div>
      <div style={{ color: '#9ca3af' }}>{`  "connections": { "maxConcurrent": 1000 }`}</div>
      <div style={{ color: '#9ca3af' }}>{`}`}</div>
      <div className="my-3 p-3 rounded" style={{ border: '1px solid #1c1c1c' }}>
        <div style={{ color: '#00ff88' }}>┌─────────────────────────────────────┐</div>
        <div style={{ color: '#00ff88' }}>│ SSE Streaming Reliability Kit v1.0.0 │</div>
        <div style={{ color: '#00ff88' }}>├─────────────────────────────────────┤</div>
        <div style={{ color: '#e5e5e5' }}>│ Server: http://localhost:3000 │</div>
        <div style={{ color: '#e5e5e5' }}>│ Health: http://localhost:3000/health│</div>
        <div style={{ color: '#e5e5e5' }}>│ Metrics: http://localhost:3000/metrics│</div>
        <div style={{ color: '#e5e5e5' }}>│ Stream: http://localhost:3000/stream│</div>
        <div style={{ color: '#00ff88' }}>└─────────────────────────────────────┘</div>
      </div>
      <div
        style={{ color: '#3b82f6' }}
      >{`{"event":"server.start","message":"Server started"}`}</div>
      <div
        style={{ color: '#3b82f6' }}
      >{`[REGISTRY] [CONNECT] stream-monsps6a-ti21kq3f {"total":1}`}</div>
      <div
        style={{ color: '#00ff88' }}
      >{`{"event":"stream.open","stream_id":"stream-monsps6a-ti21kq3f"}`}</div>
    </>
  ),
  client: (
    <>
      <div style={{ color: '#6b7280' }}>$ npm run client:demo</div>
      <div className="my-2" />
      <div style={{ color: '#3b82f6' }}>
        [STATE] idle → connecting {`{"reason":"user_connect"}`}
      </div>
      <div style={{ color: '#9ca3af' }}>
        [CONNECT] Connecting to http://localhost:3000/stream...
      </div>
      <div style={{ color: '#9ca3af' }}>
        [CONFIG] Ordering enforcement enabled {`{"rule":"sequence","policy":"drop_with_callback"}`}
      </div>
      <div style={{ color: '#3b82f6' }}>
        [STATE] connecting → open {`{"reason":"connection_success"}`}
      </div>
      <div style={{ color: '#00ff88' }}>[OPEN] Connected to http://localhost:3000/stream</div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=1 {`{"id":"019de6c7-bab..."}`}
      </div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=2 {`{"id":"019de6c7-c28..."}`}
      </div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=3 {`{"id":"019de6c7-ca5..."}`}
      </div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=4 {`{"id":"019de6c7-d22..."}`}
      </div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=5 {`{"id":"019de6c7-d9f..."}`}
      </div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=6 {`{"id":"019de6c7-e1c..."}`}
      </div>
      <div style={{ color: '#00ff88' }}>
        [EVENT] ✓ domain.stream.tick seq=7 {`{"id":"019de6c7-e99..."}`}
      </div>
      <div className="my-3 p-3 rounded" style={{ border: '1px solid #1c1c1c' }}>
        <div className="font-bold" style={{ color: '#00ff88' }}>
          VERIFICATION SUMMARY
        </div>
        <div className="grid grid-cols-2 mt-2 gap-x-4">
          <div style={{ color: '#9ca3af' }}>Duration:</div>
          <div style={{ color: '#e5e5e5' }}>15009ms</div>
          <div style={{ color: '#9ca3af' }}>Final State:</div>
          <div style={{ color: '#e5e5e5' }}>closed</div>
          <div style={{ color: '#9ca3af' }}>Events Received:</div>
          <div style={{ color: '#e5e5e5' }}>8</div>
          <div style={{ color: '#9ca3af' }}>Events Processed:</div>
          <div style={{ color: '#e5e5e5' }}>8</div>
          <div style={{ color: '#9ca3af' }}>Tick Events:</div>
          <div style={{ color: '#e5e5e5' }}>7</div>
          <div style={{ color: '#9ca3af' }}>Errors:</div>
          <div style={{ color: '#e5e5e5' }}>0</div>
        </div>
        <div className="mt-3 pt-2" style={{ borderTop: '1px solid #1c1c1c' }}>
          <div style={{ color: '#9ca3af' }}>ORDERING ENFORCEMENT:</div>
          <div className="grid grid-cols-2 gap-x-4 ml-3">
            <div style={{ color: '#9ca3af' }}>Rule:</div>
            <div style={{ color: '#e5e5e5' }}>sequence</div>
            <div style={{ color: '#9ca3af' }}>Total Accepted:</div>
            <div style={{ color: '#e5e5e5' }}>8</div>
            <div style={{ color: '#9ca3af' }}>Total Dropped:</div>
            <div style={{ color: '#e5e5e5' }}>0</div>
          </div>
        </div>
        <div
          className="mt-3 pt-2 font-bold"
          style={{ borderTop: '1px solid #1c1c1c', color: '#00ff88' }}
        >
          RESULT: PASS ✓
        </div>
      </div>
    </>
  ),
  metrics: (
    <>
      <div style={{ color: '#6b7280' }}>$ curl http://localhost:3000/metrics</div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_uptime_seconds Server uptime in seconds
      </div>
      <div style={{ color: '#6b7280' }}># TYPE sse_server_uptime_seconds gauge</div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_uptime_seconds</span>{' '}
        <span style={{ color: '#00ff88' }}>135</span>
      </div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_active_streams Current number of active SSE streams
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_active_streams</span>{' '}
        <span style={{ color: '#00ff88' }}>0</span>
      </div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_streams_opened_total Total number of SSE streams opened
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_streams_opened_total</span>{' '}
        <span style={{ color: '#00ff88' }}>1</span>
      </div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_disconnects_total Total disconnections by reason
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_disconnects_total</span>
        {`{reason="client_abort"}`} <span style={{ color: '#00ff88' }}>2284</span>
      </div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_heartbeats_sent_total Total heartbeat events sent
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_heartbeats_sent_total</span>{' '}
        <span style={{ color: '#00ff88' }}>0</span>
      </div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_events_sent_total Total events sent to clients
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_events_sent_total</span>{' '}
        <span style={{ color: '#00ff88' }}>8</span>
      </div>
      <div className="my-2" />
      <div style={{ color: '#6b7280' }}>
        # HELP sse_server_replays_attempted_total Total replay attempts
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_replays_attempted_total</span>{' '}
        <span style={{ color: '#00ff88' }}>0</span>
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_replays_succeeded_total</span>{' '}
        <span style={{ color: '#00ff88' }}>0</span>
      </div>
      <div>
        <span style={{ color: '#3b82f6' }}>sse_server_cannot_resume_total</span>
        {`{reason="none"}`} <span style={{ color: '#00ff88' }}>0</span>
      </div>
    </>
  ),
  tests: (
    <>
      <div style={{ color: '#6b7280' }}>$ npm test</div>
      <div className="my-2" />
      {[
        ['tests/client/state-machine.test.js', '33'],
        ['tests/client/dedupe-cache.test.js', '21'],
        ['tests/server/replay-buffer.test.js', '21'],
        ['tests/client/client-metrics.test.js', '24'],
        ['tests/client/ordering-guard.test.js', '29'],
        ['tests/client/liveness-monitor.test.js', '21'],
        ['tests/client/reconnect-manager.test.js', '14'],
        ['tests/integration/cannot-resume.test.js', '9', '11009ms'],
        ['tests/integration/last-event-id.test.js', '9', '22215ms'],
        ['tests/integration/metrics.test.js', '12', '8967ms'],
        ['tests/integration/replay.test.js', '8', '25264ms'],
        ['tests/integration/ordering.test.js', '11', '13781ms'],
        ['tests/server/metrics.test.js', '20'],
        ['tests/client/retry-policy.test.js', '19'],
        ['tests/integration/heartbeat.test.js', '6', '12295ms'],
        ['tests/client/sse-connector.test.js', '21'],
        ['tests/shared/logger.test.js', '14'],
        ['tests/server/heartbeat-scheduler.test.js', '15'],
        ['tests/shared/envelope.test.js', '22'],
        ['tests/integration/correlation.test.js', '7', '8167ms'],
        ['tests/integration/liveness.test.js', '7', '19774ms'],
        ['tests/harness/assertions.test.js', '19'],
        ['tests/harness/runner.test.js', '4', '5174ms'],
        ['tests/release/version.test.js', '7'],
      ].map(([f, n, ms]) => (
        <div key={f}>
          <span style={{ color: '#00ff88' }}>✓</span> <span style={{ color: '#9ca3af' }}>{f}</span>{' '}
          <span style={{ color: '#6b7280' }}>({n})</span>
          {ms && <span style={{ color: '#fbbf24' }}> {ms}</span>}
        </div>
      ))}
      <div className="my-3 p-3 rounded" style={{ border: '1px solid #1c1c1c' }}>
        <div>
          <span style={{ color: '#9ca3af' }}>Test Files</span>{' '}
          <span className="font-bold" style={{ color: '#00ff88' }}>
            38 passed
          </span>{' '}
          <span style={{ color: '#6b7280' }}>(38)</span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}> Tests</span>{' '}
          <span className="font-bold" style={{ color: '#00ff88' }}>
            498 passed
          </span>{' '}
          <span style={{ color: '#6b7280' }}>(498)</span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}> Duration</span>{' '}
          <span style={{ color: '#e5e5e5' }}>29.32s</span>
        </div>
      </div>
    </>
  ),
  harness: (
    <>
      <div style={{ color: '#6b7280' }}>$ npm run harness run-all</div>
      <div className="my-2" />
      <div style={{ color: '#3b82f6' }}>▶ Running scenario: server-restart</div>
      <div className="ml-3">
        <div style={{ color: '#3b82f6' }}>Steps:</div>
        {[
          'connect',
          'wait_connected',
          'wait_events',
          'restart_server',
          'wait_reconnect',
          'wait_connected',
          'wait_events',
          'restart_server',
          'wait_reconnect',
          'wait_connected',
          'wait_events',
          'assert_state',
          'assert_stats',
        ].map((s) => (
          <div key={s}>
            <span style={{ color: '#00ff88' }}>✓</span>{' '}
            <span style={{ color: '#9ca3af' }}>{s}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 p-2 rounded" style={{ background: 'rgba(0,255,136,0.05)' }}>
        <div className="font-bold" style={{ color: '#00ff88' }}>
          ✅ server-restart: PASSED
        </div>
      </div>
      <div className="mt-3" style={{ color: '#3b82f6' }}>
        Metrics:
      </div>
      <div className="ml-3">
        <div>
          <span style={{ color: '#9ca3af' }}>Duration:</span>{' '}
          <span style={{ color: '#e5e5e5' }}>3222ms</span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Events received:</span>{' '}
          <span style={{ color: '#e5e5e5' }}>8</span>
        </div>
      </div>
      <div className="my-3 p-4 rounded" style={{ border: '1px solid #1c1c1c' }}>
        <div className="text-center font-bold mb-2" style={{ color: '#9ca3af' }}>
          ━━━━━━━ SUMMARY ━━━━━━━
        </div>
        <div>
          <span style={{ color: '#00ff88' }}>✅ Passed:</span>{' '}
          <span className="font-bold" style={{ color: '#e5e5e5' }}>
            10
          </span>
        </div>
        <div>
          <span style={{ color: '#3b82f6' }}>📊 Total:</span>{' '}
          <span className="font-bold" style={{ color: '#e5e5e5' }}>
            10
          </span>
        </div>
        <div>
          <span style={{ color: '#fbbf24' }}>⏱ Duration:</span>{' '}
          <span className="font-bold" style={{ color: '#e5e5e5' }}>
            34081ms
          </span>
        </div>
        <div className="mt-3 text-center font-bold" style={{ color: '#00ff88' }}>
          🎉 ALL TESTS PASSED
        </div>
      </div>
    </>
  ),
};

export default function LiveTerminals() {
  const [active, setActive] = useState('server');
  const ActiveTab = tabs.find((t) => t.id === active);

  return (
    <section id="terminals" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-12"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 03 — LIVE OUTPUT
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Real terminal output.
            <br />
            Not screenshots.
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Every result below is actual output from the running system — server logs, client demos,
            Prometheus metrics, test results, and fault injection scenarios.
          </p>
        </motion.div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active === tab.id ? '#00ff88' : '#0f0f0f',
                color: active === tab.id ? '#080808' : '#9ca3af',
                border: '1px solid ' + (active === tab.id ? '#00ff88' : '#1c1c1c'),
              }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
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
            <span
              className="mono text-xs ml-3 flex items-center gap-2"
              style={{ color: '#6b7280' }}
            >
              <ActiveTab.icon size={12} />
              {ActiveTab.cmd}
            </span>
          </div>
          <div className="p-6 mono text-xs space-y-1 overflow-x-auto max-h-[600px] overflow-y-auto leading-relaxed">
            {content[active]}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
