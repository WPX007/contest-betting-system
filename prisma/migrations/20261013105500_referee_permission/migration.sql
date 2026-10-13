ALTER TABLE "User" ADD COLUMN "isReferee" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "isReferee" = true,
    "role" = 'VIEWER'
WHERE "role" = 'SCOREKEEPER';
