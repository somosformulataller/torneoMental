import PageTransition from '@/components/layout/PageTransition';
import SoundToggle from '@/components/ui/SoundToggle';
import ActivityTracker from '@/components/ui/ActivityTracker';

// El menú inferior (Navbar) se eliminó: ahora se navega a Competir/Practicar/
// Ranking/Billetera desde los botones del Inicio, y cada pantalla tiene su
// propio botón para regresar al Inicio (BackToHome).
export default function PlayerLayout({ children }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <ActivityTracker />
      <PageTransition>{children}</PageTransition>
      <SoundToggle />
    </div>
  );
}
