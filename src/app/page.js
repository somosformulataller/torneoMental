import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirigir siempre a login, el middleware se encargará de llevar al
  // usuario a /home si ya está autenticado.
  redirect('/login');
}
