UPDATE "Event"
SET "type" = 'PRACTICE'::"EventType"
WHERE "type"::text = 'DRIVE_PRACTICE';
