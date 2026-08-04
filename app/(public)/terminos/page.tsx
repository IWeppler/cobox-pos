import type { Metadata } from "next";
import { LegalLayout } from "@/features/legal/ui/legal-layout";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Comerz",
  description:
    "Condiciones de uso de Comerz, la plataforma de gestión y punto de venta para comercios.",
};

export default function TerminosPage() {
  return (
    <LegalLayout
      titulo="Términos y Condiciones"
      descripcion="Estas condiciones regulan el acceso y el uso de Comerz. Te pedimos que las leas con atención antes de crear tu cuenta."
      actualizado="4 de agosto de 2026"
    >
      <section>
        <h2>1. Introducción</h2>
        <p>
          Comerz es una plataforma web de gestión comercial y punto de venta
          (POS) desarrollada y operada desde la ciudad de Tostado, provincia de
          Santa Fe, República Argentina (en adelante, «Comerz», «la plataforma»
          o «nosotros»). Estos Términos y Condiciones (en adelante, «los
          Términos») constituyen un acuerdo entre Comerz y la persona humana o
          jurídica que crea una cuenta y utiliza el servicio (en adelante, «el
          Usuario», «vos» o «el comercio»).
        </p>
        <p>
          Comerz brinda un servicio de software como servicio (SaaS): una
          aplicación accesible desde un navegador web que permite a un comercio
          administrar su operación diaria. Entre otras funciones, la plataforma
          permite cargar y organizar el catálogo de productos, controlar el
          stock y sus variantes, registrar ventas y medios de pago, gestionar la
          caja y los turnos de cada vendedor, administrar clientes y cuentas
          corrientes, cargar remitos y órdenes de compra, y consultar reportes
          sobre la actividad del negocio. Comerz también puede publicar un
          catálogo web público del comercio, cuando el comercio decide
          habilitarlo.
        </p>
        <p>
          Comerz está dirigido a comercios y emprendimientos que necesiten
          administrar su actividad. Pueden utilizarlo:
        </p>
        <ul>
          <li>
            Personas humanas mayores de 18 años con capacidad legal para
            contratar.
          </li>
          <li>
            Personas jurídicas, a través de un representante con facultades
            suficientes para obligarlas.
          </li>
          <li>
            Las personas que el titular de un comercio invite a la plataforma
            (por ejemplo, encargados o vendedores), dentro de los permisos que
            ese titular les asigne.
          </li>
        </ul>
        <p>
          Comerz no está destinado a menores de edad ni a usos personales ajenos
          a una actividad comercial.
        </p>
      </section>

      <section>
        <h2>2. Aceptación de los Términos</h2>
        <p>
          Al crear una cuenta, solicitar el alta de un comercio, o utilizar la
          plataforma de cualquier forma, el Usuario declara que:
        </p>
        <ul>
          <li>Leyó, entendió y acepta estos Términos en su totalidad.</li>
          <li>
            Leyó y acepta nuestra <a href="/privacidad">Política de Privacidad</a>
            , que forma parte integrante de este acuerdo.
          </li>
          <li>
            Cuenta con la capacidad legal necesaria para obligarse conforme a
            estos Términos y, si actúa en nombre de una persona jurídica, con
            facultades suficientes para representarla.
          </li>
          <li>
            La información que suministra es verdadera, exacta y se encuentra
            actualizada.
          </li>
        </ul>
        <p>
          Si no estás de acuerdo con alguno de estos puntos, no debés utilizar
          la plataforma.
        </p>
      </section>

      <section>
        <h2>3. Cuenta de Usuario</h2>
        <p>
          Para operar en Comerz es necesario contar con una cuenta. El Usuario
          se compromete a brindar información verdadera y completa al momento de
          registrarse y a mantenerla actualizada, en particular su dirección de
          correo electrónico y su número de contacto, que son los canales por
          los que Comerz le comunica cuestiones relativas al servicio.
        </p>
        <p>
          Las credenciales de acceso son personales e intransferibles. El
          Usuario es el único responsable de resguardarlas y de toda la
          actividad que se realice desde su cuenta. En particular:
        </p>
        <ul>
          <li>
            No debe compartir su usuario ni su contraseña con terceros, ni
            siquiera con otras personas del mismo comercio. Cuando otra persona
            necesite acceso, debe dársele su propia cuenta con el rol que
            corresponda.
          </li>
          <li>
            Debe notificar a Comerz de inmediato ante cualquier uso no
            autorizado o sospecha de que sus credenciales fueron comprometidas.
          </li>
          <li>
            Es responsable de administrar los permisos de las personas que
            invita a su comercio y de dar de baja los accesos que ya no
            correspondan.
          </li>
        </ul>
        <p>
          Comerz registra ciertas operaciones sensibles —cambios de precio,
          ajustes de stock, aperturas y cierres de caja, entre otras— asociadas
          al usuario que las realizó. Ese registro existe para dar trazabilidad
          al comercio, y su utilidad depende de que cada persona use su propia
          cuenta.
        </p>
        <p>
          El Usuario puede solicitar en cualquier momento la eliminación de su
          cuenta escribiendo a{" "}
          <a href="mailto:ignacionweppler@gmail.com">
            ignacionweppler@gmail.com
          </a>
          , conforme a lo previsto en la sección 10.
        </p>
      </section>

      <section>
        <h2>4. Uso del servicio</h2>
        <h3>Usos permitidos</h3>
        <p>
          El Usuario puede utilizar Comerz para gestionar su propio comercio y,
          en ese marco, entre otras acciones:
        </p>
        <ul>
          <li>Cargar y administrar productos, variantes, precios y stock.</li>
          <li>Registrar ventas, cobros, medios de pago y movimientos de caja.</li>
          <li>Administrar clientes, cuentas corrientes y deudas.</li>
          <li>Cargar remitos y órdenes de compra de sus proveedores.</li>
          <li>Consultar reportes e informes sobre su propia actividad.</li>
          <li>
            Publicar su catálogo web, cuando la funcionalidad esté habilitada
            para su comercio.
          </li>
          <li>
            Invitar colaboradores y asignarles roles y permisos dentro de su
            comercio.
          </li>
        </ul>
        <h3>Usos no permitidos</h3>
        <p>Queda expresamente prohibido:</p>
        <ul>
          <li>
            Utilizar la plataforma para actividades ilegales, fraudulentas o
            contrarias a la normativa vigente, incluyendo la comercialización de
            bienes cuya venta esté prohibida o restringida.
          </li>
          <li>
            Intentar vulnerar la seguridad de la plataforma, acceder a datos de
            otros comercios, eludir los controles de acceso o permisos, o probar
            la infraestructura sin autorización previa y por escrito.
          </li>
          <li>
            Extraer datos de forma masiva o automatizada mediante scraping,
            bots, ingeniería inversa o cualquier método no previsto por la
            plataforma.
          </li>
          <li>
            Revender, sublicenciar o poner el servicio a disposición de terceros
            ajenos al comercio titular de la cuenta.
          </li>
          <li>
            Introducir software malicioso o realizar acciones que degraden o
            interrumpan el funcionamiento del servicio para otros usuarios.
          </li>
          <li>
            Cargar contenido que infrinja derechos de terceros o que resulte
            ofensivo, difamatorio o ilícito.
          </li>
        </ul>
        <p>
          El incumplimiento de estas condiciones habilita a Comerz a suspender o
          dar de baja la cuenta, con o sin aviso previo según la gravedad del
          caso, y sin perjuicio de las acciones legales que correspondan.
        </p>
      </section>

      <section>
        <h2>5. Planes, pagos y suscripciones</h2>
        <p>
          Comerz se ofrece bajo la modalidad de suscripción. Los planes
          disponibles, sus funcionalidades y sus precios son los que Comerz
          publique en su sitio o comunique al Usuario al momento de la
          contratación, y pueden variar según la cantidad de usuarios, de
          sucursales o de funcionalidades incluidas. Comerz puede ofrecer
          períodos de prueba o condiciones promocionales, cuyo alcance y
          duración se informan en cada caso.
        </p>
        <p>
          Salvo que se acuerde otra cosa por escrito, la suscripción se abona de
          forma periódica y por adelantado, en la periodicidad informada al
          contratar (por ejemplo, mensual o anual). Los precios se expresan en
          pesos argentinos e incluyen los impuestos que resulten aplicables,
          salvo indicación en contrario.
        </p>
        <p>
          Comerz puede modificar sus precios. Todo cambio se comunicará al
          Usuario con una antelación mínima de treinta (30) días corridos a
          través del correo electrónico registrado o dentro de la propia
          plataforma, y regirá a partir del siguiente período de facturación. Si
          el Usuario no acepta el nuevo precio, puede cancelar su suscripción
          antes de que entre en vigencia, sin penalidad alguna.
        </p>
        <p>
          La falta de pago habilita a Comerz a suspender el acceso a la cuenta
          luego de notificarlo al Usuario y otorgarle un plazo razonable para
          regularizar la situación. Durante la suspensión los datos se conservan
          conforme a la sección 10.
        </p>
        <p>
          El Usuario puede cancelar su suscripción en cualquier momento. La
          cancelación surte efecto al finalizar el período ya abonado: hasta esa
          fecha el servicio se mantiene activo y no se generan cargos
          posteriores. Salvo disposición legal en contrario, los importes
          correspondientes a períodos ya iniciados no son reintegrables. Antes
          de que la cuenta se cierre, el Usuario puede solicitar una copia de
          sus datos según la sección 6.
        </p>
      </section>

      <section>
        <h2>6. Almacenamiento y datos del comercio</h2>
        <p>
          Todos los datos que el Usuario carga en la plataforma —productos,
          precios, stock, ventas, clientes, proveedores, cuentas corrientes,
          imágenes y cualquier otro contenido propio— siguen siendo{" "}
          <strong>propiedad del Usuario</strong>. Comerz no adquiere ningún
          derecho sobre ellos más allá de lo estrictamente necesario para
          prestar el servicio.
        </p>
        <p>
          Comerz utiliza esos datos únicamente para operar, mantener, asegurar y
          mejorar la plataforma, y para brindar soporte cuando el Usuario lo
          solicita. Comerz no comercializa los datos de sus usuarios ni los cede
          a terceros con fines publicitarios. Si Comerz elaborara métricas
          agregadas sobre el uso de la plataforma, lo hará de forma que no
          permita identificar a un comercio, a una persona ni a sus clientes.
        </p>
        <p>
          El Usuario puede solicitar una copia de sus datos en un formato de uso
          común escribiendo al correo de contacto. El tratamiento de datos
          personales se rige, además, por la{" "}
          <a href="/privacidad">Política de Privacidad</a>.
        </p>
      </section>

      <section>
        <h2>7. Disponibilidad del servicio</h2>
        <p>
          Comerz trabaja para que la plataforma esté disponible de manera
          continua, pero no garantiza una disponibilidad absoluta ni un
          funcionamiento libre de errores o interrupciones. El servicio puede
          verse afectado por:
        </p>
        <ul>
          <li>
            Tareas de mantenimiento, actualizaciones o mejoras, que procuraremos
            realizar en horarios de baja actividad y anunciar con antelación
            cuando sean planificadas.
          </li>
          <li>
            Fallas de proveedores de infraestructura, conectividad o servicios
            de terceros de los que la plataforma depende.
          </li>
          <li>
            Casos fortuitos o de fuerza mayor, cortes de energía, incidentes de
            seguridad o cualquier otra circunstancia ajena a nuestro control
            razonable.
          </li>
        </ul>
        <p>
          Comerz puede además modificar, agregar o discontinuar funcionalidades
          para mejorar el producto. Si una modificación afecta de forma
          sustancial y negativa el uso del servicio contratado, se notificará al
          Usuario con antelación razonable.
        </p>
        <p>
          Recomendamos al Usuario contar con un procedimiento alternativo para
          registrar sus operaciones ante una eventual falta de conectividad o
          indisponibilidad temporal del servicio.
        </p>
      </section>

      <section>
        <h2>8. Propiedad intelectual</h2>
        <p>
          La marca «Comerz», su logotipo, su diseño, su interfaz, su código
          fuente, su documentación, sus textos y todo otro elemento que compone
          la plataforma son de titularidad exclusiva de Comerz y se encuentran
          protegidos por la legislación argentina e internacional sobre
          propiedad intelectual e industrial.
        </p>
        <p>
          Estos Términos otorgan al Usuario una licencia de uso limitada, no
          exclusiva, intransferible y revocable sobre la plataforma, mientras la
          suscripción se encuentre vigente y con el solo fin de gestionar su
          comercio. No se transfiere ningún otro derecho.
        </p>
        <p>En particular, el Usuario no puede:</p>
        <ul>
          <li>
            Copiar, modificar, adaptar, traducir o crear obras derivadas de la
            plataforma o de su código.
          </li>
          <li>
            Descompilar, desensamblar o aplicar ingeniería inversa sobre el
            software.
          </li>
          <li>
            Utilizar la marca, el logotipo o los elementos de diseño de Comerz
            sin autorización previa y por escrito.
          </li>
        </ul>
        <p>
          El contenido que el Usuario carga (por ejemplo, sus imágenes de
          producto o sus textos) sigue siendo suyo. Al publicarlo en el catálogo
          web, el Usuario autoriza a Comerz a alojarlo y mostrarlo con el único
          fin de prestar esa funcionalidad.
        </p>
      </section>

      <section>
        <h2>9. Limitación de responsabilidad</h2>
        <p>
          Comerz es una herramienta de gestión. Su función es registrar,
          organizar y mostrar la información que el propio comercio ingresa. En
          consecuencia, Comerz <strong>no garantiza</strong>:
        </p>
        <ul>
          <li>
            Un aumento de las ventas, de la rentabilidad ni de ningún otro
            resultado comercial.
          </li>
          <li>
            La exactitud, veracidad o integridad de la información cargada por
            los usuarios, incluidos precios, costos, stock, datos de clientes y
            comprobantes.
          </li>
          <li>
            La corrección de las decisiones comerciales, contables, impositivas
            o financieras que el Usuario tome a partir de los datos o reportes
            de la plataforma.
          </li>
          <li>
            El cumplimiento, por parte del Usuario, de sus obligaciones fiscales
            y regulatorias, que son de su exclusiva responsabilidad.
          </li>
        </ul>
        <p>
          En la máxima medida permitida por la ley, Comerz no responde por daños
          indirectos, lucro cesante, pérdida de chance ni pérdida de datos
          derivados del uso o de la imposibilidad de uso de la plataforma. La
          responsabilidad total de Comerz frente al Usuario, por cualquier
          concepto, se limita al monto efectivamente abonado por el Usuario en
          concepto de suscripción durante los seis (6) meses anteriores al hecho
          que origine el reclamo.
        </p>
        <p>
          Nada de lo aquí previsto limita la responsabilidad de Comerz por dolo
          o culpa grave, ni los derechos que la normativa de defensa del
          consumidor reconozca de manera irrenunciable.
        </p>
      </section>

      <section>
        <h2>10. Cancelación y eliminación de la cuenta</h2>
        <p>
          El Usuario puede cancelar su suscripción desde la plataforma o
          escribiendo a{" "}
          <a href="mailto:ignacionweppler@gmail.com">
            ignacionweppler@gmail.com
          </a>{" "}
          desde la dirección registrada en su cuenta. La cancelación surte
          efecto al finalizar el período abonado.
        </p>
        <p>
          Cerrada o cancelada la cuenta, los datos del comercio se conservan
          durante <strong>noventa (90) días corridos</strong>, plazo durante el
          cual el Usuario puede solicitar su exportación o la reactivación del
          servicio. Vencido ese plazo, los datos se eliminan o se anonimizan de
          forma irreversible, salvo aquellos que debamos conservar por
          obligaciones legales, contables o impositivas, o para el ejercicio o
          la defensa de reclamos, durante el tiempo que la ley exija.
        </p>
        <p>
          El Usuario puede solicitar la eliminación anticipada de sus datos. En
          ese caso se procederá a la baja dentro de los treinta (30) días de
          recibida la solicitud, con las mismas salvedades indicadas. La
          eliminación es definitiva y no puede revertirse.
        </p>
        <p>
          Comerz puede suspender o dar de baja una cuenta ante incumplimientos
          graves de estos Términos, falta de pago o uso indebido de la
          plataforma, notificando al Usuario y otorgándole, cuando sea posible,
          un plazo razonable para subsanar la situación.
        </p>
      </section>

      <section>
        <h2>11. Modificaciones de los Términos</h2>
        <p>
          Comerz puede actualizar estos Términos para reflejar cambios en el
          servicio, en la normativa aplicable o en sus prácticas operativas. La
          versión vigente será siempre la publicada en esta página, con su fecha
          de última actualización.
        </p>
        <p>
          Cuando los cambios sean sustanciales, se notificarán con una
          antelación mínima de treinta (30) días corridos por correo electrónico
          o mediante un aviso dentro de la plataforma. El uso del servicio con
          posterioridad a la entrada en vigencia implica la aceptación de la
          nueva versión. Si el Usuario no la acepta, puede cancelar su
          suscripción conforme a la sección 10.
        </p>
      </section>

      <section>
        <h2>12. Ley aplicable y contacto</h2>
        <p>
          Estos Términos se rigen por las leyes de la República Argentina. Ante
          cualquier controversia, las partes se someten a los tribunales
          ordinarios competentes de la ciudad de Tostado, provincia de Santa Fe,
          sin perjuicio del fuero que corresponda de manera irrenunciable al
          Usuario en su carácter de consumidor.
        </p>
        <p>
          Para consultas, reclamos o cualquier cuestión relacionada con estos
          Términos, el canal oficial de contacto es{" "}
          <a href="mailto:ignacionweppler@gmail.com">
            ignacionweppler@gmail.com
          </a>
          . Procuramos responder toda comunicación dentro de los diez (10) días
          hábiles.
        </p>
      </section>
    </LegalLayout>
  );
}
