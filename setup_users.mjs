import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde .env.local
const envPath = path.resolve(__dirname, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

let supabaseUrl = '';
let supabaseAnonKey = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supabaseAnonKey = line.split('=')[1].trim();
});

if (!supabaseUrl || supabaseUrl === 'AQUI_TU_URL_DE_SUPABASE') {
  console.error('❌ ERROR: Falta la NEXT_PUBLIC_SUPABASE_URL en el archivo .env.local');
  console.log('Ve a Supabase -> Project Settings -> API y pega la URL en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createUsers() {
  console.log('🔄 Conectando a Supabase para crear usuarios...');

  // 1. Crear Administrador
  console.log('Creando Administrador...');
  const { data: adminData, error: adminErr } = await supabase.auth.signUp({
    email: 'admin@torneomental.com',
    password: 'Password123!',
    options: {
      data: {
        nombre: 'Admin',
        apellido: 'Principal',
        whatsapp: '+584140000000',
        cedula: 'V-00000000'
      }
    }
  });

  if (adminErr) {
    if (adminErr.message.includes('already registered')) {
       console.log('✅ El administrador ya estaba registrado.');
    } else {
       console.error('❌ Error creando Admin:', adminErr.message);
    }
  } else {
    // Esperar a que el trigger cree el profile
    await new Promise(r => setTimeout(r, 2000));
    // Asignar rol admin
    const { error: roleErr } = await supabase
      .from('profiles')
      .update({ role: 'admin', tickets_balance: 100 })
      .eq('id', adminData.user.id);
    
    if (roleErr) console.error('❌ Error asignando rol admin:', roleErr.message);
    else console.log('✅ Administrador creado con éxito.');
  }

  // Cerrar sesion del admin
  await supabase.auth.signOut();

  // 2. Crear Jugador de prueba
  console.log('Creando Jugador...');
  const { data: playerData, error: playerErr } = await supabase.auth.signUp({
    email: 'jugador@torneomental.com',
    password: 'Password123!',
    options: {
      data: {
        nombre: 'Jugador',
        apellido: 'Estrella',
        whatsapp: '+584241111111',
        cedula: 'V-11111111'
      }
    }
  });

  if (playerErr) {
    if (playerErr.message.includes('already registered')) {
       console.log('✅ El jugador ya estaba registrado.');
    } else {
       console.error('❌ Error creando Jugador:', playerErr.message);
    }
  } else {
    // Esperar a que el trigger cree el profile
    await new Promise(r => setTimeout(r, 2000));
    // Añadir tickets de prueba
    await supabase.from('profiles').update({ tickets_balance: 50 }).eq('id', playerData.user.id);
    console.log('✅ Jugador creado con éxito.');
  }

  console.log('🎉 Todo listo. Ya puedes correr: npm run dev');
  process.exit(0);
}

createUsers();
