-- Run ONLY via upgrade_sqlserver.py, after stopping application writes.
-- In-place upgrade for the legacy receiving schema without a unit ID.
-- The runner owns the transaction and backs up SQL before this script runs.
SET XACT_ABORT ON;
IF OBJECT_ID('dbo.RMA_return_receiving','U') IS NULL
    THROW 50101, 'Original receiving table is missing or not visible.', 1;
IF OBJECT_ID('dbo.RMA_return_units','U') IS NOT NULL
    THROW 50102, 'A separate units table exists. Review how to merge its IDs first.', 1;
IF COL_LENGTH('dbo.RMA_return_receiving','quantityKnown') IS NOT NULL
    RETURN;
IF COL_LENGTH('dbo.RMA_return_receiving','id') IS NOT NULL
    THROW 50103, 'Receiving already has IDs but no quantityKnown. Review this intermediate schema.', 1;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE referenced_object_id=OBJECT_ID('dbo.RMA_return_receiving') OR parent_object_id=OBJECT_ID('dbo.RMA_return_receiving'))
    THROW 50104, 'Receiving has foreign keys. Review them before changing its primary key.', 1;
IF EXISTS (SELECT 1 FROM sys.triggers WHERE parent_id=OBJECT_ID('dbo.RMA_return_receiving'))
    THROW 50105, 'Receiving has triggers. Review them before upgrading.', 1;
-- Reject unknown layouts rather than losing data or guessing their meaning.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.RMA_return_receiving') AND name NOT IN
    ('TrackingNumber','Company','Code','Remark','CreationDateTime','OrderNumber','Recorded'))
    THROW 50106, 'Receiving has additional legacy columns. Review before upgrading.', 1;
IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.RMA_return_receiving'))<>7
    THROW 50107, 'Receiving does not have the expected seven original columns.', 1;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.RMA_return_receiving') AND index_id>0 AND is_primary_key=0)
    THROW 50108, 'Receiving has custom indexes. Review before widening columns.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
    JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
    WHERE i.object_id=OBJECT_ID('dbo.RMA_return_receiving') AND i.is_primary_key=1 AND c.name='TrackingNumber'
    AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id=i.object_id AND x.index_id=i.index_id AND x.key_ordinal>0)=1)
    THROW 50109, 'Expected a primary key on TrackingNumber only. Review the actual keys.', 1;
DECLARE @before BIGINT;
SELECT @before=COUNT_BIG(*) FROM dbo.RMA_return_receiving WITH (TABLOCKX,HOLDLOCK);
-- Preserve the table object itself, original values, and table-level grants.
DECLARE @primary SYSNAME=(SELECT name FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID('dbo.RMA_return_receiving') AND type='PK');
DECLARE @dropPrimary NVARCHAR(1000)=N'ALTER TABLE dbo.RMA_return_receiving DROP CONSTRAINT '+QUOTENAME(@primary);
EXEC(@dropPrimary);
ALTER TABLE dbo.RMA_return_receiving ALTER COLUMN TrackingNumber NVARCHAR(255) NOT NULL;
ALTER TABLE dbo.RMA_return_receiving ALTER COLUMN Company NVARCHAR(255) NULL;
ALTER TABLE dbo.RMA_return_receiving ALTER COLUMN Code NVARCHAR(255) NULL;
ALTER TABLE dbo.RMA_return_receiving ALTER COLUMN Remark NVARCHAR(MAX) NULL;
ALTER TABLE dbo.RMA_return_receiving ALTER COLUMN OrderNumber NVARCHAR(255) NULL;
ALTER TABLE dbo.RMA_return_receiving ADD
    id INT IDENTITY(1,1) NOT NULL,
    laptop NVARCHAR(255) NOT NULL DEFAULT '',
    receivedDate DATE NULL,
    images NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    inspectionDate DATE NULL,
    pallet NVARCHAR(255) NOT NULL DEFAULT '',
    serial NVARCHAR(255) NOT NULL DEFAULT '',
    serialKey NVARCHAR(255) NULL,
    groupId NVARCHAR(64) NOT NULL DEFAULT '',
    unitIndex INT NOT NULL DEFAULT 1,
    unitImages NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    inspectionRemark NVARCHAR(MAX) NOT NULL DEFAULT '',
    shipDate DATE NULL,
    shipBatch NVARCHAR(64) NOT NULL DEFAULT '',
    shipBatchNumber INT NULL,
    bulkType NVARCHAR(255) NOT NULL DEFAULT 'REGULAR',
    legacyId INT NULL,
    quantityKnown BIT NOT NULL DEFAULT 1;
-- Dynamic SQL compiles only after the new columns exist.
EXEC(N'UPDATE dbo.RMA_return_receiving SET receivedDate=CONVERT(DATE,CreationDateTime),
    legacyId=id,groupId=''legacy_''+CONVERT(VARCHAR(20),id),quantityKnown=0;
    ALTER TABLE dbo.RMA_return_receiving ALTER COLUMN receivedDate DATE NOT NULL;
    ALTER TABLE dbo.RMA_return_receiving ADD DEFAULT CONVERT(DATE,SYSUTCDATETIME()) FOR receivedDate;
    ALTER TABLE dbo.RMA_return_receiving ADD CONSTRAINT PK_receiving_unit_id PRIMARY KEY (id);
    CREATE UNIQUE INDEX UX_receiving_serial ON dbo.RMA_return_receiving(serialKey) WHERE serialKey IS NOT NULL;
    CREATE UNIQUE INDEX UX_receiving_legacy ON dbo.RMA_return_receiving(legacyId) WHERE legacyId IS NOT NULL;
    CREATE INDEX IX_receiving_tracking ON dbo.RMA_return_receiving(TrackingNumber);
    CREATE INDEX IX_receiving_group ON dbo.RMA_return_receiving(groupId);
    CREATE INDEX IX_receiving_pallet ON dbo.RMA_return_receiving(pallet);');
IF (SELECT COUNT_BIG(*) FROM dbo.RMA_return_receiving)<>@before
    THROW 50110, 'Receiving row count changed unexpectedly. Roll back.', 1;
