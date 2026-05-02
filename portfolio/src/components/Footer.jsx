import React from 'react';
import { Github, Linkedin, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="py-16 border-t" style={{ background: '#0a0a0a', borderColor: '#1c1c1c' }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-lg font-bold mb-1">
              <span style={{ color: '#00ff88' }}>SSE</span>
              <span className="text-white">Kit</span>
              <span className="mono text-xs ml-2" style={{ color: '#6b7280' }}>
                v1.0.0
              </span>
            </div>
            <div className="text-sm" style={{ color: '#6b7280' }}>
              Built by Dhruv Patel · All Rights Reserved
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit"
              target="_blank"
              className="p-2.5 rounded-lg transition-all hover:opacity-80"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c', color: '#9ca3af' }}
            >
              <Github size={18} />
            </a>
            <a
              href="https://www.linkedin.com/in/dhruv-patel-20b959288"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded-lg transition-all hover:opacity-80"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c', color: '#9ca3af' }}
            >
              <Linkedin size={18} />
            </a>
            <a
              href="mailto:dhruvpatel@example.com"
              className="p-2.5 rounded-lg transition-all hover:opacity-80"
              style={{ background: '#0f0f0f', border: '1px solid #1c1c1c', color: '#9ca3af' }}
            >
              <Mail size={18} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
