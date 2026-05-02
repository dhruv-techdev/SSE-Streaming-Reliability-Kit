import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const screenshots = [
  {
    src: '/screenshots/Screenshot_2026-05-01_at_23_42_53.png',
    title: 'Server Start',
    desc: 'Fastify server with config display, structured JSON logging, connection registry',
  },
  {
    src: '/screenshots/Screenshot_2026-05-01_at_23_43_35.png',
    title: 'Client Demo',
    desc: 'State machine transitions, event flow with sequence numbers, verification summary',
  },
  {
    src: '/screenshots/Screenshot_2026-05-01_at_23_44_10.png',
    title: 'Prometheus Metrics',
    desc: 'Server uptime, active streams, disconnects, heartbeats, replay counters',
  },
  {
    src: '/screenshots/Screenshot_2026-05-01_at_23_45_42.png',
    title: 'Test Results',
    desc: '38 test files, 498 tests passing in 29.32s — unit, integration, harness',
  },
  {
    src: '/screenshots/Screenshot_2026-05-01_at_23_48_50.png',
    title: 'Fault Injection Harness',
    desc: '10 scenarios passed: liveness, reconnect, server-restart with step-by-step validation',
  },
];

export default function Screenshots() {
  const [selected, setSelected] = useState(null);

  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-white mb-4">See It In Action</h2>
          <p className="text-gray-400">Real terminal output from the running system.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {screenshots.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelected(s)}
              className="cursor-pointer group"
            >
              <div className="rounded-xl overflow-hidden border border-dark-600 group-hover:border-accent/50 transition">
                <div className="h-6 bg-dark-700 flex items-center px-3 gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <img src={s.src} alt={s.title} className="w-full" />
              </div>
              <div className="mt-3">
                <div className="font-medium text-white">{s.title}</div>
                <div className="text-sm text-gray-500">{s.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          >
            <button onClick={() => setSelected(null)} className="absolute top-6 right-6 text-white">
              <X size={32} />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={selected.src}
              alt={selected.title}
              className="max-w-full max-h-[90vh] rounded-xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
