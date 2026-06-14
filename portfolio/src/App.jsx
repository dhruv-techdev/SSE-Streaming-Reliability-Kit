import React from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Problem from './components/Problem';
import Solution from './components/Solution';
import LiveTerminals from './components/LiveTerminals';
import Features from './components/Features';
import Stats from './components/Stats';
import Companies from './components/Companies';
import TechStack from './components/TechStack';
import OpenSource from './components/OpenSource';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: '#080808' }}>
      <Nav />
      <Hero />
      <Problem />
      <Solution />
      <LiveTerminals />
      <Features />
      <Stats />
      <Companies />
      <TechStack />
      <OpenSource />
      <Footer />
    </div>
  );
}
