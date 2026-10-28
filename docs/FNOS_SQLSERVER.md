# Connect the new NAS app to the production SQL Server

This uses the live `RMA` database in `1Panel-mssql-oP05`. It does not import or
synchronize SQLite data. Edits, receiving, shipping, account changes and deletions
through either app affect production. The SQL account must have the appropriate
application read/write permissions; use a dedicated account, not SA.

The existing production schema may be older than the new application. The new
entry point checks required tables and columns using SELECT TOP (0) before serving
requests. It does not execute migrations. A successful check confirms connection
and required columns, not old/new application compatibility, write permissions,
indexes or a full workflow test. Review these on a restored copy before using both
versions with the same live database.

If columns are missing, stop here and review `backend/migrations` with a verified
backup. Do not blindly run the receiving migration against a database still used
by the old app: it can rebuild receiving storage and change historical IDs. An
automatic schema upgrade is deliberately not part of this deployment.

## Files and configuration

Extract the updated source ZIP over the source files in
`/vol1/1011/Development/RMA-staging`, preserving `.env`, `data` and `logs`.
Use the standalone `compose.fnos-mssql.yaml`; do not merge it with the SQLite
Compose file using two `-f` arguments.

Keep the existing RMA_UID/RMA_GID, data and log settings. Edit the NAS `.env`:

```dotenv
RMA_PORT=3001
SQL_SERVER=1Panel-mssql-oP05,1433
SQL_DATABASE=RMA
SQL_USER=rma_staging
SQL_PASSWORD='replace-with-the-existing-SQL-login-password'
SQL_TRUST_CERT=yes
RMA_IMAGES_DIR=/vol1/1001/RMA/images
```

`rma_staging` is an example login name, not a login this package creates. Use a
valid SQL login and password supplied by your SQL administrator. The app's web
login, NAS password and SQL login are different credentials. Do not paste
credentials in chat. Single quotes in Compose `.env` prevent dollar-sign
interpolation; escape any embedded single quote according to Compose syntax.
Restrict `.env` access with `chmod 600 .env`.

The backend joins the existing `1panel-network` and connects to SQL at its
container port 1433. You do not need to expose an additional NAS/router SQL port.
The unique `rma_sql_backend` service name avoids a DNS alias collision with the
production service called `backend`; the `backend` alias exists only on staging's
private network. The frontend stays on staging's private network.

SQL_TRUST_CERT=yes permits the SQL container's self-signed certificate. For a
trusted SQL certificate and matching server hostname, use no instead.

The shared photo mount must exist and be readable/writable by RMA_UID/RMA_GID.
Photo uploads and deletions also affect production. Staging keeps its own
`data/.session-key` and logs. Its SQLite file stays on disk but is not used.
Existing SQLite-only accounts, permissions and records do not transfer to SQL.

## Build and run the read-only check

In NAS SSH:

```sh
cd /vol1/1011/Development/RMA-staging
sudo docker compose -p rma -f compose.fnos-mssql.yaml config --quiet
sudo docker compose -p rma -f compose.fnos-mssql.yaml build
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python -m app.sqlserver_check
```

Use `config --quiet`, not plain `config`, so the password is not printed.
The preflight creates local logs/session key if needed but writes nothing to SQL.
If it reports missing schema or a login failure, resolve that before switching.
Changing Docker environment variables does not reset an existing SQL password.

### Startup fails at RMA_return_receiving

