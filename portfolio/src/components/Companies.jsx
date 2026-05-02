import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, ShoppingCart, Gamepad2, Radio, HeartPulse, Building2 } from 'lucide-react';

const industries = [
  {
    icon: TrendingUp,
    name: 'FinTech',
    useCase: 'Real-time stock prices, trading updates, portfolio sync',
    who: 'Robinhood · Stripe · Bloomberg',
  },
  {
    icon: ShoppingCart,
    name: 'E-Commerce',
    useCase: 'Live inventory, order tracking, price updates',
    who: 'Shopify · Amazon · eBay',
  },
  {
    icon: Gamepad2,
    name: 'Gaming & Sports',
    useCase: 'Live scores, match updates, leaderboards',
    who: 'ESPN · DraftKings · Twitch',
  },
  {
    icon: Radio,
    name: 'IoT & Monitoring',
    useCase: 'Sensor data, alerts, observability dashboards',
    who: 'Datadog · PagerDuty · Grafana',
  },
  {
    icon: HeartPulse,
    name: 'Healthcare',
    useCase: 'Patient vitals, appointment updates, lab results',
    who: 'Epic · Teladoc · Philips',
  },
  {
    icon: Building2,
    name: 'SaaS & Collaboration',
    useCase: 'Notifications, activity feeds, presence',
    who: 'Slack · Notion · Figma',
  },
];

export default function Companies() {
  return (
    <section id="companies" className="py-24" style={{ background: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16"
        >
          <div className="mono text-xs mb-4" style={{ color: '#00ff88' }}>
            // 06 — REAL-WORLD IMPACT
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
            Who benefits from this.
          </h2>
          <p className="text-lg" style={{ color: '#9ca3af' }}>
            Any company streaming real-time data needs reliability. This kit ships it.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {industries.map((ind, i) => (
            <motion.div
              key={ind.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="p-6 rounded-xl transition-all hover:-translate-y-1"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(0,255,136,0.1)' }}
                >
                  <ind.icon size={20} style={{ color: '#00ff88' }} />
                </div>
                <h3 className="text-lg font-bold text-white">{ind.name}</h3>
              </div>
              <p className="text-sm mb-4" style={{ color: '#9ca3af' }}>
                {ind.useCase}
              </p>
              <div
                className="mono text-xs pt-3"
                style={{ color: '#6b7280', borderTop: '1px solid #1c1c1c' }}
              >
                {ind.who}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
