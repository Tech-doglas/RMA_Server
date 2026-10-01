-- Existing accounts keep access; public registrations explicitly start pending.
IF COL_LENGTH('dbo.RMA_users', 'approvalStatus') IS NULL
    ALTER TABLE dbo.RMA_users ADD approvalStatus NVARCHAR(20) NOT NULL DEFAULT 'approved';
