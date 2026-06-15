import React, { useState, useEffect } from 'react';
import { Menu, X, Github, Linkedin } from 'lucide-react';

const links = [
  { name: 'Problem', href: '#problem' },
  { name: 'Solution', href: '#solution' },
  { name: 'Features', href: '#features' },
  { name: 'Results', href: '#stats' },
  { name: 'Companies', href: '#companies' },
  { name: 'Use Cases', href: '#open-source' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all ${scrolled ? 'bg-dark-900/95 backdrop-blur border-b border-dark-600' : ''}`}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" className="text-xl font-bold">
          SSE<span className="text-accent">Kit</span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.href}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              {l.name}
            </a>
          ))}
          <a
            href="https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-dark-600 hover:bg-dark-700 rounded-lg text-sm transition"
          >
            <Github size={16} /> GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/dhruv-patel-20b959288"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-dark-600 hover:bg-dark-700 rounded-lg text-sm transition"
          >
            <Linkedin size={16} /> LinkedIn
          </a>
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="md:hidden bg-dark-800 border-t border-dark-600">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-6 py-3 text-gray-400 hover:bg-dark-700"
            >
              {l.name}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
