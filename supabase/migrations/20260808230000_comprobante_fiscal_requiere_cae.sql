-- Un comprobante fiscal sin CAE no existe.
--
-- La tabla ya frenaba el error en una dirección (un TICKET interno NO puede
-- tener CAE: sería un comprobante fiscal disfrazado de no fiscal). Falta la
-- otra, que es la que se puede colar sola ahora que el POS escribe la tabla:
-- una fila que diga FACTURA_B sin CAE es un comprobante INVÁLIDO guardado
-- como si fuera válido, y aparecería en el libro de IVA como si se hubiera
-- emitido algo.
--
-- Hoy no puede pasar porque `ARCA_EMISION_DISPONIBLE` es false y la venta
-- siempre emite TICKET. Justamente por eso conviene ponerlo ahora: el CHECK
-- entra sobre una tabla vacía y sin discusión, y queda de red para el día que
-- se prenda ARCA y el orden de las llamadas se vuelva importante.
--
-- El orden correcto que esto obliga a respetar: pedir el CAE a ARCA PRIMERO y
-- recién después insertar la fila. Si alguna vez hace falta un estado
-- "pendiente de CAE" (timeout de ARCA en el que no se sabe si autorizó),
-- relajar este CHECK es una migración aditiva y trivial — al revés no.

alter table public.comprobantes
  drop constraint if exists comprobantes_ticket_sin_cae_check;

alter table public.comprobantes
  add constraint comprobantes_ticket_sin_cae_check
  check (
    case
      when tipo = 'TICKET' then cae is null
      else cae is not null
    end
  );

comment on constraint comprobantes_ticket_sin_cae_check on public.comprobantes is
  'TICKET nunca lleva CAE; todo lo fiscal SIEMPRE lo lleva. Obliga a pedir el CAE antes de insertar la fila.';
