-- Nome de usuário com no máximo 12 caracteres: encurta os que passam disso, sem repetir nenhum.
DO $$
DECLARE r record; cand text;
BEGIN
  FOR r IN SELECT id, username FROM users WHERE length(username) > 12 ORDER BY "createdAt" LOOP
    cand := left(r.username, 12);
    IF EXISTS (SELECT 1 FROM users o WHERE o.id <> r.id AND lower(o.username) = lower(cand)) THEN
      cand := left(r.username, 8) || substr(md5(r.id::text), 1, 4);
    END IF;
    UPDATE users SET username = cand WHERE id = r.id;
  END LOOP;
END $$;
