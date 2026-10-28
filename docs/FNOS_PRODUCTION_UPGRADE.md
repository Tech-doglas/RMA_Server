# Upgrade the legacy SQL database and replace production

This procedure targets the October 6 schema report: seven original receiving
columns, TrackingNumber as the primary key, and existing RMA_users accounts. The
app continues using SQL database RMA in container 1Panel-mssql-oP05 and the existing
photo directory. No SQLite records, accounts, or permissions are imported.

The upgrade adds unit IDs and workflow columns to **the existing receiving table**.
It preserves the table object and original field values, including nulls. It widens
text fields to match the new app, replaces the tracking primary key with a unit-ID
primary key, and permits multiple units under one tracking number. Historical
records start with unconfirmed quantity and no invented inspection/shipping dates.
It adds supporting option, audit, shipping, department, permission, and session
tables. Existing accounts retain passwords, roles and departments; the new flags
keep existing accounts active and approved. New registrations require approval.
Initial department permissions follow the app defaults; an administrator should
review them before reopening staff access. No administrator is created implicitly.

This is a standalone, explicit upgrade. Do not run migrations 001 through 011 in
filename order. `upgrade_sqlserver.py` chooses the appropriate steps and skips the
old classification-normalization script, preserving custom bulk types.

## 1. Install and build while the old app is running

Extract the updated rma-fnos-source.zip into
`/vol1/1011/Development/RMA-staging`, preserving `.env`, `data`, and `logs`. Keep
the SQL connection settings and set RMA_PORT=3000. On NAS SSH:

```sh
cd /vol1/1011/Development/RMA-staging
sudo docker compose -p rma -f compose.fnos-mssql.yaml config --quiet
sudo docker compose -p rma -f compose.fnos-mssql.yaml build
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python upgrade_sqlserver.py
```

The last command is read-only. It must report `SQL upgrade permission: available`.
Otherwise keep the old app running and arrange a SQL administrator to perform the
upgrade. The app login need not permanently receive administrator permissions;
the upgrade requires db_owner or sysadmin plus access to SQL's backup mount.

## 2. Maintenance window and database upgrade

Stop staff writes and both app versions; leave SQL Server running. Back up or
snapshot `/vol1/1001/RMA/images` with fnOS before continuing. The SQL backup below
does not include photos. Run these commands separately and stop on any error:

```sh
sudo docker stop frontend backend
sudo docker compose -p rma -f compose.fnos.yaml stop
sudo docker compose -p rma -f compose.fnos-mssql.yaml stop
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python upgrade_sqlserver.py --apply --application-stopped
```

`--application-stopped` confirms that you have stopped all writers; it does not
stop them for you. The tool creates a uniquely named COPY_ONLY SQL backup with
checksums in SQL's `/var/opt/mssql/backup` and runs RESTORE VERIFYONLY WITH CHECKSUM
before changing tables. On your NAS this file appears in
`/vol1/1011/Development/RMA_before_upgrade_*.bak`. A backup or verification failure
prevents any migrations. VERIFYONLY is not a full restore test; retain your normal
restore-tested backups as well.

All schema steps run in one transaction and are checked before commit. A SQL
failure rolls back uncommitted changes. Unsupported intermediate receiving
schemas, separate unit tables, extra columns, custom indexes, foreign keys, and
triggers stop this upgrade for review. It does not guess how to convert them.
Do not start the new app unless the tool says `Upgrade committed` and the following
startup check passes:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python -m app.sqlserver_check
```

The obsolete RMA_user lookup has been removed from the app; it uses RMA_users.
There is no need to create a duplicate account table.

## 3. Administrator and start

The September backup had 46 staff accounts and no admin-role account. If production
still has no administrator, create a new one explicitly:

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml run --rm --no-deps rma_sql_backend python create_admin.py --username admin
```

Store the generated password privately. The command refuses to overwrite an
existing username; if necessary, use a different unused administrator username.
Existing SQL accounts remain; SQLite-only staging accounts do not transfer.

```sh
sudo docker compose -p rma -f compose.fnos-mssql.yaml up -d --no-build
sudo docker compose -p rma -f compose.fnos-mssql.yaml ps
```

Open `http://doglas.tplinkdns.com:3000/dashboard`. Verify staff/admin login, record
counts, historical photos and department permissions before reopening staff access.
The orphan warning for the stopped rma-staging-backend-1 SQLite container is not a
database failure. Leave it stopped. Keep the old production frontend/backend
containers and images, but do not restart them alongside the new app.

## Rollback limits

Before the upgrade commits, a failed transaction leaves the old database schema
in place and the old application can be restarted. After a successful upgrade,
restarting old containers alone is not a verified rollback: tracking numbers can
now repeat and the old app may address records by tracking number. A full rollback
may require restoring the pre-upgrade SQL backup and matching photos, with all
post-upgrade writes preserved and reconciled first. Do not restore over newer
records without accounting for them.

## Validation performed locally

Tested on a disposable SQL Server 2022 restore of RMAbackup_20260924.bak:

- All 6,889 original receiving rows and their field values preserved.
- All 46 usernames, password hashes, roles and departments preserved.
- Original receiving table object retained; repeated execution preserved IDs/data.
- Forced failure after DDL rolled the entire upgrade back.
- COPY_ONLY backup and checksum verification, multiple-unit tracking, wider fields,
  and DBCC CHECKDB succeeded.
- Native SQL-backed login, lists, receiving, inspection, duplicate serial rejection,
  shipping eligibility, already-shipped rejection and logout succeeded.

The current NAS database has not been modified or tested remotely. Its live schema
can differ from the September backup; the guards and startup checks still apply.
