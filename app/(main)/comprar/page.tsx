'use client';

import { useRouter } from 'next/navigation';
import BuyTicketsModal from '@/components/payments/BuyTicketsModal';

// Pantalla "Comprar más tickets" (accesible desde el menú del header):
// reutiliza el flujo completo de compra (tasa BCV, Pago Móvil,
// validación automática). Al cerrar, vuelve al juego.
export default function ComprarPage() {
  const router = useRouter();
  return (
    <main>
      <BuyTicketsModal open onClose={() => router.push('/game')} />
    </main>
  );
}
