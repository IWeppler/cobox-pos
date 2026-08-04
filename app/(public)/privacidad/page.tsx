import type { Metadata } from "next";
import { LegalLayout } from "@/features/legal/ui/legal-layout";

export const metadata: Metadata = {
  title: "Política de Privacidad | Comerz",
  description:
    "Cómo Comerz recopila, utiliza, comparte y protege los datos de los comercios que usan la plataforma.",
};

export default function PrivacidadPage() {
  return (
    <LegalLayout
      titulo="Política de Privacidad"
      descripcion="Esta política explica qué datos recopilamos, para qué los usamos, con quién los compartimos y qué derechos tenés sobre ellos."
      actualizado="4 de agosto de 2026"
    >
      <section>
        <h2>1. Responsable del tratamiento</h2>
        <p>
          Comerz, con domicilio en la ciudad de Tostado, provincia de Santa Fe,
          República Argentina, es el responsable del tratamiento de los datos
          personales recopilados a través de la plataforma.
        </p>
        <p>
          El tratamiento se realiza conforme a la Ley N.º 25.326 de Protección
          de los Datos Personales de la República Argentina y su normativa
          complementaria. Para cualquier consulta vinculada a esta política
          podés escribirnos a{" "}
          <a href="mailto:ignacionweppler@gmail.com">
            ignacionweppler@gmail.com
          </a>
          .
        </p>
        <p>
          Esta política se aplica a la plataforma Comerz, a su catálogo web
          público y a las comunicaciones que mantenemos con nuestros usuarios.
          Forma parte de nuestros <a href="/terminos">Términos y Condiciones</a>.
        </p>
      </section>

      <section>
        <h2>2. Datos que recopilamos</h2>
        <h3>Datos del usuario</h3>
        <ul>
          <li>Nombre y apellido.</li>
          <li>Dirección de correo electrónico.</li>
          <li>Número de WhatsApp o teléfono de contacto.</li>
          <li>
            Rol y permisos dentro del comercio (por ejemplo, administrador,
            encargado o vendedor).
          </li>
          <li>
            Datos de autenticación: la contraseña se almacena siempre cifrada
            mediante funciones de hash y nunca en texto plano; Comerz no puede
            verla ni recuperarla.
          </li>
        </ul>

        <h3>Datos del comercio</h3>
        <ul>
          <li>Nombre comercial y datos de identificación del negocio.</li>
          <li>Dirección, localidad y datos de contacto.</li>
          <li>Rubro, logotipo y preferencias de configuración.</li>
          <li>
            Datos de facturación necesarios para gestionar la suscripción.
          </li>
        </ul>

        <h3>Datos operativos</h3>
        <ul>
          <li>Productos, variantes, precios, costos e imágenes.</li>
          <li>Movimientos de stock y ajustes de inventario.</li>
          <li>Ventas, medios de pago, cajas y turnos.</li>
          <li>
            Clientes del comercio, cuentas corrientes y deudas, cuando el
            comercio decide cargarlos.
          </li>
          <li>Proveedores, remitos y órdenes de compra.</li>
          <li>Reportes e informes generados a partir de esa información.</li>
        </ul>

        <h3>Datos técnicos</h3>
        <ul>
          <li>Dirección IP.</li>
          <li>Tipo y versión de navegador, sistema operativo y dispositivo.</li>
          <li>
            Registros de actividad (logs): fecha y hora de acceso, acciones
            realizadas dentro de la plataforma y errores del sistema.
          </li>
          <li>
            Datos de uso agregados, como frecuencia de acceso y secciones
            utilizadas.
          </li>
        </ul>
        <p>
          No recopilamos datos sensibles en el sentido de la Ley 25.326 (origen
          racial o étnico, opiniones políticas, convicciones religiosas, salud o
          vida sexual) ni datos de tarjetas de crédito o débito: los pagos, en
          caso de realizarse en línea, se procesan íntegramente en la
          plataforma del proveedor de pagos correspondiente.
        </p>
      </section>

      <section>
        <h2>3. Para qué usamos los datos</h2>
        <p>Tratamos los datos con las siguientes finalidades:</p>
        <ul>
          <li>
            <strong>Prestar el servicio:</strong> crear y administrar cuentas,
            autenticar usuarios, aplicar permisos por rol, y permitir que el
            comercio registre y consulte su operación.
          </li>
          <li>
            <strong>Generar reportes:</strong> elaborar los informes y métricas
            que la plataforma pone a disposición de cada comercio sobre su
            propia actividad.
          </li>
          <li>
            <strong>Mejorar funcionalidades:</strong> entender cómo se usa la
            plataforma para corregir errores, optimizar el rendimiento y
            desarrollar nuevas prestaciones.
          </li>
          <li>
            <strong>Comunicaciones del servicio:</strong> enviar avisos
            operativos, cambios en los términos o en esta política,
            notificaciones de facturación, alertas de seguridad y respuestas de
            soporte. Estas comunicaciones son inherentes al servicio y no
            constituyen publicidad.
          </li>
          <li>
            <strong>Seguridad:</strong> prevenir, detectar e investigar accesos
            no autorizados, fraudes y usos indebidos, y auditar operaciones
            sensibles como cambios de precio, ajustes de stock y movimientos de
            caja.
          </li>
          <li>
            <strong>Cumplimiento legal:</strong> atender requerimientos de
            autoridades competentes y cumplir obligaciones contables,
            impositivas y regulatorias.
          </li>
        </ul>
        <p>
          Si en el futuro quisiéramos enviarte comunicaciones comerciales sobre
          otros productos o novedades, te pediremos tu consentimiento previo y
          podrás revocarlo en cualquier momento.
        </p>
      </section>

      <section>
        <h2>4. Datos de clientes cargados por el comercio</h2>
        <p>
          Cuando un comercio carga en la plataforma datos de sus propios
          clientes —nombre, teléfono, correo electrónico, cuenta corriente,
          historial de compras— ese comercio actúa como responsable de esos
          datos y Comerz los trata únicamente por su cuenta y siguiendo sus
          instrucciones, en carácter de prestador de servicios de tratamiento.
        </p>
        <p>En consecuencia, el comercio usuario es responsable de:</p>
        <ul>
          <li>
            Contar con la base legal o el consentimiento necesario para
            recolectar y cargar esos datos.
          </li>
          <li>
            Informar a sus clientes sobre el tratamiento de su información y
            sobre el uso de una plataforma de gestión.
          </li>
          <li>
            Atender los pedidos de acceso, rectificación o supresión que sus
            clientes le dirijan, para lo cual la plataforma le brinda las
            herramientas necesarias.
          </li>
          <li>
            Cargar únicamente los datos que resulten necesarios para su
            operación comercial.
          </li>
        </ul>
        <p>
          Comerz no utiliza los datos de los clientes de un comercio para
          finalidades propias, no los cruza entre comercios distintos ni los
          emplea con fines publicitarios.
        </p>
      </section>

      <section>
        <h2>5. Compartición de datos</h2>
        <p>
          <strong>Comerz no vende ni alquila datos personales.</strong> Tampoco
          los cede a terceros con fines publicitarios ni de elaboración de
          perfiles comerciales.
        </p>
        <p>
          Para poder funcionar, la plataforma se apoya en proveedores de
          servicios que pueden acceder a los datos estrictamente necesarios para
          cumplir su función, obligados por contrato a mantener la
          confidencialidad y a no usarlos con otro fin. Estas categorías son:
        </p>
        <ul>
          <li>
            <strong>Hosting e infraestructura web:</strong> alojamiento de la
            aplicación y entrega de contenido (actualmente Vercel Inc.).
          </li>
          <li>
            <strong>Base de datos, autenticación y almacenamiento de
            archivos:</strong> guarda de la información del comercio y gestión
            de credenciales (actualmente Supabase).
          </li>
          <li>
            <strong>Procesamiento de pagos:</strong> gestión del cobro de las
            suscripciones. Comerz no almacena datos completos de tarjetas.
          </li>
          <li>
            <strong>Correo electrónico y mensajería:</strong> envío de correos
            transaccionales, como verificación de cuenta o recuperación de
            contraseña.
          </li>
          <li>
            <strong>Analítica de uso:</strong> medición del uso y del
            rendimiento de la plataforma (actualmente Google Analytics y las
            herramientas de analítica y rendimiento de Vercel).
          </li>
        </ul>
        <p>
          Algunos de estos proveedores pueden alojar información en servidores
          ubicados fuera de la República Argentina. En esos casos procuramos que
          la transferencia se realice hacia jurisdicciones con protección
          adecuada o al amparo de cláusulas contractuales que garanticen un
          nivel de protección equivalente al de la normativa local.
        </p>
        <p>
          También podremos divulgar información cuando exista una orden de
          autoridad judicial o administrativa competente, o cuando sea necesario
          para ejercer o defender derechos.
        </p>
      </section>

      <section>
        <h2>6. Seguridad de la información</h2>
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger
          los datos frente a accesos no autorizados, pérdida, alteración o
          divulgación indebida. Entre ellas:
        </p>
        <ul>
          <li>
            Cifrado del tráfico entre el dispositivo del usuario y la plataforma
            mediante HTTPS/TLS, y cifrado de la información almacenada en
            reposo.
          </li>
          <li>
            Almacenamiento de contraseñas mediante funciones de hash: nunca se
            guardan en texto plano.
          </li>
          <li>
            Controles de acceso a nivel de base de datos que aíslan la
            información de cada comercio, de modo que un usuario solo accede a
            los datos del negocio al que pertenece.
          </li>
          <li>
            Gestión de permisos por rol dentro de cada comercio y registro
            auditable de las operaciones sensibles.
          </li>
          <li>
            Copias de seguridad periódicas y monitoreo de errores e incidentes.
          </li>
        </ul>
        <p>
          Ningún sistema es completamente invulnerable: no podemos garantizar
          una seguridad absoluta. Ante un incidente que afecte de manera
          significativa datos personales, notificaremos a los usuarios
          alcanzados y a la autoridad de control cuando corresponda, sin demora
          injustificada y con la información disponible sobre el alcance y las
          medidas adoptadas. La seguridad también depende del usuario: mantener
          la contraseña en reserva y no compartir el acceso es parte esencial de
          la protección.
        </p>
      </section>

      <section>
        <h2>7. Derechos sobre tus datos</h2>
        <p>
          Como titular de los datos, tenés derecho a acceder a la información
          que tenemos sobre vos, a solicitar su rectificación cuando sea
          inexacta o esté desactualizada, a pedir su supresión, a oponerte a
          determinados tratamientos y a solicitar una copia en un formato de uso
          común.
        </p>
        <p>
          Para ejercer estos derechos escribinos a{" "}
          <a href="mailto:ignacionweppler@gmail.com">
            ignacionweppler@gmail.com
          </a>{" "}
          desde la dirección registrada en tu cuenta. Responderemos el pedido de
          acceso dentro de los diez (10) días corridos y los de rectificación o
          supresión dentro de los cinco (5) días hábiles de acreditada la
          identidad, conforme a la Ley 25.326.
        </p>
        <p>
          Si sos cliente de un comercio que usa Comerz y querés ejercer tus
          derechos sobre los datos que ese comercio cargó, dirigí tu pedido
          directamente al comercio, que es el responsable de esa información.
          Podemos asistirlo técnicamente para atenderlo.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública, en su carácter de
          autoridad de aplicación de la Ley 25.326, tiene la atribución de
          atender las denuncias y reclamos que se interpongan respecto del
          incumplimiento de las normas sobre protección de datos personales.
        </p>
      </section>

      <section>
        <h2>8. Cookies y tecnologías similares</h2>
        <p>
          La plataforma utiliza cookies y tecnologías de almacenamiento local
          para funcionar correctamente. Distinguimos:
        </p>
        <ul>
          <li>
            <strong>Cookies necesarias:</strong> imprescindibles para mantener
            la sesión iniciada, recordar el negocio activo cuando un usuario
            pertenece a más de uno y conservar preferencias básicas como el tema
            visual. Sin ellas la plataforma no puede operar.
          </li>
          <li>
            <strong>Cookies de analítica y rendimiento:</strong> nos permiten
            entender de forma agregada cómo se usa la plataforma, qué secciones
            resultan más utilizadas y dónde se producen errores o demoras.
          </li>
          <li>
            <strong>Cookies de terceros:</strong> las que puedan instalar los
            proveedores mencionados en la sección 5 en el marco de sus propios
            servicios.
          </li>
        </ul>
        <p>
          Podés configurar tu navegador para bloquear o eliminar cookies, aunque
          hacerlo con las cookies necesarias impedirá iniciar sesión o utilizar
          la plataforma con normalidad. Si en el futuro incorporamos cookies con
          fines publicitarios o de perfilado, lo informaremos y solicitaremos tu
          consentimiento previo mediante un mecanismo específico.
        </p>
      </section>

      <section>
        <h2>9. Conservación de los datos</h2>
        <p>
          Conservamos la información mientras la cuenta se mantenga activa y
          durante el tiempo necesario para cumplir las finalidades descriptas en
          esta política.
        </p>
        <p>
          Cerrada o cancelada la cuenta, los datos del comercio se conservan
          durante noventa (90) días corridos, plazo durante el cual podés
          solicitar su exportación o la reactivación del servicio. Vencido ese
          plazo se eliminan o se anonimizan de forma irreversible.
        </p>
        <p>
          Se exceptúan los datos que debamos conservar por un plazo mayor para
          cumplir obligaciones legales, contables o impositivas, o para el
          ejercicio o la defensa de reclamos: en esos casos se conservan
          únicamente durante el tiempo que la normativa exija y con acceso
          restringido. Los registros técnicos (logs) se conservan por períodos
          acotados con fines de seguridad y diagnóstico.
        </p>
      </section>

      <section>
        <h2>10. Cambios en esta política</h2>
        <p>
          Podemos actualizar esta Política de Privacidad para reflejar cambios
          en la plataforma, en nuestros proveedores o en la normativa aplicable.
          La versión vigente es siempre la publicada en esta página, con su
          fecha de última actualización.
        </p>
        <p>
          Cuando los cambios sean sustanciales —por ejemplo, nuevas finalidades
          de tratamiento o nuevas categorías de datos— los notificaremos por
          correo electrónico o mediante un aviso dentro de la plataforma con una
          antelación razonable a su entrada en vigencia.
        </p>
      </section>

      <section>
        <h2>11. Contacto</h2>
        <p>
          Para consultas, reclamos o para ejercer tus derechos sobre tus datos
          personales, el canal oficial es{" "}
          <a href="mailto:ignacionweppler@gmail.com">
            ignacionweppler@gmail.com
          </a>
          . Procuramos responder toda comunicación dentro de los plazos legales
          y, en todos los casos, a la brevedad posible.
        </p>
      </section>
    </LegalLayout>
  );
}
