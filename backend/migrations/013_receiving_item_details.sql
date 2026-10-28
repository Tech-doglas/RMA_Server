-- Optional per-unit details; retain the original item code/name and UPC fields.
IF COL_LENGTH('dbo.RMA_return_receiving', 'itemName') IS NULL
BEGIN
    ALTER TABLE dbo.RMA_return_receiving ADD itemName NVARCHAR(255) NOT NULL
        CONSTRAINT DF_RMA_return_receiving_itemName DEFAULT N'' WITH VALUES;
END;
IF COL_LENGTH('dbo.RMA_return_receiving', 'itemInfo') IS NULL
BEGIN
    ALTER TABLE dbo.RMA_return_receiving ADD itemInfo NVARCHAR(4000) NOT NULL
        CONSTRAINT DF_RMA_return_receiving_itemInfo DEFAULT N'' WITH VALUES;
END;
