import { motion } from "motion/react";

interface GalenOrbProps {
  active?: boolean;
  thinking?: boolean;
  compact?: boolean;
}

export function GalenOrb({ active = false, thinking = false, compact = false }: GalenOrbProps) {
  return (
    <motion.div
      className={`galen-orb ${active ? "galen-orb--active" : ""} ${thinking ? "galen-orb--thinking" : ""} ${compact ? "galen-orb--compact" : ""}`}
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 150, damping: 18 }}
      aria-hidden="true"
    >
      <span className="orb-halo orb-halo--four" />
      <span className="orb-halo orb-halo--three" />
      <span className="orb-halo orb-halo--two" />
      <span className="orb-halo orb-halo--one" />
      <span className="orb-core" />
    </motion.div>
  );
}


