# RMA Server

## Unit-based return receiving

### Local use without a database server

Direct Windows startup uses a persistent SQLite database automatically. No SQL
Server service, ODBC driver, or manual migration is needed in this mode. Start
the backend and frontend, open the app, choose **Register**, and create your own
account. The database begins empty; no default account or sample records are added.
Data is stored in `backend/storage/rma.sqlite3`, alongside the local photo storage.
Back up the whole `backend/storage` folder with the server stopped to preserve
records and photos. Restarting the server does not clear data.

Receiving has an explicit quantity field (1–100). Each unit receives its own ID
and File Number, and the delivery quantity is derived from its saved unit group.
All staff can view every company in the new Returns list, filter the list, or
scan/type an exact ID or File Number into **Open unit**. Tracking groups show their
full quantity even when filters display only some of their units. Inspection and
shipping statuses appear separately.

Bulk types begin with `REGULAR` and `BULK_NEW`. Only admins can add, rename or
remove options at `/return/admin`. Renaming updates existing records; removing a
type moves its records to a selected replacement. `REGULAR` remains the default.
Staff can assign the available types to all units sharing a tracking number.
Admin sessions are checked on the server and expire after 12 hours.
Create an admin using `python create_admin.py` from the backend folder. It prints
a generated password once and never overwrites an existing account. Admins can
change their password on the admin page. Public registration cannot create admins.
Set `RMA_SECRET_KEY` for deployment or retain the automatically created
`storage/.session-key` across restarts. SQL Server requires migration
`backend/migrations/003_receiving_admin.sql`.

Admins can open any File Number, edit a unit, or remove it by typing its File
Number to confirm. Original record values are retained in `RMA_return_admin_audit`.
Photos are retained when a unit is removed. Serial uniqueness and inspection/
shipping eligibility are still enforced. ID and File Number cannot be edited.

The admin console also includes an overview, paginated return search, bulk type/
pallet/removal actions, account creation and editing, password resets, active/
disabled account status, filtered history, and restoration of removed returns.
CSV/JSON exports contain returns without account passwords. Local SQLite backups
are saved to `storage/backups`; photos require a separate copy of `storage/images`.
SQL Server account status requires `backend/migrations/004_admin_accounts.sql`.
Disabling accounts blocks login and existing admin sessions; admins cannot disable
or demote themselves or remove the last active admin. Account usernames stay fixed.
The account named `admin` always keeps its Admin role and Active status. Other
admins cannot disable it or change its role; this rule is enforced on the server.

Public registrations always create a pending Staff account. Users cannot log in
until an admin approves them in **Accounts**, where pending requests can also be
rejected. Invitation codes cannot grant elevated roles. Only admins can change
roles. Existing accounts stay approved, and accounts created directly by an admin
are approved by that action. SQLite adds the approval field automatically; SQL
Server requires `backend/migrations/005_registration_approval.sql`.

Use **Print file label** on a unit or **Print all file labels** after receiving a
delivery. Labels contain a Code 39 barcode, File Number, laptop name, tracking
number, and unit position. The label layout is 100 × 50 mm with one unit per page;
select matching paper in the printer dialog. **Print unit record** still prints
the full record. Actual output and scanner readability depend on the printer's
paper and scaling settings.

Set `DATABASE_BACKEND=mssql` to use an external SQL Server instead. Linux/Docker
continues to default to SQL Server. Set `DATABASE_BACKEND=sqlite` explicitly to
use local storage on Linux, with a writable `MODI_RMA_DIR`. `SQLITE_PATH` can
override the database file location. The SQL migration below is only needed in
SQL Server mode.

The Return Receiving pages now follow the supplied Snowbell Apps Script workflow:
receive a delivery with multiple laptops, shared label photos and individual unit
photos; inspect each unit with a unique serial and optional pallet; set bulk type
for all units sharing a tracking number; ship inspected units with a batch number;
and view or export monthly received/inspected/shipped totals.

Before deploying the updated backend **in SQL Server mode**, run
`backend/migrations/001_return_units.sql` against the **RMA** SQL Server database
using SQL Server Management Studio or your usual SQL migration tool. The script
is safe to rerun and creates a separate table, leaving the existing receiving
records intact. Previous records remain available under **Previous records**,
including their original detail and edit actions. They are excluded from the new
unit totals because older records do not identify individual laptops.

