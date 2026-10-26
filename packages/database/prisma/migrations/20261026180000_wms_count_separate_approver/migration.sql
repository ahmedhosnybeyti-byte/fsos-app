-- Preserve historical documents; enforce independent approval on every new
-- insert/update. NOT VALID avoids rewriting or invalidating historical stock.
-- No automatic single-owner exception: that requires a separately approved policy.
ALTER TABLE wms_counts ADD CONSTRAINT "WMS_COUNT_SEPARATE_APPROVER"
CHECK (approved_by IS NULL OR approved_by <> created_by) NOT VALID;
