-- Back up the database first. Run with the application stopped.
-- Uses the original receiving table for historical records and new units.
-- The upgrade table is temporary; no parallel receiving store remains.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH('dbo.RMA_return_receiving','quantityKnown') IS NOT NULL
    BEGIN
        IF OBJECT_ID('dbo.RMA_return_units','U') IS NOT NULL
            THROW 50001, 'Both upgraded receiving storage and an old units table exist. Review before merging.', 1;
        COMMIT;
        RETURN;
    END;
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE referenced_object_id IN
        (OBJECT_ID('dbo.RMA_return_receiving'),OBJECT_ID('dbo.RMA_return_units')))
        THROW 50002, 'Receiving has external foreign keys. Review these dependencies before upgrading.', 1;
    IF EXISTS (SELECT 1 FROM sys.triggers WHERE parent_id IN
        (OBJECT_ID('dbo.RMA_return_receiving'),OBJECT_ID('dbo.RMA_return_units')))
        THROW 50003, 'Receiving has custom triggers. Review them before upgrading.', 1;

    DECLARE @high INT=0, @oldCount INT=0, @unitCount INT=0, @newCount INT;
    IF OBJECT_ID('dbo.RMA_return_units','U') IS NOT NULL
        EXEC sys.sp_executesql N'SELECT @h=COALESCE(MAX(id),0),@n=COUNT(*) FROM dbo.RMA_return_units WITH (TABLOCKX,HOLDLOCK);
            SET @h=CASE WHEN COALESCE(IDENT_CURRENT(''dbo.RMA_return_units''),0)>@h THEN CONVERT(INT,IDENT_CURRENT(''dbo.RMA_return_units'')) ELSE @h END;',
            N'@h INT OUTPUT,@n INT OUTPUT',@high OUTPUT,@unitCount OUTPUT;
    IF OBJECT_ID('dbo.RMA_return_admin_audit','U') IS NOT NULL
        EXEC sys.sp_executesql N'SELECT @h=CASE WHEN COALESCE(MAX(TRY_CONVERT(INT,target)),0)>@h THEN MAX(TRY_CONVERT(INT,target)) ELSE @h END
            FROM dbo.RMA_return_admin_audit WITH (TABLOCKX,HOLDLOCK) WHERE action=''remove unit'';',N'@h INT OUTPUT',@high OUTPUT;
    IF OBJECT_ID('dbo.RMA_return_receiving','U') IS NOT NULL
        EXEC sys.sp_executesql N'SELECT @n=COUNT(*) FROM dbo.RMA_return_receiving WITH (TABLOCKX,HOLDLOCK);',N'@n INT OUTPUT',@oldCount OUTPUT;

    CREATE TABLE dbo.RMA_return_receiving__upgrade (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TrackingNumber NVARCHAR(255) NOT NULL DEFAULT '',
        Company NVARCHAR(255) NOT NULL DEFAULT '', Code NVARCHAR(255) NOT NULL DEFAULT '',
        Remark NVARCHAR(MAX) NOT NULL DEFAULT '',
        CreationDateTime DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        OrderNumber NVARCHAR(255) NOT NULL DEFAULT '', Recorded BIT NOT NULL DEFAULT 0,
        laptop NVARCHAR(255) NOT NULL DEFAULT '', receivedDate DATE NOT NULL DEFAULT CONVERT(DATE,SYSUTCDATETIME()),
        images NVARCHAR(MAX) NOT NULL DEFAULT '[]', inspectionDate DATE NULL,
        pallet NVARCHAR(255) NOT NULL DEFAULT '', serial NVARCHAR(255) NOT NULL DEFAULT '', serialKey NVARCHAR(255) NULL,
        groupId NVARCHAR(64) NOT NULL DEFAULT '', unitIndex INT NOT NULL DEFAULT 1,
        unitImages NVARCHAR(MAX) NOT NULL DEFAULT '[]', inspectionRemark NVARCHAR(MAX) NOT NULL DEFAULT '',
        shipDate DATE NULL, shipBatch NVARCHAR(64) NOT NULL DEFAULT '', shipBatchNumber INT NULL,
        bulkType NVARCHAR(255) NOT NULL DEFAULT 'REGULAR', legacyId INT NULL,
        quantityKnown BIT NOT NULL DEFAULT 1
    );
    SET IDENTITY_INSERT dbo.RMA_return_receiving__upgrade ON;
    IF @unitCount>0
        EXEC(N'INSERT INTO dbo.RMA_return_receiving__upgrade
            (id,CreationDateTime,TrackingNumber,laptop,receivedDate,Remark,images,inspectionDate,pallet,serial,serialKey,
             groupId,unitIndex,unitImages,inspectionRemark,shipDate,shipBatch,shipBatchNumber,bulkType,Company)
            SELECT id,timestamp,tracking,laptop,receivedDate,remark,images,inspectionDate,pallet,serial,serialKey,
             groupId,unitIndex,unitImages,inspectionRemark,shipDate,shipBatch,shipBatchNumber,bulkType,company FROM dbo.RMA_return_units');
    IF @oldCount>0
    BEGIN
        DECLARE @legacyExpression NVARCHAR(200) = CASE WHEN COL_LENGTH('dbo.RMA_return_receiving','id') IS NOT NULL
            THEN 'id' ELSE 'ROW_NUMBER() OVER(ORDER BY TrackingNumber)' END;
        DECLARE @import NVARCHAR(MAX)=N'INSERT INTO dbo.RMA_return_receiving__upgrade
            (id,TrackingNumber,Company,Code,Remark,CreationDateTime,OrderNumber,Recorded,receivedDate,groupId,unitIndex,legacyId,quantityKnown)
            SELECT @h+ROW_NUMBER() OVER(ORDER BY TrackingNumber),TrackingNumber,COALESCE(Company,''''),COALESCE(Code,''''),COALESCE(Remark,''''),
            CreationDateTime,COALESCE(OrderNumber,''''),COALESCE(Recorded,0),CONVERT(DATE,CreationDateTime),
            ''legacy_''+CONVERT(VARCHAR(20),'+@legacyExpression+'),1,'+@legacyExpression+',0 FROM dbo.RMA_return_receiving';
        EXEC sys.sp_executesql @import,N'@h INT',@high;
    END;
    SET IDENTITY_INSERT dbo.RMA_return_receiving__upgrade OFF;
    SELECT @newCount=COUNT(*) FROM dbo.RMA_return_receiving__upgrade;
    IF @newCount<>@oldCount+@unitCount
        THROW 50004, 'Receiving row counts differ; the upgrade has been rolled back.', 1;
    IF @oldCount>0
        EXEC(N'IF EXISTS (SELECT TrackingNumber,COALESCE(Company,''''),COALESCE(Code,''''),COALESCE(Remark,''''),CreationDateTime,COALESCE(OrderNumber,''''),COALESCE(Recorded,0)
            FROM dbo.RMA_return_receiving EXCEPT SELECT TrackingNumber,Company,Code,Remark,CreationDateTime,OrderNumber,Recorded
            FROM dbo.RMA_return_receiving__upgrade WHERE legacyId IS NOT NULL)
            THROW 50005, ''Historical receiving values differ; upgrade rolled back.'', 1;');
    IF @unitCount>0
        EXEC(N'IF EXISTS (SELECT id,timestamp,tracking,laptop,receivedDate,remark,images,inspectionDate,pallet,serial,serialKey,groupId,unitIndex,
            unitImages,inspectionRemark,shipDate,shipBatch,shipBatchNumber,bulkType,company FROM dbo.RMA_return_units
            EXCEPT SELECT id,CreationDateTime,TrackingNumber,laptop,receivedDate,Remark,images,inspectionDate,pallet,serial,serialKey,groupId,unitIndex,
            unitImages,inspectionRemark,shipDate,shipBatch,shipBatchNumber,bulkType,Company FROM dbo.RMA_return_receiving__upgrade WHERE legacyId IS NULL)
            THROW 50006, ''Existing unit values differ; upgrade rolled back.'', 1;');
    IF OBJECT_ID('dbo.RMA_return_receiving','U') IS NOT NULL DROP TABLE dbo.RMA_return_receiving;
    IF OBJECT_ID('dbo.RMA_return_units','U') IS NOT NULL DROP TABLE dbo.RMA_return_units;
    EXEC sys.sp_rename 'dbo.RMA_return_receiving__upgrade','RMA_return_receiving';
    EXEC(N'CREATE UNIQUE INDEX UX_receiving_serial ON dbo.RMA_return_receiving(serialKey) WHERE serialKey IS NOT NULL;
        CREATE UNIQUE INDEX UX_receiving_legacy ON dbo.RMA_return_receiving(legacyId) WHERE legacyId IS NOT NULL;
        CREATE INDEX IX_receiving_tracking ON dbo.RMA_return_receiving(TrackingNumber);
        CREATE INDEX IX_receiving_group ON dbo.RMA_return_receiving(groupId);
        CREATE INDEX IX_receiving_pallet ON dbo.RMA_return_receiving(pallet);');
    DECLARE @seed INT;
    EXEC sys.sp_executesql N'SELECT @s=COALESCE(MAX(id),0) FROM dbo.RMA_return_receiving',N'@s INT OUTPUT',@seed OUTPUT;
    IF @high>@seed SET @seed=@high;
    IF @seed>0
    BEGIN
        DECLARE @reseed NVARCHAR(300)=N'DBCC CHECKIDENT (''dbo.RMA_return_receiving'', RESEED, '+CONVERT(NVARCHAR(20),@seed)+') WITH NO_INFOMSGS';
        EXEC(@reseed);
    END;
    IF OBJECT_ID('dbo.RMA_return_companies','U') IS NOT NULL
        EXEC(N'INSERT INTO dbo.RMA_return_companies(name) SELECT DISTINCT Company FROM dbo.RMA_return_receiving r
            WHERE Company<>'''' AND NOT EXISTS(SELECT 1 FROM dbo.RMA_return_companies c WHERE c.name=r.Company)');
    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
END CATCH;
