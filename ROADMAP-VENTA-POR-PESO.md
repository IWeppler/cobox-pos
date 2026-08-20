# Roadmap — Venta por peso y rubros de consumo (carnicería, kiosco, farmacia)

Objetivo: que un comercio que vende fraccionado (carnicería, fiambrería,
verdulería, dietética) pueda usar Comerz sin pelear con el sistema, **sin tocar
el comportamiento de los que venden por unidad** (Evens, Estilo Bonito, Ninja,
ClickTostado). Los cuatro negocios vivos son de unidad: cualquier cambio acá se
mide contra "¿esto cambia algo para ellos?", y la respuesta tiene que ser no.

---

## 0. Lo primero: los tres rubros del título NO piden la misma feature

Esto es lo que hay que separar antes de escribir una línea de código, porque
meterlos en la misma bolsa produce una feature que no le sirve bien a ninguno.

| Rubro | Lo que realmente necesita | ¿Es "venta por peso"? |
|---|---|---|
| **Carnicería / fiambrería / verdulería / dietética** | Cantidad decimal, precio por kg, peso desde balanza | **Sí.** Es el corazón del roadmap. |
| **Kiosco** | Escaneo rápido, **vender suelto lo que se compra por pack** (el paquete de 24 alfajores entra como 1 bulto y se vende de a 1), y **también peso** (golosinas en bolsita, fiambre al corte, frutos secos) | **En parte, sí.** Necesita las dos cosas. |
| **Farmacia** | Presentación (ya existe), **IVA exento y 10,5%**, troquel, vencimiento/lote, receta | **No.** Es *trazabilidad y fiscalidad*, otra feature. Y `lote` hoy no tiene tabla — ya está anotado en `columnas-por-rubro.ts`. |

Consecuencia práctica: **farmacia puede empezar a usar el sistema antes que
carnicería**, porque lo que le falta es más chico.

> **Actualización (19/8):** el kiosco pasó de "no necesita peso" a "también
> necesita peso" — golosinas en bolsita y fiambre al corte son venta de kiosco
> real. Eso **agranda el premio de la venta por peso**: deja de servirle solo a
> carnicería y pasa a servirle a kiosco, almacén, dietética, panadería y
> fiambrería, que son cinco de los rubros comerciales del alta. Por eso el
> orden de abajo se reordenó y la Fase 1 subió.
>
> Y confirma la decisión de diseño de la sección 2: **un mismo comercio vende
> por unidad Y por peso a la vez** (la gaseosa por unidad, los caramelos por
> 100 g). Si "vender por peso" fuera un flag del comercio, el kiosco quedaría
> obligado a tipear "1,000" para cobrar una Coca. Es del producto.

---

## 1. El bloqueo duro: toda la cadena de cantidad es `integer`

Verificado contra producción hoy:

```
producto_variantes.stock          integer
producto_variantes.stock_minimo   integer
productos_stock.cantidad          integer   (espejo legacy)
ventas_items.cantidad             integer
ventas.cantidad                   integer
ordenes_items.cantidad            integer
bajas.cantidad                    integer
ajustar_stock_variante(uuid, integer, boolean)
```

O sea: **hoy no existe forma de representar 0,750 kg en ninguna parte del
sistema.** No es un problema de UI ni de validación: la columna no lo admite.
Todo lo demás del roadmap depende de esto y nada se puede empezar antes.

La buena noticia es que la capa de arriba ya está medio preparada sin haberlo
buscado:

- `ajustar_stock_legacy(p_delta numeric)` **ya es numeric**.
- En `registrar_venta`, el `jsonb_to_recordset` declara `cantidad numeric` para
  los items y para el stock legacy. El JSON no rompe; lo que trunca es la
  columna destino.
- `productos.unidad_medida` **ya existe** con `UNIDAD | KG | GRAMO | LITRO |
  METRO | PAR` (`shared/lib/fiscal-producto.ts`), con default por rubro y
  columna en la base. Hoy es puramente fiscal-decorativa: **nada del POS ni del
  stock la lee**. Es el gancho que ya está puesto.