The application stores the new records in SQL Server and photos in the existing
`MODI_RMA_DIR/images/return_units` storage. It does not connect to the Google Sheet
or Google Drive. File numbers use `sid-0001` and shipment batches use `ship.0001`.
Tracking and photos are optional, matching the script; received date is required.
Up to 100 units can be received at once, with 5 JPEG/PNG photos per label or unit.
Each optimized image must be no larger than 4 MB. Serial numbers are unique
regardless of letter case. Submitted deliveries always create new unit records,
even if their tracking number matches an earlier delivery.

The frontend uses the current host on port 8088 by default. Set
`REACT_APP_API_URL` at build time if the backend has a different URL.

Backend workflow tests use a fake database and do not touch production records:
`python -m unittest discover -s backend/tests`. Build the frontend with
`npm run build` from `frontend` after installing its dependencies.

## Pre-installation Requirements
Ensure you have the following installed before proceeding:

-  **Python**
-  [**SQL Expess**](https://www.microsoft.com/en-ca/sql-server/sql-server-downloads)
-  [**ODBC Driver for SQL Server**](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server?view=sql-server-ver16)
-  *(option)* [SQL Server Management Studio (SSMS)](https://learn.microsoft.com/en-us/ssms/download-sql-server-management-studio-ssms?redirectedfrom=MSDN)

## Pre-Configuration

When running directly on Windows, backend logs and photos use `backend/logs`
and `backend/storage`. Override them with `RMA_LOG_DIR` and `MODI_RMA_DIR`.
The default SQL hostname is intended for the deployed Docker network. For local
startup, set `SQL_SERVER` to the database server's reachable address (for example
`tcp:your-server,1433` or a local SQL instance). Optional overrides are
`SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD`, and `SQL_DRIVER`. Install Microsoft
ODBC Driver 18 for SQL Server on the Windows machine running the backend.

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
| `/your/log/directory` | `/logs` | Backend log files |

### Ports
| Service | Host Port | Container Port |
|---|---|---|
| Frontend (nginx) | 3000 | 80 |
| Backend (Flask) | 8088 | 8088 |

### Database Backup
Cron job runs daily at 18:00, backing up the RMA database from the MSSQL container. Old backups (>7 days) are auto-deleted at 18:30.

## Security and local operation

- The Windows local server uses persistent SQLite; no separate database server is needed. Back up `backend/storage` before upgrades. Keep that directory private: it includes photos, the database, backups, and the signing key.
- Photo access goes through the authenticated backend. Do not mount storage into the frontend's public web directory. Nginx blocks the old `/files` path, and the backend Docker build excludes storage, logs, and environment files.
- Browser sessions use an HttpOnly, SameSite cookie. Logout revokes the session on the server; disabled accounts and department permission changes take effect on subsequent requests. New browser logins no longer save a token in local storage.
- Public registration requires a 12–255 character password and administrator approval. Existing passwords continue to work. Login failures and registration requests are throttled per server process; multi-worker deployments should also rate-limit at the reverse proxy.
- The browser frontend is allowed on the API's own host and on port 3000. For a separate frontend host, set backend `RMA_TRUSTED_ORIGINS` to its exact origins, comma-separated (for example `https://rma.example.com`). Use HTTPS for network deployments. Configure `REACT_APP_API_URL` when building the frontend for a different API address; keep frontend and API on the same site for SameSite cookies.
- SQL Server credentials must be supplied using `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, and `SQL_PASSWORD`. The source no longer contains a default password. Rotate any previously used embedded credential before a SQL Server deployment. Certificate verification is enabled by default; use a trusted server certificate.
- SQL Server deployments must apply numbered scripts in `backend/migrations` in order, including `009_session_revocation.sql`. SQLite schema updates run automatically on startup.
- Photos are checked as real JPEG/PNG images (up to 4 MB and 25 megapixels, five per upload) and re-encoded to remove embedded metadata. Old supported image files remain readable.
- Xie request submission was a placeholder that did not save anything. It now reports that submission is not configured; a request-storage workflow still needs to be defined before enabling it.

These controls and automated regression tests are a hardening pass, not a substitute for a production penetration test or ongoing dependency updates.

## Author

- **Danny**

## Contributors

- Toby
