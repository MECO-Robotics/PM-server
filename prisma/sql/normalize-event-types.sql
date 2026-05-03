UPDATE "Milestone"
SET "type" = 'PRACTICE'::"MilestoneType"
WHERE "type"::text = 'DRIVE_PRACTICE';
