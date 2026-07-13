import Navbar from '@/components/layout/Navbar';

export default function PlayerLayout({ children }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {children}
      <Navbar />
    </div>
  );
}
