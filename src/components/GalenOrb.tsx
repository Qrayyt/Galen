import { motion } from "motion/react";
import galenLogo from "../assets/galen.svg";

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
      <span className="orb-aura orb-aura--outer" />
      <span className="orb-aura orb-aura--inner" />
      <img src={galenLogo} alt="" />
    </motion.div>
  );
}

