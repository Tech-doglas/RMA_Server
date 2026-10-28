-- Optional product UPC on the existing receiving table. Preserve leading zeros.
IF COL_LENGTH('dbo.RMA_return_receiving', 'upc') IS NULL
BEGIN
    ALTER TABLE dbo.RMA_return_receiving ADD upc NVARCHAR(255) NOT NULL
        CONSTRAINT DF_RMA_return_receiving_upc DEFAULT N'' WITH VALUES;
END;
