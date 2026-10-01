-- Normalize existing receiving units to the two supported classifications.
-- Existing BULK_NEW values are kept. Blank/other historical types become REGULAR.
BEGIN TRANSACTION;
UPDATE dbo.RMA_return_units
SET bulkType = CASE WHEN UPPER(LTRIM(RTRIM(bulkType))) = 'BULK_NEW'
    THEN 'BULK_NEW' ELSE 'REGULAR' END
WHERE bulkType IS NULL OR bulkType COLLATE Latin1_General_100_BIN2 NOT IN ('REGULAR', 'BULK_NEW');
COMMIT;
