-- No casal as duas pessoas têm o mesmo poder.
UPDATE "memberships" SET "role" = 'owner' WHERE "role" <> 'owner';
