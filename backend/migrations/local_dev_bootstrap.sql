/* ============================================================
   Local development bootstrap for the RMA database.

   Creates the RMA database and every table the backend queries,
   with columns inferred from the SQL statements in backend/app.
   Safe to run multiple times (everything is IF-NOT-EXISTS guarded).

   After running this, also run 2026-07_add_returns_columns.sql to
   add the "Returns" workflow columns to RMA_return_receiving.

   Usage (Windows auth against localhost\SQLEXPRESS):
     sqlcmd -S localhost\SQLEXPRESS -E -i local_dev_bootstrap.sql
   ============================================================ */

IF DB_ID('RMA') IS NULL
    CREATE DATABASE RMA;
GO

USE RMA;
GO

-- Users (Auth.py)
IF OBJECT_ID('RMA_users', 'U') IS NULL
CREATE TABLE RMA_users (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    username      NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(512) NOT NULL,
    role          NVARCHAR(50)  NOT NULL DEFAULT 'normal',
    department    NVARCHAR(50)  NOT NULL
);
GO

-- Return receiving (return_receiving_routes.py; base columns only --
-- the Returns-workflow columns come from 2026-07_add_returns_columns.sql
IF OBJECT_ID('RMA_return_receiving', 'U') IS NULL
CREATE TABLE RMA_return_receiving (
    ID               INT IDENTITY(1,1) PRIMARY KEY,
    TrackingNumber   NVARCHAR(255),
    OrderNumber      NVARCHAR(255),
    Company          NVARCHAR(255),
    Code             NVARCHAR(50),
    Remark           NVARCHAR(MAX),
    Recorded         BIT,
    CreationDateTime DATETIME DEFAULT GETDATE()
);
GO

-- Laptops (routes/laptop/, report.py)
IF OBJECT_ID('RMA_laptop_sheet', 'U') IS NULL
CREATE TABLE RMA_laptop_sheet (
    ID                   INT IDENTITY(1,1) PRIMARY KEY,
    Brand                NVARCHAR(255),
    Model                NVARCHAR(255),
    Spec                 NVARCHAR(255),
    UpDatedSpec          NVARCHAR(255),
    SerialNumber         NVARCHAR(255),
    OdooRef              NVARCHAR(255),
    Condition            NVARCHAR(50),
    Sealed               BIT,
    Stock                NVARCHAR(50),
    OrderNumber          NVARCHAR(255),
    Remark               NVARCHAR(MAX),
    OdooRecord           BIT,
    TechDone             BIT,
    TechDoneDate         DATETIME,
    SaleDate             DATETIME,
    LastModifiedUser     NVARCHAR(100),
    LastModifiedDateTime DATETIME,
    InputDate            DATETIME,
    InputUser            NVARCHAR(100)
);
GO

-- Non-laptop items (routes/non_laptop/, report.py)
IF OBJECT_ID('RMA_non_laptop_sheet', 'U') IS NULL
CREATE TABLE RMA_non_laptop_sheet (
    ID                   INT IDENTITY(1,1) PRIMARY KEY,
    TrackingNumber       NVARCHAR(255),
    Category             NVARCHAR(255),
    Name                 NVARCHAR(255),
    OdooRef              NVARCHAR(255),
    SKU                  NVARCHAR(255),
    Condition            NVARCHAR(50),
    ReceivedDate         DATE,
    OdooRecord           NVARCHAR(10),
    Remark               NVARCHAR(MAX),
    Location             NVARCHAR(255),
    OrderNumber          NVARCHAR(255),
    SaleDate             DATETIME,
    InspectionRequest    NVARCHAR(10),
    ReadyToSale          BIT,
    OrderDistributed     BIT,
    LastModifiedUser     NVARCHAR(100),
    LastModifiedDateTime DATETIME,
    InputDate            DATETIME
);
GO

-- Xie laptop returns (routes/xie/xie_routes.py)
IF OBJECT_ID('xie_laptop_return', 'U') IS NULL
CREATE TABLE xie_laptop_return (
    id                     INT IDENTITY(1,1) PRIMARY KEY,
    order_number           NVARCHAR(255),
    tracking_number        NVARCHAR(255),
    laptop_name            NVARCHAR(255),
    customer_name          NVARCHAR(255),
    remark                 NVARCHAR(MAX),
    serial_number          NVARCHAR(255),
    return_id              NVARCHAR(50),
    condition              NVARCHAR(100),
    location               NVARCHAR(255),
    tracking_received_date DATE,
    inspection_date        DATE,
    delivery_date          DATE,
    last_modified_user     NVARCHAR(100),
    last_modified_datetime DATETIME,
    return_type            NVARCHAR(50)
);
GO