This means a connection was established, but the required-column query failed.
It is not evidence that the password is wrong. Keep the old app serving staff
until the new schema and permissions are ready. To list all database gaps, extract
the current source ZIP (preserve `.env`, `data`, and `logs`) and run:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml build rma_sql_backend
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python -m app.sqlserver_check --diagnose
```

This returns column names only, not records or credentials, and changes no SQL
data. A report containing issues exits with code 1 intentionally. Missing columns
are listed by name. An unavailable table can mean a missing table, insufficient
SELECT permissions, or a connection problem; inspect that before choosing a
migration. Column names alone do not verify types, indexes, write permissions,
or compatibility with the old application. Do not bypass the startup check.

If the logs also show `Control server error` and a read-only `/home/rma`, rebuild
using the current `Dockerfile.fnos`. It disables Gunicorn's optional control socket
with `--no-control-socket`; Docker manages the process. This fixes that separate
filesystem error while retaining the read-only container filesystem. It does not
resolve missing SQL schema.

## Replace production on port 3000

For the legacy layout reported on October 6 (no receiving `id`, no user
`isActive`/`approvalStatus`, and absent workflow support tables), follow the
[tested legacy production upgrade](FNOS_PRODUCTION_UPGRADE.md) first. It upgrades
the original receiving table in place and supplies the missing supporting tables.

Use this path when the new application should replace the old production app,
rather than remain available on port 3001. The NAS folder `RMA-staging` can stay the same. The Compose project is now `rma`;
its connection and published port determine its use.

1. Complete the build and read-only check above while the existing production app
   is still running. A failed check is a stop condition: keep production running,
   resolve the SQL login or review the missing schema first. Passing this check
   does not replace testing the new workflows and account permissions on a
   restored copy. SQLite staging accounts do not become SQL Server accounts.
2. Before any schema upgrade, verify a recent SQL Server backup can be restored,
   and back up the production photo folder. Review and test any needed migrations
   on that restored copy. Arrange a maintenance window, stop application writes,
   take a final backup, then apply the reviewed migrations. Keep SQL Server itself
   running. Do not run every migration blindly against production.
3. Once compatibility and an approved SQL-backed administrator account are
   verified, edit the existing `.env` and set `RMA_PORT=3000`. Keep the SQL settings
   and `RMA_IMAGES_DIR` from above. Validate before stopping the old services:

   ```sh
   cd /vol1/1011/Development/RMA-staging
   sudo docker compose -p rma -f compose.fnos-mssql.yaml config --quiet
   sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python -m app.sqlserver_check
   ```

4. After those commands succeed and the maintenance prerequisites above are met,
   stop the old application containers and the existing staging services. Preserve
   the old production containers/images; do not stop `1Panel-mssql-oP05`:

   ```sh
   sudo docker stop frontend backend
   sudo docker compose -p rma -f compose.fnos.yaml stop
   sudo docker compose -p rma -f compose.fnos-mssql.yaml up -d --no-build --remove-orphans
   sudo docker compose -p rma -f compose.fnos-mssql.yaml ps
   curl -I --max-time 10 http://127.0.0.1:3000/
   ```

   `--remove-orphans` removes obsolete containers from the **rma** project,
   including its SQLite backend; it does not remove the separate production SQL
   Server container or its data. Confirm the old production app belongs to a
   different Compose project before using this option.

5. Open `http://doglas.tplinkdns.com:3000/dashboard`. Check login, real record
   counts, historical photos, and the permissions/pallet/shipping views before
   reopening access to staff. A frontend HTTP 200 alone does not verify database
   workflows. Every subsequent edit affects the live production database. The
   existing router forwarding for port 3000 can remain unchanged.

If startup fails, inspect:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml logs --tail=100 rma_sql_backend frontend
```

An application-only rollback is possible **only if the current SQL schema and
data remain compatible with the old application**:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml stop
sudo docker start backend frontend
```

Keeping old containers does not undo database migrations or photo changes. If
rollback requires a database/photo restore, preserve and reconcile writes made
after cutover first; restoring an earlier backup would otherwise discard them.
Keep a separate database and photo directory for any future staging environment.

## Alternative: connect on port 3001 without replacing production

These commands stop only the existing staging services and replace them with
the SQL-connected version. Production containers `frontend`, `backend`, and
`1Panel-mssql-oP05` are not managed by these commands.

```sh
sudo docker compose -p rma -f compose.fnos.yaml stop
sudo docker compose -p rma -f compose.fnos-mssql.yaml up -d --no-build --remove-orphans
sudo docker compose -p rma -f compose.fnos-mssql.yaml ps
```

Open `http://192.168.68.109:3001` from a network that can reach the NAS. Log in
with an approved account in SQL Server, not an account that exists only in SQLite.
Avoid dummy receipts or shipment tests here: these are live production changes.

