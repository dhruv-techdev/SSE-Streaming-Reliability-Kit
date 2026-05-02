import React from 'react';
import { motion } from 'framer-motion';

const stats = [
  { value: '498', label: 'Tests Passing', sub: 'Across 38 files' },
  { value: '243', label: 'Requirements', sub: 'Fully traced' },
  { value: '28', label: 'User Stories', sub: 'Complete' },
  { value: '10/10', label: 'Fault Scenarios', sub: '34s execution' },
  { value: '29.32s', label: 'Test Duration', sub: 'Fast feedback' },
  { value: '0', label: 'Test Failures', sub: 'All green' },
];

export default function Stats() {
  return (
    <section id="stats" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 05 — BY THE NUMBERS
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Numbers that matter.
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Quantifiable quality. Every metric verified by automated tests.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-6 rounded-xl text-center transition-all hover:-translate-y-1"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <div className="text-3xl font-extrabold mb-1" style={{ color: '#00ff88' }}>
                {s.value}
              </div>
              <div className="font-semibold text-white text-sm">{s.label}</div>
              <div className="mono text-xs mt-1" style={{ color: '#6b7280' }}>
                {s.sub}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
