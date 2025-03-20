# RMA Server

## Pre-installation Requirements
Ensure you have the following installed before proceeding:

-  **Python**
-  [**SQL Expess**](https://www.microsoft.com/en-ca/sql-server/sql-server-downloads)
-  [**ODBC Driver for SQL Server**](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server?view=sql-server-ver16)
-  *(option)* [SQL Server Management Studio (SSMS)](https://learn.microsoft.com/en-us/ssms/download-sql-server-management-studio-ssms?redirectedfrom=MSDN)

## Pre-Configuration
1. Open **SQL Server Configuration Manager**  
   - Navigate to **SQL Server Network Configuration** > **Protocols for SQLEXPRESS**  
   - Set **TCP/IP**: `Disabled` → `Enabled`  
   - Go to **IP Addresses** tab  
   - Set **TCP Port**: `1433`
   - Restart **SQL Server(SQLEXPRESS)**

## How to Use
Follow the steps below to set up and run the project:

1. Install the required dependencies by running:
   ```bash
   pip install -r requirements.txt
2. Start the Flask application using the command:
   ```bash
   python run.py
## Project Structure
```bash
    Will Finishe later
``` 

## Author

- **Danny**

## Contributors

- Toby