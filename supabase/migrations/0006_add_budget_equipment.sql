-- 0006_add_budget_equipment.sql
--
-- Adds a third per-category budget bucket on chantiers: budget_equipment.
-- The Budget page now treats matériels (equipment) as a first-class cost
-- category alongside main d'œuvre (labor) and matériaux (materials), with
-- its own progress bar and drill-in dashboard.
--
-- Semantics: budget_total stays an independent contract-level cap (it
-- already includes a "divers" envelope). The form-level validation rule
-- enforces budget_labor + budget_materials + budget_equipment <= budget_total
-- so the three category buckets fit under the total. Existing rows default
-- to 0 — owners set a real target when they next edit the chantier; the
-- BudgetBar renders "—" instead of a percentage while the target is 0.

alter table public.chantiers
  add column budget_equipment numeric(14, 2) not null default 0;
