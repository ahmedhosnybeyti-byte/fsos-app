-- AlterTable
-- Row-level access control (strategic point 3): optional, nullable header
-- names identifying which column in a file holds Rep/Supervisor/Manager
-- platform emails. Additive and backward-compatible — every existing row
-- gets NULL, meaning "no filtering", identical to today's behavior.
ALTER TABLE "files" ADD COLUMN     "rep_column" TEXT,
ADD COLUMN     "supervisor_column" TEXT,
ADD COLUMN     "manager_column" TEXT;
