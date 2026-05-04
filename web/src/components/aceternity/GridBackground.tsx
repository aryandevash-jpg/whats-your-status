import { motion } from "framer-motion";

/** Aceternity-style ambient grid + soft gradient orbs (decorative only). */
export function GridBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,hsl(217_33%_17%/0.45)_1px,transparent_1px),linear-gradient(to_bottom,hsl(217_33%_17%/0.45)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_0%,#000_45%,transparent_100%)]"
        aria-hidden
      />
      <motion.div
        className="absolute -left-[10%] top-[-10%] h-[min(55vw,480px)] w-[min(55vw,480px)] rounded-full bg-primary/25 blur-[100px]"
        animate={{ opacity: [0.25, 0.4, 0.25], scale: [1, 1.05, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="absolute -right-[5%] bottom-[0%] h-[min(45vw,400px)] w-[min(45vw,400px)] rounded-full bg-accent/20 blur-[110px]"
        animate={{ opacity: [0.2, 0.38, 0.2], scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        aria-hidden
      />
    </div>
  );
}