To return staging to its previous SQLite database:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml stop
sudo docker compose -p rma -f compose.fnos.yaml up -d --build --remove-orphans
```

This changes staging's connection only; it does not undo changes already made to
production SQL or shared photos. Production database backups must use SQL Server
tools; the new app's SQLite backup/restore does not back up SQL Server.

## Receiving UPC update

New deliveries require Tracking number, Received date, Company, Quantity, and
UPC/Item code for every item. The form marks these fields with an asterisk, and
the API rejects missing or whitespace-only required text before saving any unit.
Quantity must be an integer from 1 to 100 matching the submitted items. Serial
numbers, notes, and photos remain optional at receiving. Existing records are
preserved; this validation change does not require a database migration. Rebuild
both frontend and backend when deploying it.

UPC is stored as text
in `dbo.RMA_return_receiving.upc`, preserving leading zeros and allowing the same
product UPC on multiple units. Existing records retain their IDs and receive a
blank UPC when the column is first added. Details, record editing, exports, and removed-record restoration retain
this field.

Local SQLite adds the column automatically at application startup. For SQL Server,
include `012_receiving_upc.sql` using the existing backed-up
`backend/upgrade_sqlserver.py` workflow before starting the updated application.
The startup schema check requires this column; it does not alter production data
automatically. No new receiving table is created.

## Additional item details

Receive delivery shows UPC/Item code and optional Other information (4,000
characters) per unit. The earlier Item code/name and Item name fields remain
stored for existing records but are no longer shown on the receiving form.
Existing records start with empty values. Details, editing, search, exports,
and restoration preserve these fields in the same receiving table.

SQLite adds the fields at startup. SQL Server deployments must include
`013_receiving_item_details.sql` through the backed-up `upgrade_sqlserver.py`
workflow before starting this version. Startup preflight checks both fields.

## Old receipts incorrectly appearing in Returns

The original upgrade classifies records present at the time of that upgrade.
If the original backend subsequently adds receipts, it does not supply the new
historical markers. These receipts can appear in Returns with blank delivery
groups. Earlier builds also incorrectly counted all blank groups as one delivery
(for example, unrelated tracking numbers each showing `1 / 45`). The updated
backend treats missing delivery groups separately.

`repair_historical_receipts.py` reports old-style candidates without changing data.
It only accepts unclassified records with a blank group, default unit/quantity
values, and no modern item, inspection, shipping, photo or custom bulk metadata.
Other Returns records are listed for separate review, not automatically moved.
Do not assume the screenshot count equals the candidate count.

Extract the updated source archive over `/vol1/1011/Development/RMA`, preserving
your `.env`, data, logs and photos. Build the backend and run the read-only report:

```sh
cd /vol1/1011/Development/RMA
sudo docker compose -p rma -f compose.fnos-mssql.yaml build rma_sql_backend
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python repair_historical_receipts.py
```

Review the candidate File Numbers. Before applying, stop all application writers:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml stop
sudo docker compose -p rma-staging -f compose.fnos-mssql.yaml stop
sudo docker compose -p rma-staging -f compose.fnos.yaml stop
sudo docker stop frontend backend
```

The last command refers to the original production container names; if they no
longer exist, that specific "No such container" message is expected. Check
`sudo docker ps` for any other application backend still running. Leave
`1Panel-mssql-oP05` running. Keep stopped application containers stopped throughout
the repair and afterwards so the old backend cannot insert more unclassified rows.

Run the report again after stopping writers. If the listed candidates are all
historical receipts, replace `COUNT_FROM_REPORT` below with the reported number
of **old-style candidates**, not the overall Returns count:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python repair_historical_receipts.py --apply --application-stopped --expected-count COUNT_FROM_REPORT
```

This creates a SQL COPY_ONLY backup and verifies it before changing any data.
The SQL login must be allowed to back up and verify the database and update the
receiving/audit tables. The backup is in the SQL container's
`/var/opt/mssql/backup` (your NAS mount: `/vol1/1011/Development`). If backup fails,
no receipts are changed. Do not bypass it. The update runs in one transaction
and fails if the candidate count changes or historical IDs conflict.

Only `legacyId`, `groupId`, and `quantityKnown` change. Original record IDs,
tracking, company, dates, order numbers, codes, notes, and photos remain intact.
An audit entry records the original classification of each changed record.
Historical quantities are marked unconfirmed, matching the initial import.
No new receiving table is created and no records are deleted.

After success, verify and restart only the new app:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python repair_historical_receipts.py
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python -m app.sqlserver_check
sudo docker compose -p rma -f compose.fnos-mssql.yaml up -d --no-build
sudo docker compose -p rma -f compose.fnos-mssql.yaml ps
```

