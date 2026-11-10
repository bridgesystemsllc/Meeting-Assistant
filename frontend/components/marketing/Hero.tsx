"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-violet/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <p className="text-violet font-semibold text-sm uppercase tracking-widest mb-6">AI-Powered Meeting Intelligence</p>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.9] mb-8">
            Every meeting.<br /><span className="text-violet">Every action item.</span><br />Handled.
          </h1>
        </motion.div>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          AI joins your meetings, records every word, and delivers structured notes with action items, decisions, and risks — before you finish your coffee.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <Link href="/signup" className="btn-violet text-base px-8 py-4">Start Free Trial</Link>
          <button className="btn-cyan-outline text-base px-8 py-4">Watch Demo</button>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }} className="flex items-center justify-center gap-6 text-text-muted text-sm">
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Zoom</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-positive" /> Google Meet</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-violet" /> Microsoft Teams</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 60, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1, delay: 0.6, ease: "easeOut" }} className="mt-20 relative">
          <div className="absolute inset-0 bg-violet/5 rounded-2xl blur-3xl" />
          <div className="relative bg-surface border border-border-subtle rounded-2xl p-2 shadow-elevated">
            <div className="bg-elevated rounded-xl h-[300px] md:h-[500px] flex items-center justify-center text-text-muted">
              <p className="text-sm">Product Screenshot Placeholder</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
