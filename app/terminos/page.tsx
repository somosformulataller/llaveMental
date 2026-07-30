import Link from 'next/link';

export const metadata = {
  title: 'Términos y Condiciones · La Llave Correcta',
};

// Términos y condiciones del juego (página pública, enlazada desde
// el formulario de registro).
export default function TerminosPage() {
  return (
    <main className="terms-page">
      <div className="terms-card">
        <Link href="/auth/login" className="auth-back">
          ← Volver
        </Link>
        <h1 className="terms-title">🗝️ Términos y Condiciones</h1>
        <p className="terms-updated">La Llave Correcta · Última actualización: 30 de julio de 2026</p>

        <section>
          <h2>1. Aceptación</h2>
          <p>
            Al registrarte y usar La Llave Correcta (en adelante, «la plataforma») aceptas
            íntegramente estos términos y condiciones. Si no estás de acuerdo con alguno de
            ellos, no debes usar la plataforma.
          </p>
        </section>

        <section>
          <h2>2. Qué es La Llave Correcta</h2>
          <p>
            La Llave Correcta es un juego de entretenimiento con premios en dinero. En cada
            partida el jugador elige llaves para intentar abrir una cerradura: el resultado de
            cada partida se decide en el servidor mediante un sistema aleatorio, antes de que el
            jugador elija su primera llave. Ninguna acción del jugador altera la probabilidad
            del resultado.
          </p>
        </section>

        <section>
          <h2>3. Requisitos para jugar</h2>
          <ul>
            <li>Ser mayor de 18 años.</li>
            <li>Registrarte con datos verdaderos (nombre, apellido, correo, WhatsApp y cédula).</li>
            <li>Tener una sola cuenta por persona. Las cuentas duplicadas pueden ser bloqueadas o eliminadas.</li>
          </ul>
        </section>

        <section>
          <h2>4. Tickets y precios</h2>
          <ul>
            <li>Cada partida consume 1 ticket. El precio del ticket es de $2.00 (dos dólares estadounidenses).</li>
            <li>
              Los tickets se compran mediante Pago Móvil en bolívares, a la tasa oficial del BCV
              vigente al momento de la compra.
            </li>
            <li>
              La compra se acredita al validarse el pago contra el banco. Si la validación
              automática no es posible, un administrador la revisará manualmente.
            </li>
            <li>Los tickets no son transferibles ni reembolsables en dinero.</li>
            <li>Cada número de referencia de pago es único y solo puede usarse una vez.</li>
          </ul>
        </section>

        <section>
          <h2>5. Premios, saldo y retiros</h2>
          <ul>
            <li>Los premios de cada partida van de $0.00 a $10.00 y se acreditan al saldo de la billetera.</li>
            <li>El saldo puede canjearse por tickets (1 ticket = $2.00) o retirarse por Pago Móvil.</li>
            <li>El retiro mínimo es de $1.00 y se procesa un retiro a la vez, en bolívares a la tasa BCV.</li>
            <li>
              Para retirar, el jugador debe registrar sus datos de Pago Móvil (nombre, banco,
              cédula y teléfono). Los pagos se hacen únicamente a cuentas a nombre del jugador.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Juego responsable</h2>
          <p>
            La Llave Correcta es un juego de azar pensado como entretenimiento. Juega solo con
            dinero que puedas permitirte gastar. El juego está diseñado para que, en promedio,
            la plataforma retenga un porcentaje de lo apostado: ganar no está garantizado.
          </p>
        </section>

        <section>
          <h2>7. Conducta y bloqueo de cuentas</h2>
          <p>
            La plataforma puede bloquear o eliminar cuentas en casos de fraude o intento de
            fraude (por ejemplo, referencias de pago falsas o repetidas, uso de múltiples
            cuentas, o abuso del sistema de validación). Una cuenta bloqueada no puede jugar,
            comprar, canjear ni retirar, pero conserva acceso al chat de soporte para aclarar
            su situación.
          </p>
        </section>

        <section>
          <h2>8. Datos personales</h2>
          <p>
            Los datos del registro (nombre, apellido, correo, WhatsApp y cédula) se usan solo
            para operar la plataforma: validar pagos, procesar retiros y contactarte por
            soporte. No se venden ni se comparten con terceros, salvo obligación legal.
          </p>
        </section>

        <section>
          <h2>9. Disponibilidad y cambios</h2>
          <p>
            La plataforma puede suspenderse temporalmente por mantenimiento. Estos términos
            pueden actualizarse; los cambios rigen desde su publicación en esta página. El uso
            continuado de la plataforma implica la aceptación de los términos vigentes.
          </p>
        </section>

        <section>
          <h2>10. Contacto</h2>
          <p>
            Para cualquier duda o reclamo, usa el chat de atención al cliente dentro de la
            aplicación (burbuja 💬): es el canal oficial de soporte.
          </p>
        </section>
      </div>
    </main>
  );
}
