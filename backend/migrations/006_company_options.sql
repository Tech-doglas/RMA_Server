IF OBJECT_ID('dbo.RMA_return_companies', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RMA_return_companies (name NVARCHAR(255) NOT NULL PRIMARY KEY);
    INSERT INTO dbo.RMA_return_companies (name)
    VALUES ('SNOWBELL/XIE/PITY TECH'), ('PX/LEO/KRIZY'), ('Others');
    INSERT INTO dbo.RMA_return_companies (name)
    SELECT DISTINCT LTRIM(RTRIM(company)) FROM dbo.RMA_return_units
    WHERE LTRIM(RTRIM(COALESCE(company, ''))) <> ''
    AND NOT EXISTS (SELECT 1 FROM dbo.RMA_return_companies c WHERE c.name = LTRIM(RTRIM(company)));
END;
