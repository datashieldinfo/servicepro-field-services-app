/*
  Deduplicate inventory: remove legacy zero-price "RO Membrane 75 GPD" row
  that conflicts with the correctly-priced BioFamily row added by migration
  20260529000002. The row being deleted (id 3b7419f6-...) has cost_price=0,
  selling_price=0, and zero job_parts references — no data is lost.
*/
DELETE FROM inventory
WHERE id = '3b7419f6-9ed4-4a01-907c-96f7b67e6570'
  AND part_name = 'RO Membrane 75 GPD'
  AND cost_price = 0
  AND selling_price = 0;