- La búsqueda del POS ya matchea contra `producto_variantes.sku`
  (`use-catalog-filters.ts:97`), así que escanear un EAN ya encuentra el
  producto. Ese pedazo no hay que construirlo.

### Gotchas de la migración de tipo (los dos que muerden)

1. **`ajustar_stock_variante` hay que DROPearla, no reemplazarla.** Cambiar
   `p_delta integer` por `numeric` con un `CREATE OR REPLACE` crea una
   **sobrecarga**: quedan las dos funciones vivas y PostgREST resuelve por
   ambigüedad de tipo del JSON, o sea que "a veces" entra por la vieja y trunca.
   Es exactamente el tipo de falla intermitente que no se descubre en el smoke
   test. `DROP FUNCTION ... (uuid, integer, boolean)` explícito en la misma
   migración, y verificar con `pg_proc` que quedó una sola.
2. **`ALTER TYPE` reescribe la tabla y toca a los 4 negocios a la vez.**
   `producto_variantes` son ~4.951 filas: barato. Pero es un cambio que no
   admite release gradual (regla de CLAUDE.md), así que va solo, sin nada más
   en la misma migración, y con la app pudiendo convivir con los dos tipos —
   `integer` es un subconjunto de `numeric`, así que el código viejo leyendo
   valores enteros sigue funcionando idéntico.

### Precisión: `numeric(12,3)`, no `numeric` libre ni `float`

Tres decimales cubre gramos (0,001 kg) y es lo que imprime cualquier balanza
comercial. `double precision` queda descartado por el mismo motivo por el que
la plata no es float: 0,1 + 0,2 en binario no da 0,3, y acá el resultado
multiplica un precio.

---

## 2. La decisión de diseño que ordena todo el resto

> **La columna pasa a decimal para todos. El comportamiento se prende por
> PRODUCTO, vía `unidad_medida` — nunca por rubro.**

