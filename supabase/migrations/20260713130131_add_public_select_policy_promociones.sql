
create policy "Lectura pública de promociones"
  on public.promociones
  for select
  to public
  using (true);

create policy "Lectura pública de promociones_categorias"
  on public.promociones_categorias
  for select
  to public
  using (true);

create policy "Lectura pública de promociones_metodos_pago"
  on public.promociones_metodos_pago
  for select
  to public
  using (true);
