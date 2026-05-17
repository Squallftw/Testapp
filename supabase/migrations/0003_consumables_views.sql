-- BatiTrack — Migration 0003 — Consumables: purchase RPC + stock view
--
-- Adds:
--   • create_purchase_with_lines RPC — atomic insert of purchase + lines
--   • stock_on_hand_total view — running balance per item, org-scoped

-- ─── create_purchase_with_lines(p_input jsonb) ────────────────────────
--
-- Atomically inserts a purchase header + its lines in one transaction.
-- PostgREST can't run multi-statement transactions, so the client either
-- needs an RPC like this one OR risks partial writes if the lines insert
-- fails after the header insert.
--
-- Input shape:
--   {
--     "org_id": "...",
--     "chantier_id": "..." | null,
--     "supplier_id": "..." | null,
--     "invoice_ref": "..." | null,
--     "purchased_at": "YYYY-MM-DD",
--     "payment_status": "paid" | "pending" | "partial",
--     "attachment_url": "..." | null,
--     "notes": "..." | null,
--     "lines": [{ "item_id": "...", "qty": 100, "unit_price": 50, "total": 5000 }, ...]
--   }

create or replace function public.create_purchase_with_lines(p_input jsonb)
returns public.consumables_purchases
language plpgsql security definer set search_path = public, app as $$
declare
  v_org      uuid := (p_input ->> 'org_id')::uuid;
  v_purchase public.consumables_purchases;
  v_line     jsonb;
  v_role     public.org_role;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;

  v_role := app.user_role_in_org(v_org);
  if v_role not in ('owner', 'admin', 'site_manager') then
    raise exception 'Access denied: caller cannot record purchases in this org'
      using errcode = '42501';
  end if;

  if jsonb_array_length(p_input -> 'lines') = 0 then
    raise exception 'Au moins une ligne d''achat est requise'
      using errcode = '23514';
  end if;

  insert into public.consumables_purchases (
    org_id, chantier_id, supplier_id, invoice_ref, purchased_at,
    payment_status, attachment_url, recorded_by, notes
  ) values (
    v_org,
    nullif(p_input ->> 'chantier_id', '')::uuid,
    nullif(p_input ->> 'supplier_id', '')::uuid,
    nullif(p_input ->> 'invoice_ref', ''),
    (p_input ->> 'purchased_at')::date,
    coalesce(p_input ->> 'payment_status', 'pending')::public.purchase_payment_state,
    nullif(p_input ->> 'attachment_url', ''),
    auth.uid(),
    nullif(p_input ->> 'notes', '')
  )
  returning * into v_purchase;

  for v_line in select * from jsonb_array_elements(p_input -> 'lines') loop
    insert into public.consumables_purchase_lines (
      org_id, purchase_id, item_id, qty, unit_price, total
    ) values (
      v_org,
      v_purchase.id,
      (v_line ->> 'item_id')::uuid,
      (v_line ->> 'qty')::numeric,
      (v_line ->> 'unit_price')::numeric,
      coalesce(
        (v_line ->> 'total')::numeric,
        (v_line ->> 'qty')::numeric * (v_line ->> 'unit_price')::numeric
      )
    );
  end loop;

  return v_purchase;
end;
$$;

revoke execute on function public.create_purchase_with_lines(jsonb) from public;
grant  execute on function public.create_purchase_with_lines(jsonb) to authenticated;

-- ─── stock_on_hand_total view ─────────────────────────────────────────
--
-- Per-item running balance:
--   on_hand = purchased − consumed − adjusted
--
-- Transfers don't change the org-wide total (they move stock between
-- chantiers within the same org). For per-chantier breakdown we'd need
-- a more elaborate query — deferred until the UI needs it.
--
-- security_invoker = on means the view respects the caller's RLS on the
-- underlying tables (items, purchase_lines, consumption, adjustments).

create or replace view public.stock_on_hand_total
with (security_invoker = on) as
select
  i.id            as item_id,
  i.org_id,
  i.name,
  i.unit,
  i.reorder_threshold,
  coalesce(p.purchased, 0) - coalesce(c.consumed, 0) - coalesce(a.adjusted, 0) as on_hand
from public.consumables_items i
left join lateral (
  select sum(pl.qty)::numeric as purchased
  from public.consumables_purchase_lines pl
  join public.consumables_purchases pu on pu.id = pl.purchase_id
  where pl.item_id = i.id
    and pu.deleted_at is null
) p on true
left join lateral (
  select sum(qty)::numeric as consumed
  from public.consumables_consumption
  where item_id = i.id
    and deleted_at is null
) c on true
left join lateral (
  select sum(qty)::numeric as adjusted
  from public.consumables_adjustments
  where item_id = i.id
    and deleted_at is null
) a on true
where i.deleted_at is null;

grant select on public.stock_on_hand_total to authenticated;
