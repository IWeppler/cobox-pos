# Templates de mail de Supabase Auth

Estos HTML se **pegan a mano** en el dashboard: Authentication → Email
Templates. No se deployan desde el repo — viven acá para tener versionado lo
que está puesto allá, y para poder revisarlo en un PR como cualquier otro
cambio de cara al usuario.

> *"For hosted projects managed by Supabase, copy the templates into the Email
> Templates section of the Dashboard."*
> — docs/guides/local-development/customizing-email-templates

| Archivo | Dónde va | Lo dispara |
|---|---|---|
| `recuperar-password.html` | Reset Password | `resetPasswordForEmail` (features/auth/actions/reset-password.ts) |
| `invitacion-empleado.html` | Invite user | `inviteUserByEmail` (features/config/actions/invitaciones-actions.ts) |
| `confirmar-cuenta.html` | Confirm signup | `signUp` — **solo si se prende "Confirm email"** |

## Antes de tocar nada: el SMTP

Los tres templates del mundo no sirven si el mail no sale. El servicio de mail
que trae Supabase es **para desarrollo**: unos pocos envíos por hora y sin
garantía de entrega, así que termina en spam o directamente no llega.

Y esto no es teórico: `resetPasswordForEmail` e `inviteUserByEmail` **ya están
en producción**. Hoy, si a la dueña de un comercio se le olvida la contraseña,
el mail de recuperación puede no llegarle nunca.

El SMTP propio se configura en el plan **free** — no hace falta Pro. Con Resend
(u otro proveedor) hay que:

1. Verificar el dominio en el proveedor (registros SPF/DKIM en `comerz.app`).
   Es el mismo DNS que hay que tocar para `app.comerz.app`: conviene hacer las
   dos cosas de una.
2. Cargar las credenciales SMTP en Supabase → Project Settings → Auth → SMTP.
3. Recién ahí pegar estos templates.

## Variables disponibles

Las que usan estos templates:

- `{{ .ConfirmationURL }}` — el link de la acción. Ya incluye el `redirectTo`
  que manda cada action, así que **no hay que armarlo a mano**.
- `{{ .Email }}` — el mail del destinatario.

Otras que existen y acá no se usan: `{{ .Token }}` (código de 6 dígitos),
`{{ .TokenHash }}` (para armar un link propio), `{{ .SiteURL }}`.

## Por qué el HTML parece de 2005

Tablas, estilos inline, sin webfonts y sin imágenes. Los clientes de mail no
son navegadores: Outlook no entiende flexbox, Gmail borra el `<style>` del
`<head>` y muchos bloquean imágenes por defecto. La marca va como texto
justamente por eso — un logo bloqueado se ve como un cuadrado roto, y el mail
que peor tiene que verse es el de recuperar el acceso.

## Si algún día se quiere control total del diseño

Existe un camino soportado: el **Send Email Hook** con una Edge Function que
manda los mails con React Email + Resend, en vez de que los mande Supabase.
Ahí el template es código del repo (se testea, se revisa, se deploya) y se
pueden usar datos que Supabase Auth no conoce — por ejemplo, el nombre del
comercio que invita, que hoy no se puede poner en `invitacion-empleado.html`.

Guía: `docs/guides/functions/examples/auth-send-email-hook-react-email-resend`,
con ejemplo completo en el repo de Supabase.

Es bastante más trabajo que pegar estos HTML. Vale la pena cuando el mail sea
parte de la marca, no antes.
