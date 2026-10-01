-- Run once against the application's RMA database before using the new pages.
-- Existing RMA_return_receiving records and the Xie workflow are preserved.
IF OBJECT_ID('dbo.RMA_return_units', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_return_units (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        tracking NVARCHAR(255) NOT NULL DEFAULT '',
        laptop NVARCHAR(255) NOT NULL DEFAULT '',
        receivedDate DATE NOT NULL,
        remark NVARCHAR(4000) NOT NULL DEFAULT '',
        images NVARCHAR(MAX) NOT NULL DEFAULT '[]',
        inspectionDate DATE NULL,
        pallet NVARCHAR(255) NOT NULL DEFAULT '',
        serial NVARCHAR(255) NOT NULL DEFAULT '',
        serialKey NVARCHAR(255) NULL,
        groupId NVARCHAR(64) NOT NULL,
        unitIndex INT NOT NULL,
        unitImages NVARCHAR(MAX) NOT NULL DEFAULT '[]',
        inspectionRemark NVARCHAR(4000) NOT NULL DEFAULT '',
        shipDate DATE NULL,
        shipBatch NVARCHAR(64) NOT NULL DEFAULT '',
        shipBatchNumber INT NULL,
        bulkType NVARCHAR(255) NOT NULL DEFAULT '',
        company NVARCHAR(255) NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX UX_return_units_serial ON dbo.RMA_return_units(serialKey) WHERE serialKey IS NOT NULL;
    CREATE INDEX IX_return_units_group ON dbo.RMA_return_units(groupId);
    CREATE INDEX IX_return_units_tracking ON dbo.RMA_return_units(tracking);
    CREATE INDEX IX_return_units_pallet ON dbo.RMA_return_units(pallet);
END;
