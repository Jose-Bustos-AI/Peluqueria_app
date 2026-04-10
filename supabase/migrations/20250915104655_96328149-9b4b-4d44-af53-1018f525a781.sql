-- Policies for users_shadow to allow widget inserts/updates
create policy "Widget can insert users_shadow"
on public.users_shadow
for insert
to anon, authenticated
with check (true);

create policy "Widget can update users_shadow"
on public.users_shadow
for update
to anon, authenticated
using (true)
with check (true);