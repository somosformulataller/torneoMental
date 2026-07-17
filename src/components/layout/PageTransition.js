'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { usePathname } from 'next/navigation';

// Fade-in al cambiar de vista. SIN AnimatePresence/exit a propósito: en App
// Router, `children` es el LayoutRouter (elemento estable que siempre pinta
// la vista ACTUAL), así que el "clon saliente" de AnimatePresence renderiza
// la misma vista nueva duplicada — dos páginas apiladas durante la salida,
// la altura del documento se duplica y se ve un rebote/flash en cada
// navegación. Con solo el fade de entrada la vista vieja se desmonta al
// instante y la nueva aparece suave, sin salto de layout.
export default function PageTransition({ children }) {
  const pathname = usePathname();
  // En el primer render (HTML del servidor) no se anima: el contenido debe
  // llegar visible, no arrancar en opacity 0 hasta que hidrate.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  return (
    <motion.div
      key={pathname}
      initial={hydrated ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
