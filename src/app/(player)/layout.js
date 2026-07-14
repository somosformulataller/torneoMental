import Navbar from '@/components/layout/Navbar';
import PageTransition from '@/components/layout/PageTransition';
import SoundToggle from '@/components/ui/SoundToggle';

export default function PlayerLayout({ children }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <PageTransition>{children}</PageTransition>
      <SoundToggle />
      <Navbar />
    </div>
  );
}
