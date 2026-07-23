'use client';

import { useState } from 'react';
import styles from './copyPayoutButton.module.css';

// Arma el texto de los datos de Pago Móvil de un jugador para copiarlo de una.
function buildText(d) {
  const lines = [];
  if (d?.payout_nombre) lines.push(`Nombre: ${d.payout_nombre}`);
  if (d?.payout_banco) lines.push(`Banco: ${d.payout_banco}`);
  if (d?.payout_cedula) lines.push(`Cédula: ${d.payout_cedula}`);
  if (d?.payout_telefono) lines.push(`Teléfono: ${d.payout_telefono}`);
  return lines.join('\n');
}

// Botón para copiar al portapapeles los datos de Pago Móvil del jugador, para
// pegarlos al hacer el pago. Se usa donde se muestren esos datos (Transacciones).
export default function CopyPayoutButton({ data }) {
  const [copied, setCopied] = useState(false);
  const text = buildText(data);
  if (!text) return null;

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Respaldo para navegadores/contextos sin Clipboard API.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      alert('No se pudo copiar. Copia los datos a mano.');
    }
  }

  return (
    <button type="button" className={`${styles.btn} ${copied ? styles.copied : ''}`} onClick={copy}>
      {copied ? '✓ Copiado' : '📋 Copiar datos'}
    </button>
  );
}
