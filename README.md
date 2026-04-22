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
## Deployment

### Prerequisites
- Docker & Docker Buildx on your Mac
- Docker on the server (managed via 1Panel)
- Docker Hub account: `your_docker_hub_account`

### 1. Build & Push (on Mac)

First time setup:
```bash
docker buildx create --name mybuilder --use
docker buildx inspect --bootstrap
docker login
```

Build and push both images:
```bash
./dockerBuilder.sh
```

This builds `linux/amd64` images (for the x86_64 server) and pushes:
- `your_docker_hub_account/react-frontend:latest`
- `your_docker_hub_account/backend:latest`

### 2. Deploy (on server via SSH)

First time setup — copy `docker-compose.yml` to server:
```bash
scp docker-compose.yml user@server_ip_address:/vol1/user/folder/docker-compose.yml
```

Start the containers:
```bash
ssh user@server_ip_address
cd /vol1/user/folder/
sudo docker compose pull
sudo docker compose up -d
```

### 3. Upgrade (future deployments)

On Mac:
```bash
./dockerBuilder.sh
```

On server:
```bash
cd /vol1/user/folder
sudo docker compose pull
sudo docker compose down
sudo docker compose up -d
```

### Volume Mounts
| Host Path | Container Path | Purpose |
|---|---|---|
| `/your/shared/storage` | `/vol1/1001/RMA` | Backend image storage |
| `/your/shared/storage` | `/usr/share/nginx/html/files` | Frontend file serving |
| `/your/log/directory` | `/logs` | Backend log files |

### Ports
| Service | Host Port | Container Port |
|---|---|---|
| Frontend (nginx) | 3000 | 80 |
| Backend (Flask) | 8088 | 8088 |

### Database Backup
Cron job runs daily at 18:00, backing up the RMA database from the MSSQL container. Old backups (>7 days) are auto-deleted at 18:30.

## Author

- **Danny**

## Contributors

- Toby