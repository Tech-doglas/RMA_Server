IF OBJECT_ID('dbo.RMA_return_pallet_status', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_return_pallet_status (
        pallet NVARCHAR(255) NOT NULL PRIMARY KEY,
        status NVARCHAR(10) NOT NULL CHECK (status IN ('OPEN', 'LOCKED', 'FULL'))
    );
END;
