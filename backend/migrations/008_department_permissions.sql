IF OBJECT_ID('dbo.RMA_departments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_departments (name NVARCHAR(255) NOT NULL PRIMARY KEY);
    CREATE TABLE dbo.RMA_department_permissions (
        department NVARCHAR(255) NOT NULL REFERENCES dbo.RMA_departments(name),
        permission NVARCHAR(100) NOT NULL,
        PRIMARY KEY (department, permission)
    );
    INSERT INTO dbo.RMA_departments (name) VALUES ('IT'), ('Tech'), ('SnowBell'), ('Accounting'), ('Sale'), ('Warehouse');
    INSERT INTO dbo.RMA_departments (name)
    SELECT DISTINCT department FROM dbo.RMA_users u WHERE department IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM dbo.RMA_departments d WHERE d.name = u.department);
    INSERT INTO dbo.RMA_department_permissions (department, permission)
    SELECT d.name, p.permission FROM dbo.RMA_departments d
    CROSS JOIN (VALUES
        (N'return.view'),
        (N'return.receive'),
        (N'return.photos'),
        (N'return.inspect'),
        (N'return.classify'),
        (N'return.pallet_view'),
        (N'return.pallet_status'),
        (N'return.ship'),
        (N'return.report'),
        (N'return.edit'),
        (N'return.delete'),
        (N'return.restore'),
        (N'return.export'),
        (N'return.print'),
        (N'pc.view'),
        (N'pc.create'),
        (N'pc.edit'),
        (N'pc.delete'),
        (N'pc.photos'),
        (N'pc.inspect'),
        (N'pc.sell'),
        (N'pc.report'),
        (N'nonpc.view'),
        (N'nonpc.create'),
        (N'nonpc.edit'),
        (N'nonpc.delete'),
        (N'nonpc.photos'),
        (N'nonpc.request'),
        (N'nonpc.ready'),
        (N'nonpc.sell'),
        (N'nonpc.distribute'),
        (N'legacy.view'),
        (N'legacy.create'),
        (N'legacy.edit'),
        (N'legacy.photos'),
        (N'xie.view'),
        (N'xie.create'),
        (N'xie.edit'),
        (N'xie.request'),
        (N'xie.photos'),
        (N'directory.view')
    ) p(permission)
    WHERE (d.name IN ('IT', 'Tech', 'Accounting', 'Sale', 'Warehouse')
    OR (d.name = 'SnowBell' AND p.permission NOT LIKE 'pc.%' AND p.permission NOT LIKE 'nonpc.%'))
    AND p.permission NOT IN ('return.edit', 'return.delete', 'return.restore', 'return.export');
END;
