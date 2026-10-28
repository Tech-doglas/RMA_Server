# RMA System

A web application for return receiving, warehouse inspection, pallet management,
shipping, and PC / Non-PC inventory. It includes a React frontend and a Flask API,
with SQLite for local use and SQL Server support for NAS deployments.

## Features

- **Returns / 3PL:** receive deliveries, capture UPC/item codes and serial numbers,
  attach shipping-label and unit photos, and print individual File Number labels.
- **Inspection and shipping:** record inspection results, assign pallets, manage
  pallet status, ship inspected units in numbered batches, and view monthly reports.
- **Inventory:** manage PC and Non-PC records, photos, inspection work, and sales.
- **Historical records:** view previous receiving and SnowBell records; confirm
  historical quantities before using the unit inspection workflow.
- **Administration:** approve registrations, manage accounts and departments, assign
  action permissions and company access, and review record changes and removals.

Each received unit has a File Number such as `sid-0001`. A delivery can contain
1–100 units. Tracking number, received date, company, and each unit's UPC/item code
are required. Serial numbers are optional at receiving and required for inspection.
Inspection cannot precede receipt, and shipping cannot precede inspection.

## Project layout

```text
backend/
  app/                    Flask routes, permissions, storage, and upload handling
  migrations/             SQL Server migration scripts
  tests/                  Backend tests
  create_admin.py          Create the first administrator
  run.py                   Local development server
  nas_wsgi.py              NAS deployment entry point
  upgrade_sqlserver.py     Explicit SQL Server upgrade tool
frontend/
  src/                     React application and frontend tests
  public/                  Static assets
  package-lock.json        Locked frontend dependencies
docs/                      Deployment instructions and user guides
scripts/package-fnos.py    Create the NAS source archive
compose.fnos.yaml          NAS deployment using SQLite
compose.fnos-mssql.yaml    NAS deployment using SQL Server
fnos.env.example           Example NAS settings
```

## Local setup on Windows

Use **Python 3.12**, **Node.js 22 with npm**, and Git. These Python and Node versions
match the NAS build images. SQLite mode does not require a running SQL Server or
the Microsoft SQL Server ODBC driver; Python dependencies still include `pyodbc`.

The commands below use PowerShell and start from the repository root.

### 1. Install backend dependencies

```powershell
py -3.12 -m venv backend/venv
.\backend\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

If Python 3.12 is available through `python` instead of the Windows `py` launcher,
use `python -m venv backend/venv` for the first command.

### 2. Create an administrator and start the backend

Set these variables in the terminal used for both commands:

```powershell
$env:DATABASE_BACKEND = "sqlite"
$env:MODI_RMA_DIR = Join-Path (Get-Location).Path "backend/storage"
$env:SQLITE_PATH = Join-Path $env:MODI_RMA_DIR "rma.sqlite3"
$env:RMA_LOG_DIR = Join-Path (Get-Location).Path "backend/logs"

.\backend\venv\Scripts\python.exe backend/create_admin.py --username admin
.\backend\venv\Scripts\python.exe backend/run.py
```

The first command initializes local storage, creates the administrator, and prints
a generated password. Store it privately and change it after signing in. There
is no default password. Run account creation once; it refuses to overwrite an
existing username. On later starts, set the same environment variables and run
only `backend/run.py`.

The API listens on `http://localhost:8088`. The development server is for local
use; use the deployment instructions below for the NAS.

### 3. Start the frontend

Open a second PowerShell terminal at the repository root:

```powershell
cd frontend
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the generated
administrator account. The frontend uses the same hostname on port `8088` for the
API by default. Install dependencies in each checkout with `npm ci`; copying
`node_modules` from another folder can break package resolution.

### 4. Configure staff access

Use the admin console to review companies, departments, and permissions before
adding staff. Public registration creates a pending account; an administrator
must assign its department and approve it before login is allowed.

Company access and action permissions are both enforced by the backend. PC,
Non-PC, and SnowBell inventory areas require internal-staff company access.

## Configuration

Set backend settings as process environment variables before starting Python.
The local commands above set storage paths explicitly because Windows and Linux
defaults differ. The backend setup does not depend on a `.env` loader.

| Variable | Purpose |
| --- | --- |
| `DATABASE_BACKEND` | `sqlite` or `mssql`. Defaults to SQLite on Windows and SQL Server on Linux. |
| `MODI_RMA_DIR` | Storage root for photos and the generated session signing key. |
| `SQLITE_PATH` | SQLite database path; defaults to `rma.sqlite3` inside the storage root. |
| `RMA_LOG_DIR` | Directory for rotating application logs. |
| `RMA_SECRET_KEY` | Optional persistent session signing secret. If unset, the app creates and reuses `.session-key` in the storage root. |
| `RMA_TRUSTED_ORIGINS` | Optional comma-separated additional browser origins, including their scheme and port. |
| `SQL_SERVER`, `SQL_DATABASE` | SQL Server address and database when using `mssql`. |
| `SQL_USER`, `SQL_PASSWORD` | SQL Server application credentials. |
| `SQL_DRIVER` | ODBC driver name; defaults to `{ODBC Driver 18 for SQL Server}`. |
| `SQL_TRUST_CERT` | Whether to trust the SQL Server certificate; defaults to `no`. |
| `REACT_APP_API_URL` | Frontend API base URL, set before starting or building React. |

For direct local development, leave `REACT_APP_API_URL` unset unless using a
different API address. NAS builds set it to `/api` and use Nginx to route requests
to the backend. A static frontend build alone does not provide that API proxy.

Docker Compose reads the deployment `.env` beside its Compose file. Start from
`fnos.env.example` for a new deployment and preserve an existing deployment's
settings during updates.

## Tests and production build

Run backend tests from the repository root:

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s backend/tests
```