Refresh Previous records and Returns. Returns will be empty only if every
previously visible record was an eligible historical receipt. Review any remaining
File Numbers individually; do not delete them or classify solely by received date.
Local SQLite regression tests cover data preservation, repeat runs, rollback,
and grouping. Run the report against the NAS to establish the actual candidates;
local tests do not validate your production SQL data.

## Complete record editing

Returns / Manage records now separates receiving information, inspection and
shipping, delivery quantity, and photos. The editor saves tracking, received date,
company, UPC/Item code, the existing Item code/name value, order number, code,
recorded status, bulk type, notes, serial number, inspection date, pallet, ship
date and an existing shipping-batch assignment. Item name is no longer a separate
input in this editor; its existing stored value is preserved. IDs, File Numbers,
and the automatic creation timestamp are displayed read-only.

Save or discard text-field changes before using the quantity and photo controls.
Quantity increases create new File Numbers using this record's receiving fields
and label photos; serials, unit photos, inspection, pallets and shipping are not
copied. Quantity decreases require selecting the exact uninspected, unshipped
units to remove. The open record and historical parent cannot be removed this
way. Removed units remain in admin history and can be restored with their IDs.
If another person changes delivery membership first, refresh before retrying.

Shipping corrections require shipping permission, an inspected unit and an
existing accessible batch. Ship out still creates new batches. Clear the ship
date to undo an individual unit's shipment before correcting its inspection or
pallet. The original state is retained in the audit history.

Both label and unit photos can be previewed, detached, added and replaced in the
editor. Each section has its own Save button and a five-photo limit. Detaching a
photo removes its reference from this record, preserving files referenced by
other units or audit history. Original historical labels stored with Previous
records remain managed on that page. Photo changes require both record-edit and
photo permissions; quantity additions need receiving permission and removals need
record-removal permission. Company restrictions apply to all operations.

Deploy both frontend and backend for these changes. There is no database schema
migration for the expanded editor.

## 2026-10-27 update: labels and toast messages

File Number labels now use 2.4 x 1.1 inch paper, one unit per label. Select that
paper size in the printer settings, use 100% scale, and disable browser headers
and footers. Barcode and text sizing have been adjusted for the smaller label.

Receiving, editing, photos, pallet/shipping and administration feedback now use
stacked toast notifications. Success messages close after five seconds, with
the timer paused while hovered or focused. Errors remain until dismissed.
Toasts work inside the pallet dialog and are excluded from printed labels.
Delivery summaries, file links, print actions and field validation remain on
the page.

The source ZIP includes these updates and the complete record editor described
above. Deploy both services if the editor is not already deployed. No additional
database migration is required for these changes; startup still verifies the
existing SQL schema. Keep the NAS .env, data, logs and photo folders in place.
Do not replace them with local test data.

Build and verify the production database connection before replacing containers:

```bash
cd /vol1/1011/Development/RMA
sudo docker compose -p rma -f compose.fnos-mssql.yaml config --quiet &&
sudo docker compose -p rma -f compose.fnos-mssql.yaml build &&
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python -m app.sqlserver_check
```

Only after that succeeds, stop the original application containers if they still
exist, then replace the current rma application. Keep SQL Server running:

```bash
for container in frontend backend; do
  if sudo docker container inspect "$container" >/dev/null 2>&1; then
    sudo docker stop "$container" || break
  fi
done
sudo docker compose -p rma -f compose.fnos-mssql.yaml up -d --no-build
sudo docker compose -p rma -f compose.fnos-mssql.yaml ps
curl -I --max-time 10 http://127.0.0.1:3000/
```

Keep any older rma-staging application containers stopped. The compose update
replaces the current rma containers automatically. Refresh the browser with
Ctrl+Shift+R after deployment. These steps do not import, reclassify or delete
existing records.

## References

- [Microsoft ODBC driver installation](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server).
- [Docker Compose existing networks](https://docs.docker.com/compose/how-tos/networking/#use-an-existing-network).
