IF COL_LENGTH('dbo.RMA_users', 'isActive') IS NULL
    ALTER TABLE dbo.RMA_users ADD isActive BIT NOT NULL DEFAULT 1;
-- Keep shipping batch numbers reserved after admins remove or restore units.
IF OBJECT_ID('dbo.RMA_return_shipping_batches', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_return_shipping_batches (batchNumber INT PRIMARY KEY, shipDate DATE NOT NULL);
    INSERT INTO dbo.RMA_return_shipping_batches (batchNumber, shipDate)
    SELECT shipBatchNumber, MIN(shipDate) FROM dbo.RMA_return_units
    WHERE shipBatchNumber IS NOT NULL AND shipDate IS NOT NULL GROUP BY shipBatchNumber;
END;
