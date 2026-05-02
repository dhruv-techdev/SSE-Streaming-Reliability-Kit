import React from 'react';
import { motion } from 'framer-motion';

const stack = [
  { category: 'Runtime', items: ['Node.js 18+', 'ES Modules'] },
  { category: 'Server', items: ['Fastify', 'SSE Protocol'] },
  { category: 'Testing', items: ['Vitest', 'Custom Harness'] },
  { category: 'CI/CD', items: ['GitHub Actions', 'ESLint', 'Prettier'] },
  { category: 'Observability', items: ['Prometheus', 'JSON Logging'] },
  { category: 'Docs', items: ['Markdown', 'JSDoc', 'Runbook'] },
];

export default function TechStack() {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 07 — TECH STACK
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Built with proven tools.
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {stack.map((s, i) => (
            <motion.div
              key={s.category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-5 rounded-xl"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <div className="mono text-xs font-semibold mb-3" style={{ color: '#00ff88' }}>
                {s.category}
              </div>
              {s.items.map((item) => (
                <div key={item} className="text-sm py-0.5" style={{ color: '#e5e5e5' }}>
                  {item}
                </div>
              ))}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
