-- Admin-created bulk types and history for record edits/removals.
IF OBJECT_ID('dbo.RMA_return_bulk_types', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_return_bulk_types (name NVARCHAR(255) NOT NULL PRIMARY KEY);
    INSERT INTO dbo.RMA_return_bulk_types (name) VALUES ('REGULAR'), ('BULK_NEW');
    INSERT INTO dbo.RMA_return_bulk_types (name)
    SELECT DISTINCT bulkType FROM dbo.RMA_return_receiving
    WHERE bulkType <> '' AND bulkType NOT IN ('REGULAR', 'BULK_NEW');
END;
IF OBJECT_ID('dbo.RMA_return_admin_audit', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_return_admin_audit (
        id INT IDENTITY(1,1) PRIMARY KEY,
        timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        username NVARCHAR(255) NOT NULL,
        action NVARCHAR(255) NOT NULL,
        target NVARCHAR(255) NOT NULL,
        snapshot NVARCHAR(MAX) NOT NULL
    );
END;
