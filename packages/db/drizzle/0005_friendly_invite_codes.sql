DO $$
DECLARE
  group_record record;
  candidate text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR group_record IN SELECT id FROM "groups" LOOP
    LOOP
      SELECT string_agg(
        substr(alphabet, floor(random() * length(alphabet))::integer + 1, 1),
        ''
      )
      INTO candidate
      FROM generate_series(1, 8);

      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "groups"
        WHERE "invite_code" = candidate
          AND "id" <> group_record.id
      );
    END LOOP;

    UPDATE "groups"
    SET "invite_code" = candidate
    WHERE "id" = group_record.id;
  END LOOP;
END $$;