Por qué por producto y no por rubro: una carnicería también vende gaseosas y
carbón por unidad, y un kiosco también vende fiambre por peso. Si "vender por
peso" fuera un flag del comercio, la carnicería tendría que tipear "1,000" para
cobrar una Coca. El rubro decide el **default** de la plantilla y qué se muestra
en Inventario; la capacidad es del producto. Es el mismo criterio que ya está
escrito en CLAUDE.md para el ingreso de mercadería ("lo que cambia por rubro son
las columnas, no el flujo").

Por qué la columna igual cambia para todos, en vez de una columna aparte
`cantidad_decimal`: dos columnas para la misma magnitud significan dos caminos
en anulación, en la exportación al contador, en el arqueo y en el importador —
y el día que uno de los dos se olvida de actualizarse, el stock miente sin
error. Con `numeric` y `unidad_medida = 'UNIDAD'` (que es lo que ya tienen los
1.606 productos existentes) el comportamiento es **bit a bit el mismo**: el
stepper +/- entero, mínimo 1, sin decimales en la UI.

Regla derivada, en un módulo compartido tipo `shared/lib/unidad-venta.ts`:

```
esFraccionable(unidad)  →  KG | GRAMO | LITRO | METRO son fraccionables
                            UNIDAD | PAR no lo son
```

y que lo consuman POS, cart-store, create-sale, stock y el importador. Uno solo,
porque la pregunta "¿este producto acepta 0,75?" tiene que tener una sola
respuesta — mismo motivo por el que `determinar-comprobante.ts` es módulo propio.

---

## 3. Bug que ya está roto hoy y bloquea todo lo demás

`shared/lib/rubros.ts` → `rubroOperativoDesde()` mapea **solo** a `electro` o
`indumentaria`:

```ts
const RUBROS_TIPO_ELECTRO = new Set(["electronica", "ferreteria"]);
// todo lo demás → "indumentaria"
```

Pero el tipo `Rubro` (`entities/config/types.ts`) ya tiene `alimentos`,
`farmacia`, `quioscos`. Resultado hoy, en producción: **un comercio que se da de
alta como "Almacén y dietética", "Farmacia" o "Panadería" queda configurado como
indumentaria** y recibe la plantilla de ropa, con columnas de talle y color. Las
columnas para esos rubros ya están escritas en `columnas-por-rubro.ts` y no las
alcanza nadie.

Lo mismo en `defaultsFiscalesPorRubro()`: solo tiene fila para indumentaria y
electro, así que **todo lo demás nace en 21% + UNIDAD**. Para una carnicería
(buena parte de la carne va al 10,5%) y para una farmacia (medicamentos exentos)
eso no es un default flojo, es un dato fiscal mal cargado que después sale
impreso en un comprobante. El propio comentario de la función ya lo anticipa.

Es un fix chico, aditivo y sin schema. **Va primero, y se puede pushear ya**,
independiente de todo el resto del roadmap.

---

## Fases

### Fase 0 — Destrabar los rubros que ya existen `[chico, sin schema, ya]`

- Completar `RUBROS_TIPO_*` / `rubroOperativoDesde` para los 7 rubros
  operativos, no 2.
- Completar `DEFAULTS_POR_RUBRO` con los 5 que faltan (alimentos → KG + 21%
  como punto de partida; farmacia → UNIDAD + EXENTO; ver nota fiscal abajo).
- Tests de mapeo comercial → operativo, los 15 valores comerciales.

**Entrega:** un kiosco o un almacén que se da de alta hoy recibe su plantilla
correcta y sus defaults fiscales correctos. **Ya es usable para kiosco**, sin
nada de lo que sigue.

**Riesgo para los 4 negocios vivos:** nulo. Evens/Estilo/Ninja son
`indumentaria` y ClickTostado es `electronica`; ninguno cambia de rama.

---

### Fase 1 — Cantidad decimal end-to-end `[el cambio de fondo]`

Migración única, sola, sin features encima:

- `ALTER` a `numeric(12,3)`: `producto_variantes.stock`, `stock_minimo`,
  `productos_stock.cantidad`, `ventas_items.cantidad`, `ordenes_items.cantidad`,
  `bajas.cantidad`.
- `DROP` + recrear `ajustar_stock_variante` con `p_delta numeric` (ver gotcha).
- Revisar que `registrar_venta`, `anular_venta`, `aprobar_orden_compra` e
  `importar_productos_planilla` no tengan `::integer` intermedios que trunquen
  antes de llegar a la columna — `aprobar_orden_compra` tiene
  `v_cantidad integer` declarado adentro, y ese es justo el que trunca en
  silencio.
- Decidir `ventas.cantidad` (ver "Decisiones abiertas").
- Frontend: sacar los `Math.max(1, ...)` y el clamp entero de
  `cart-store.ts:updateQuantity`, condicionados a `esFraccionable`. Sin flag, el
  clamp de siempre.

**Criterio de terminado:** vender 3 remeras en Evens produce exactamente los
mismos números que antes del cambio, en el ticket, en el arqueo y en la
exportación al contador. Es la prueba de que el cambio fue invisible.

#### Estado al 19/8: migraciones APLICADAS en prod. Faltan deploy y smoke test.

De las 3 patas: **(1) migración aplicada ✅**, (2) código commiteado + deploy
verde ❌ (sigue en el working tree), (3) smoke test real ❌.

La base quedó **adelante del código y eso es seguro**: el cambio es hacia atrás
compatible. El código viejo que corre hoy en Vercel manda cantidades enteras,
que son un subconjunto de numeric, y llama a `ajustar_stock_variante` por
nombre de parámetro — PostgREST resuelve por nombre, así que encuentra la
versión numeric sin cambiar una línea. Lo que **todavía no está vivo** es la
validación de cantidad de `create-sale.ts` (incluido el tapón del negativo):
eso entra con el deploy.

Verificación post-aplicación:

- Las 7 columnas en `numeric(12,3)`, y los dos guards de la migración pasaron.
- **Ningún número se movió**: filas y sumas idénticas antes y después —
  `producto_variantes` 5.044/4.911, `productos_stock` 5.043/4.908,
  `ventas_items` 1.075/1.105, `ventas` 551/1.105, `ordenes_items`
  8.340/12.386.
- `ajustar_stock_variante` quedó en UNA sola versión (la de numeric), sin la
  sobrecarga de integer.
- Prueba funcional con decimal, revertida por rollback: descontó 7,000 → 6,750
  y la variante volvió a 7,000.
- PostgREST recargó el esquema solo (`pgrst_ddl_watch` y `pgrst_drop_watch`
  están activos), más un `notify pgrst, 'reload schema'` explícito.
- Advisors de seguridad: ningún ERROR, y ninguno de los WARN preexistentes
  menciona stock, cantidad ni la función.

Lo que quedó escrito:

- `20260819120000_cantidad_decimal.sql` — las 6 tablas a `numeric(12,3)` +
  `ajustar_stock_variante` recreada en numeric, con dos guards que hacen fallar
  la migración si queda una columna sin convertir o si sobrevive la sobrecarga
  de integer.
- `20260819130000_aprobar_orden_compra_cantidad_decimal.sql` — las dos líneas
  del ingreso de mercadería (`v_cantidad integer` y `::integer`).
- `shared/lib/unidad-venta.ts` + tests — `esFraccionable`, `pasoCantidad`,
  `normalizarCantidadVendible`, `formatearCantidad`. Es el vocabulario que
  consume la Fase 2.
- `create-sale.ts` valida la cantidad server-side contra la unidad del
  producto.

Relevado contra producción antes de escribir: **no hay vistas, ni
materializadas, ni triggers, ni CHECKs, ni índices** sobre las columnas de
cantidad. El `ALTER` no arrastra nada.

**Hallazgo aparte, de seguridad:** hasta este cambio `create-sale.ts` tomaba la
cantidad como `Number(item.cantidad ?? 1)` sin validar. Una cantidad NEGATIVA
en un request modificado pasaba entera: el descuento se hace con
`p_delta: -cantidad`, así que en negativo **agregaba stock** y bajaba el total
del ticket, y ninguno de los chequeos de pago lo frenaba (con total negativo,
`montoPendiente` da negativo y la venta queda PAGADA). Es anterior a la venta
por peso y no depende de ella. Ya está tapado por
`normalizarCantidadVendible`, que rechaza cero, negativos, NaN e Infinity, y
además rechaza decimales en productos que no son fraccionables.

**Riesgo:** es el cambio más caro del roadmap y toca el camino de la venta de los
4 negocios. Va con las 3 patas (migración + deploy verde + smoke test real de
una venta y una anulación en cada negocio), y preferentemente un día de poco
movimiento.

---

### Fase 2 — Venta por peso tipeado (el MVP que funciona sin hardware)

Esto es lo que ya le sirve a una carnicería chica el primer día.

- **Precio por kg.** `productos.precio` pasa a interpretarse como precio por
  unidad de medida. No cambia la columna: cambia el label ("Precio por kg") y el
  cálculo de línea es `precio × cantidad` — que es lo que ya hace. La cuenta no
  se toca, solo se le permite a `cantidad` no ser entera.
- **Teclado de peso en el carrito.** Con `esFraccionable(unidad)`, el stepper
  +/- se reemplaza por un input numérico con la unidad al lado ("0,750 kg") y un
  segundo campo opcional **"cobrar por importe"**: la clienta pide "$2000 de
  jamón", el POS despeja el peso. Es como se pide de verdad en un mostrador y no
  lo tiene casi ningún POS chico.
- **Ticket y catálogo** muestran `0,750 kg × $8.500/kg = $6.375`, usando
  `ABREVIATURA_UNIDAD` que ya existe.
- **Redondeo:** la línea se redondea al peso (igual que el recargo por método) y
  el redondeo se hace **una sola vez, sobre el total de la línea**, nunca sobre
  el precio unitario.
- **Inventario** muestra "12,400 kg" en vez de "12 u." — `identidad-por-rubro.ts`
  es donde vive esa decisión hoy.

**Riesgo:** medio. Todo lo nuevo está detrás de `esFraccionable`, que es false
para los 1.765 productos existentes.

#### Estado al 19/8: implementada, sin deploy

Migración aplicada (`20260819140000`); el código sigue en el working tree.

- **`unidad_medida` viaja hasta el carrito.** Hizo falta un GRANT para `anon`:
  `COLUMNAS_PRODUCTO_PUBLICO` la comparten el catálogo público y el POS, y con
  GRANT por columna pedir una no concedida devuelve 403 — la tienda se cae
  entera, no se degrada. La migración lleva un guard que además verifica que
  `precio_costo` y `tratamiento_iva` NO quedaron expuestos.
- **`CantidadControl`** (`shared/components/cart-sidebar/`) es dos controles
  en uno: stepper -/+ por unidad, teclado por peso. Sin stepper en peso a
  propósito — con paso de un gramo harían falta 750 clicks para vender 750 g.
- **Cobrar por importe**: se tipea "$2000" y el peso se despeja solo. Es como
  se pide de verdad en un mostrador.
- **`parsear-numero-es.ts`**: dos parsers, no uno. `"1.500"` es **1,5 kg** en
  un campo de peso y **$1.500** en uno de importe; el mismo texto significa
  cosas distintas y elegir mal es cobrar mil veces de más.
- **Ticket, PDF, carrito, grilla del POS e Inventario** muestran la unidad.
  El ticket pasa de `"0.75x Jamón"` a `"0,75 kg Jamón"`, y el `c/u` a `/kg`.
- **Los 11 `parseInt`/`Math.trunc` de la Fase 1 quedaron todos resueltos** —
  eran el motivo por el que no había de dónde sacar stock decimal.

Los productos por unidad no cambian en nada: `esFraccionable` es false y cada
pantalla cae al camino de siempre.

#### Checklist heredado de la Fase 1: los `parseInt` que quedaron

La Fase 1 dejó la BASE en decimal pero **no tocó las pantallas de carga**, a
propósito: mientras no se pueda tipear una coma, forzar entero no rompe nada.
En cuanto la Fase 2 habilite decimales, cada uno de estos truncaría en
silencio. Relevado el 19/8:

| Archivo | Qué hace hoy |
|---|---|
| `features/stock/lib/parse-productos-csv.ts:292` | `Math.trunc(stockParseado)` — **el más peligroso**: una planilla con "12,5" entra como 12 sin avisar |
| `features/stock/actions/create-product.ts:98` y `:372` | `parseInt` del stock inicial |
| `features/stock/actions/edit-product.ts:81` | `parseInt` del stock |
| `features/stock/ui/edit-sheet.tsx:516` y `:549` | `parseInt` del stock por variante |
| `features/carga-rapida/hooks/use-carga-rapida.ts:160` y `:598` | `parseInt` al sumar de a uno |
| `features/carga-rapida/ui/carga-rapida-lista.tsx:16` y `:26` | `parseInt` del total |
| `features/carga-rapida/ui/carga-rapida-quick-create-modal.tsx:140` | `parseInt` de la cantidad |
| `features/purchases/ui/create-purchase-modal.tsx:331` | `parseInt` de la cantidad del remito |
| `features/reservations/actions/manage-reservations.ts:57` y `:104` | `Math.floor` — además usa la cantidad como `length` de un array, así que con peso hay que repensar qué es reservar |

`cancel-sale.ts` **no** está en la lista y es a propósito: pasa `item.cantidad`
derecho a `ajustar_stock_variante` y `ajustar_stock_legacy`, sin coerción. La
anulación devuelve 0,750 kg sin tocar una línea.

---

### Fase 3 — Balanza (etiqueta con peso embebido)

El camino realista y el que usa el 90% de las carnicerías: la balanza
etiquetadora imprime un **EAN-13 de prefijo 2x** que trae adentro el código de
producto y el peso (o el importe). El POS no habla con la balanza — lee la
etiqueta con el mismo lector que ya usa.

- Parser `shared/lib/ean-balanza.ts`: prefijo `20–29`, `PPPPP` código,
  `WWWWW` peso en gramos o importe en pesos, `C` dígito verificador. El formato
  **varía por marca de balanza** (Kretz, Systel, Moretti son distintas), así que
  el patrón es configurable por comercio, no hardcodeado.
- Enganche en el buscador del POS: si el código escaneado matchea el patrón, se
  agrega la línea con el peso **ya cargado**, sin pasar por el teclado.
- Validación del dígito verificador antes de aceptar (mismo criterio que el CUIT
  por módulo 11: atrapar el error en el mostrador, no dos días después).

**Explícitamente fuera de alcance: balanza conectada por serie/USB.** Requiere
WebSerial o un agente local instalado en la PC, y es un producto aparte. No
prometerlo.

---

### Fase 4 — Kiosco: fraccionamiento de unidad de compra

Independiente de todo lo anterior (no necesita decimales). Comprar un pack de 24
y vender de a 1.

- `producto_variantes.unidades_por_bulto` + que el ingreso de mercadería permita
  cargar "3 bultos" y escriba 72 unidades de stock.
- El costo unitario se deriva del costo del bulto (es lo que hace que el margen
  del kiosco sea real).
- Entra por `aprobar_orden_compra`, que ya es el único motor de escritura de
  stock por ingreso.

---

### Fase 5 — Farmacia: lo fiscal y lo trazable

- **IVA exento y 10,5% por producto**: ya existe el campo
  (`tratamiento_iva`), falta el default por rubro (Fase 0) y que la carga
  masiva lo respete.
- **Troquel** en la plantilla de farmacia.
- **Vencimiento y lote**: requiere una **tabla de lotes** que hoy no existe, y
  cambia el modelo de stock (el stock pasa a ser por lote, no por variante). Es
  la pieza más grande de todo este documento y merece su propio roadmap. Hasta
  que exista, **no ofrecer la columna en la plantilla** — está anotado y
  decidido en `columnas-por-rubro.ts` y sigue siendo lo correcto.

---

## Nota: el IVA del producto y la venta "en negro"

Planteado el 19/8: como muchos productos se venden en negro, ¿no convendría que
la categoría fiscal sea opcional en vez de obligatoria?

Primero, **ya es opcional donde importa**. Son tres campos distintos y solo uno
es obligatorio:

| Campo | Qué es | ¿Obligatorio? |
|---|---|---|
| `configuracion_pos.condicion_iva` | Condición del **comercio** (Monotributo / RI / Exento) | **No.** Nullable, y el alta la manda como `null` si no se completó. |
| `clientes.condicion_iva` | Condición del **cliente** | **No.** Nullable; se revela con el toggle `es_fiscal`. |
| `productos.tratamiento_iva` | Alícuota del **producto** (21 / 10,5 / 27 / exento / no gravado) | **Sí.** NOT NULL default `GRAVADO_21`. |

Y aun siendo obligatorio, el de producto **ya es invisible**: el bloque fiscal
del formulario va colapsado y, cerrado, no monta sus inputs. Nadie lo completa
hoy — los 1.765 productos de los 4 negocios están en 21% porque los puso el
default, no porque alguien los haya elegido.

Segundo, y es el punto de fondo: **"en negro" es una propiedad de la VENTA, no
del PRODUCTO.** El paquete de yerba tiene IVA 21% exista o no la factura; lo que
cambia entre una venta declarada y una que no es **si se emite comprobante
fiscal**, y esa palanca ya existe y ya está en la posición correcta:
`modo_facturacion = INTERNO` y `comprobante_defecto = TICKET`, que es como están
los 4 negocios. Un ticket interno no lleva IVA discriminado ni CAE, así que hoy
`tratamiento_iva` no se imprime en ningún lado.

Por eso **no conviene hacerlo nullable**. Un `NULL` no significaría "se vende en
negro", significaría "no sabemos con qué facturarlo", y el día que se prenda
ARCA hay que resolverlo igual: o se frena la venta —con la clienta en el
mostrador— o se adivina una alícuota, que es exactamente el estado inválido que
el campo único fue diseñado para no tener. El costo de dejarlo NOT NULL es cero
(nadie lo ve); el costo de hacerlo nullable se paga entero el día de la primera
factura.

Lo que **sí** vale la pena, y es barato: cuando llegue ARCA, un aviso en
Configuración del estilo "tenés 340 productos en 21% que nunca revisaste" antes
de emitir la primera factura. Es el momento en que la pregunta recién importa, y
es cuando alguien la puede contestar bien.

---

## Decisiones abiertas (necesitan definición antes de la Fase 1)

1. **`ventas.cantidad`** — hoy es "unidades vendidas" y alimenta el gráfico del
   panel y la columna "Unidades" del contador. Sumar `0,750 kg + 2 unidades` da
   `2,75` de nada. Tres opciones: (a) pasarla a numeric y aceptar la mezcla,
   (b) contar solo las líneas no fraccionables, (c) partir en dos columnas.
   **Recomendación: (a) numeric**, más un cambio de label a "cantidad vendida" —
   (c) es la correcta conceptualmente pero agrega una columna a backfillear en
   1.032+ renglones para un número que hoy nadie usa por rubro mezclado.
   Vale revisarla cuando exista el primer comercio real de peso.

2. **Stock negativo con peso.** `permitir_venta_sin_stock` ya existe. Con peso,
   el stock real *siempre* deriva un poco (la merma del corte es real y no la
   registra nadie). Probablemente estos rubros quieran el flag prendido por
   default, pero es una decisión de negocio, no técnica.

3. **La celda fiscal de la carne.** Corte al 10,5% vs. elaborado al 21% no lo
   define el rubro sino el producto. El default por rubro tiene que ser el caso
   mayoritario, y **hay que confirmarlo con el contador** — mismo tratamiento
   que ya se le dio a `RI_A_MONOTRIBUTO`.

---

## Orden sugerido, por relación valor/riesgo

```
Fase 0  →  HECHA (19/8, sin commitear): destraba los 7 rubros operativos
Fase 1  →  el cambio de fondo, SOLO, con las 3 patas          ← siguiente
Fase 2  →  kiosco, almacén, dietética y carnicería usables
Fase 3  →  carnicería cómoda (balanza)
Fase 4  →  fraccionamiento de bulto (kiosco queda completo)
Fase 5  →  farmacia (y el roadmap de lotes, aparte)
```

Reordenado el 19/8. En la primera versión la Fase 4 iba antes que la 1, con el
argumento de meter un rubro nuevo en producción antes de tocar el camino de la
venta de los cuatro negocios que ya facturan. Ese argumento sigue siendo bueno,
pero **pesa menos que el hecho de que el kiosco también quiere peso**: la Fase 1
dejó de ser "lo que necesita carnicería" y pasó a ser el cuello de botella de
cinco rubros. La Fase 4 sola no destraba a nadie que hoy esté esperando.

Sigue valiendo lo importante: la Fase 1 va **sola**, sin ninguna feature encima,
y su criterio de terminado es que en Evens no cambie ni un número.
