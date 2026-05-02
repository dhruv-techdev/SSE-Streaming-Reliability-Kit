import React from 'react';
import { motion } from 'framer-motion';
import { Server, Wifi, Database, BarChart3 } from 'lucide-react';

export default function About() {
  return (
    <section id="about" className="py-24 border-t border-dark-700">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl"
        >
          <h2 className="text-3xl font-bold text-white mb-6">What is this project?</h2>
          <p className="text-gray-400 text-lg mb-6">
            <strong className="text-white">SSE Streaming Reliability Kit</strong> is a
            production-grade Server-Sent Events toolkit built from scratch. It solves the hard
            problems of real-time streaming: connection drops, event loss, duplicate processing, and
            silent failures.
          </p>
          <p className="text-gray-400 mb-8">
            Built over <strong className="text-white">28 user stories</strong> with{' '}
            <strong className="text-white">243 requirements</strong>, featuring a complete test
            suite, fault injection harness, CI/CD pipeline, and operational runbook.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: Server,
                label: 'Fastify SSE Server',
                desc: 'Connection registry, replay buffer, heartbeats',
              },
              {
                icon: Wifi,
                label: 'Resilient Client',
                desc: 'Auto-reconnect, resume, state machine',
              },
              {
                icon: Database,
                label: 'Full Observability',
                desc: 'Prometheus metrics, structured logging',
              },
              {
                icon: BarChart3,
                label: 'Fault Injection',
                desc: '10 scenarios testing all failure modes',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex gap-4 p-4 bg-dark-800 rounded-lg border border-dark-600"
              >
                <item.icon className="text-accent shrink-0" size={24} />
                <div>
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="text-sm text-gray-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