Run frontend tests and build from `frontend`:

```powershell
cd frontend
$env:CI = "true"
npm test -- --watchAll=false --runInBand

$env:REACT_APP_API_URL = "/api"
$env:GENERATE_SOURCEMAP = "false"
npm run build
```

The production output is written to `frontend/build`. The API setting above
matches the NAS reverse-proxy configuration. Clear `REACT_APP_API_URL` or open a
new terminal before returning to direct local development.

The test suite covers authentication, department and company permissions,
receiving, uploads, record editing, migrations, shipping, and frontend workflows.
Backend tests use temporary SQLite databases and mocked SQL Server connections;
they do not validate a live NAS or SQL Server deployment.

## NAS deployment

Choose the guide for the database you intend to use:

| Deployment | Guide |
| --- | --- |
| Move an existing local SQLite installation to fnOS | [SQLite deployment](docs/FNOS_DEPLOYMENT.md) |
| Connect the NAS application to SQL Server | [SQL Server deployment](docs/FNOS_SQLSERVER.md) |
| Upgrade the supported original SQL Server schema | [Legacy production upgrade](docs/FNOS_PRODUCTION_UPGRADE.md) |
| Apply the October 2026 UPC and item-information update | [Update procedure](docs/DEPLOY_2026-10-16.md) |

Use the `Dockerfile.fnos` files and the matching Compose file. The SQLite and SQL
Server Compose files are separate deployment options. Follow the selected guide
for paths, ownership, credentials, ports, HTTPS, and backup requirements.

The SQLite NAS entry point requires an existing, nonempty database. The SQL Server
entry point checks required tables and columns at startup without applying
migrations. SQL upgrades are performed explicitly through `upgrade_sqlserver.py`;
follow the upgrade guide rather than running every migration in filename order.

To package deployment source, run from the repository root:

```powershell
.\backend\venv\Scripts\python.exe scripts/package-fnos.py
```

This creates `dist/rma-fnos-source.zip` and verifies the archive. It includes the
application and deployment instructions. Databases, credentials, session keys,
uploaded photos, and installed dependencies are excluded and must be managed
separately.

## Data and backups

With the local settings above, persistent data lives in `backend/storage`:

```text
backend/storage/
  rma.sqlite3
  .session-key
  images/
  backups/                 Created when a backup or migration needs it
```

Back up the database and photos together. For a filesystem copy of SQLite,
stop the backend first and copy the complete storage folder, including any
remaining WAL/SHM files. A database-only backup does not include photos. SQL Server
deployments also need a separate backup of the mounted photo folder.

Preserve the session signing key across restarts. Keep credentials, databases,
photos, logs, and local dependency folders out of Git; the repository ignore
rules cover the standard generated locations.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Frontend cannot find React or another package | Run `npm ci` inside `frontend`; do not reuse copied dependency folders. |
| Frontend cannot reach the API | Confirm the backend is running on port `8088` and the frontend API setting matches your setup. |
| Browser origin is rejected | Use the same hostname for frontend and API, or configure the exact additional origin in `RMA_TRUSTED_ORIGINS`. |
| Registration cannot log in | Assign a department and approve the pending account in the admin console. |
| Staff cannot see a company or action | Review the department's company assignments and action permissions. |
| SQL startup reports missing columns | Use the SQL deployment guide's read-only schema diagnosis before choosing an upgrade. |
| NAS container cannot write data or logs | Check mounted paths and the configured `RMA_UID` / `RMA_GID`. |
| Historical photos are missing | Check the original photo folders and mounts; a database restore does not restore photo files. |

SnowBell request submission currently returns “not configured”; that integration
must be implemented before it can submit requests.

## User guides

- [Illustrated user guide (PDF)](docs/user-guide/RMA_System_Illustrated_User_Guide.pdf)
- [Illustrated user guide (Word)](docs/user-guide/RMA_System_Illustrated_User_Guide.docx)
- [SnowBell user guide (Word)](docs/Snowbell_RMA_User_Guide.docx)

## License

This project is licensed under the [MIT License](LICENSE).
