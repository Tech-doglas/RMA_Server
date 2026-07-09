/* ============================================================
   Migration: extend RMA_return_receiving for the new "Returns" (RMA)
   workflow ported from the Snowbell RMA Google Apps Script.

   This is a NEW, parallel feature. It reuses the existing
   RMA_return_receiving table (as requested) but adds nullable columns
   so the current /return feature keeps working unchanged.

   Rows created by the new feature are tagged Source = 'RETURNS'.
   Rows from the old feature keep Source = NULL. The new API only ever
   reads/writes rows where Source = 'RETURNS'.

   Safe to run multiple times (each column is added only if missing).

   Column mapping (Google Script "Returns" sheet -> SQL column):
     ID              -> ItemID          (sequential per-unit number)
     Timestamp       -> CreationDateTime (existing column, reused)
     Tracking #      -> TrackingNumber   (existing column, reused)
     Laptop Name     -> LaptopName
     Received Date   -> ReceivedDate
     Remark          -> Remark           (existing column, reused)
     Images          -> stored on disk   (images/returns_label/<LabelRef>)
     Inspection Date -> InspectionDate
     Pallet          -> Pallet
     Quantity        -> Quantity
     Serial Numbers  -> Serial
     Group ID        -> GroupID
     Unit Index      -> UnitIndex
     Unit Images     -> stored on disk   (images/returns_unit/<ItemID>)
     Insp. Remark    -> InspectionRemark
     Ship Date       -> ShipDate
     Ship Batch ID   -> ShipBatch
     Bulk Type       -> BulkType
     File No         -> FileNo
   ============================================================ */

SET NOCOUNT ON;

IF COL_LENGTH('RMA_return_receiving', 'Source') IS NULL
    ALTER TABLE RMA_return_receiving ADD Source NVARCHAR(20) NULL;

IF COL_LENGTH('RMA_return_receiving', 'ItemID') IS NULL
    ALTER TABLE RMA_return_receiving ADD ItemID INT NULL;

IF COL_LENGTH('RMA_return_receiving', 'LabelRef') IS NULL
    ALTER TABLE RMA_return_receiving ADD LabelRef INT NULL;

IF COL_LENGTH('RMA_return_receiving', 'LaptopName') IS NULL
    ALTER TABLE RMA_return_receiving ADD LaptopName NVARCHAR(255) NULL;

IF COL_LENGTH('RMA_return_receiving', 'ReceivedDate') IS NULL
    ALTER TABLE RMA_return_receiving ADD ReceivedDate DATE NULL;

IF COL_LENGTH('RMA_return_receiving', 'InspectionDate') IS NULL
    ALTER TABLE RMA_return_receiving ADD InspectionDate DATE NULL;

IF COL_LENGTH('RMA_return_receiving', 'Pallet') IS NULL
    ALTER TABLE RMA_return_receiving ADD Pallet NVARCHAR(100) NULL;

IF COL_LENGTH('RMA_return_receiving', 'Quantity') IS NULL
    ALTER TABLE RMA_return_receiving ADD Quantity INT NULL;

IF COL_LENGTH('RMA_return_receiving', 'Serial') IS NULL
    ALTER TABLE RMA_return_receiving ADD Serial NVARCHAR(255) NULL;

IF COL_LENGTH('RMA_return_receiving', 'GroupID') IS NULL
    ALTER TABLE RMA_return_receiving ADD GroupID NVARCHAR(50) NULL;

IF COL_LENGTH('RMA_return_receiving', 'UnitIndex') IS NULL
    ALTER TABLE RMA_return_receiving ADD UnitIndex INT NULL;

IF COL_LENGTH('RMA_return_receiving', 'InspectionRemark') IS NULL
    ALTER TABLE RMA_return_receiving ADD InspectionRemark NVARCHAR(MAX) NULL;

IF COL_LENGTH('RMA_return_receiving', 'ShipDate') IS NULL
    ALTER TABLE RMA_return_receiving ADD ShipDate DATE NULL;

IF COL_LENGTH('RMA_return_receiving', 'ShipBatch') IS NULL
    ALTER TABLE RMA_return_receiving ADD ShipBatch NVARCHAR(50) NULL;

IF COL_LENGTH('RMA_return_receiving', 'BulkType') IS NULL
    ALTER TABLE RMA_return_receiving ADD BulkType NVARCHAR(50) NULL;

IF COL_LENGTH('RMA_return_receiving', 'FileNo') IS NULL
    ALTER TABLE RMA_return_receiving ADD FileNo NVARCHAR(50) NULL;
GO

/* Speeds up the per-unit lookups the new API does most often. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RMA_return_receiving_ItemID')
    CREATE INDEX IX_RMA_return_receiving_ItemID
        ON RMA_return_receiving (ItemID) WHERE ItemID IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RMA_return_receiving_Source')
    CREATE INDEX IX_RMA_return_receiving_Source
        ON RMA_return_receiving (Source);
GO
