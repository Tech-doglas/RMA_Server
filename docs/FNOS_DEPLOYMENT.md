# Deploy RMA to fnOS

To connect to the existing production SQL Server instead of SQLite, follow
[the SQL Server deployment guide](FNOS_SQLSERVER.md) and use its separate Compose
file. That connection uses live production data and photos.

This setup runs the frontend and backend in Docker on your NAS, using your current
SQLite database. Accounts, permissions, records, and photos stay in a persistent
NAS folder. No separate SQL Server or Docker Hub account is required.

Use `compose.fnos.yaml` and the supplied `Dockerfile.fnos` files. The older
default Dockerfiles and `dockerBuilder.bat` are not used by this setup.

## 1. Prepare the NAS

Install/open Docker in the fnOS App Center. Enable SSH to run the commands below.
The NAS needs internet access to download build images and packages.

Choose a folder on a local NAS disk, for example `/vol1/1001/docker/rma`. Use your
actual folder path shown in fnOS; the volume and user number may differ. Do not
place the live SQLite database on an SMB/NFS mount from another computer.

Extract `rma-fnos-source.zip` into this folder. It contains code and deployment
instructions; your database and photos must be copied separately. Alternatively,
copy `backend`, `frontend`, `compose.fnos.yaml`, and `fnos.env.example` from the
project, excluding `node_modules`, `.pnpm-store`, `.test-deps`, `.run`, and build
outputs.

Your final folder layout should be:

```text
rma/
  compose.fnos.yaml
  fnos.env.example
  .env
  backend/
  frontend/
  data/
    rma.sqlite3
    .session-key
    images/
      return_units/
      return_receiving/  (historical photos, if available)
      laptop/           (PC photos, if available)
      non_laptop/       (Non-PC photos, if available)
    backups/
  logs/
```

## 2. Move your existing data

1. Stop the Windows backend before the final copy. Keep it stopped during the
   move so staff cannot add records/photos to the old installation.
2. Make a safety copy of the complete Windows folder
   `C:\Users\STX\Documents\RMA_Server-main\backend\storage`.
3. Copy its **contents** into the NAS `rma/data` folder. Include `rma.sqlite3`,
   `.session-key`, `images`, and any SQLite `-wal`/`-shm` files remaining after
   shutdown. Enable hidden files when copying `.session-key`. The correct
   destination is `data/rma.sqlite3`, not `data/storage/rma.sqlite3`.
4. If historical photos already exist at `/vol1/1001/RMA/images` on your NAS,
   back them up and merge the missing photo folders into `data/images`. Preserve
   existing files; investigate filename conflicts before overwriting. The SQL
   `.bak` contains records, not these photo files.
5. Create `logs` beside `data`.

Do not copy only the main SQLite file while the backend is running: recent
committed records may still be in its WAL file. Keep the Windows safety copy
until the NAS installation has been checked.

The NAS backend refuses to start if `data/rma.sqlite3` is missing or empty,
preventing a wrong folder mapping from creating an empty replacemen t database.

## 3. Configure the folder owner and port

In an SSH terminal connected to the NAS, use your actual application path:

```sh
cd /vol1/1001/docker/rma
cp -n fnos.env.example .env
id -u
id -g
```

Edit `.env`: put the two numbers into `RMA_UID` and `RMA_GID`. These must be the
IDs of the NAS user who owns the copied data and logs. That user needs read/write
access to both folders and their contents, including hidden files. Check the fnOS
folder permissions if access is denied; do not make the folders publicly writable.

Keep `RMA_DATA_DIR=./data` and `RMA_LOG_DIR=./logs` for the layout above. Change
`RMA_PORT=3000` if that NAS port is already occupied. Leave
`RMA_PUBLIC_SCHEME=http` for the initial LAN test.

## 4. Build and start

Run these commands from the application folder on the NAS:

```sh
sudo docker compose -f compose.fnos.yaml config --quiet
sudo docker compose -f compose.fnos.yaml up -d --build
sudo docker compose -f compose.fnos.yaml ps
```

The first build can take several minutes. The frontend waits for the backend's
database health check. To inspect errors:

```sh
sudo docker compose -f compose.fnos.yaml logs --tail=100 backend frontend
```

You can also use the fnOS Docker Compose/project interface with this same folder
and configuration; menu names vary by fnOS version. Paths for `backend`,
`frontend`, `data`, and `logs` must stay relative to the project folder. Pasting
only the YAML into an unrelated folder will not work. Use the commands above if
the interface does not support building images from source.

## 5. Verify and switch staff over

Open `http://YOUR-NAS-IP:3000`, using your actual IP and selected port. Log in
with an existing application account. Check the 3PL list, a historical record,
unit photos, PC/Non-PC inventory, and admin permissions. Create a clearly marked
test receipt with a photo, restart the project, and confirm both remain.

After checking, give staff the NAS address. The site and API share that address;
API calls use `/api`. Port 8088 is internal to Docker. Private photos are served
through the authenticated backend; do not mount storage as a public web folder.

## HTTPS and remote access

The default is for a LAN test. For regular staff use, configure an HTTPS reverse
proxy with a valid certificate and hostname, forwarding to frontend port 3000.
Preserve the original `Host` header, including its port if non-standard. Forward
all paths including `/api`, allow uploads up to 64 MB, and use a 120-second timeout.

Set `RMA_PUBLIC_SCHEME=https` in `.env` and run `up -d --build` again. The app will
issue Secure session cookies. Use the HTTPS hostname consistently; HTTP IP access
will no longer be suitable for authenticated use. If the reverse proxy runs on
the NAS host, you may bind the frontend to `127.0.0.1` with `RMA_BIND_ADDRESS`.
A reverse proxy in another container needs a reachable network/host address.

The frontend overwrites forwarded headers and the backend trusts that one
internal proxy. Do not publish backend port 8088. With an additional HTTPS proxy,
IP-based login throttling sees the outer proxy's address; configure Nginx real-IP
handling for that exact trusted proxy if separate client-IP throttling is needed.
Use a VPN or properly configured HTTPS access for remote staff.

## Updates, backups, and rollback

Before updating, stop the project and copy/snapshot the complete `data` folder
to a separate backup location. An admin database-only backup does not include photos.

```sh
sudo docker compose -f compose.fnos.yaml stop
# Back up data while the app is stopped, then replace the code files.
sudo docker compose -f compose.fnos.yaml up -d --build
```

Keep `.env`, `data`, and `logs` during updates. Do not replace `data` with an older
development copy. No recurring backup is installed by this setup; arrange NAS
backups for both database and photos. To roll back, stop the app and restore a
matching code version and complete data backup together.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Missing database / bind source path | Copy storage contents to `data`; create `logs`; check `.env` paths. |
| Permission denied / read-only database | The configured UID/GID need write access to data, logs, and their contents. SQLite must create WAL files beside the database. |
| Image/package download fails | Check NAS internet access and Docker registry connectivity. |
| Port already allocated | Change `RMA_PORT` in `.env`. |
| 502 Bad Gateway | Read backend logs and check its health. |
| Login rejected after adding HTTPS | Preserve Host, set `RMA_PUBLIC_SCHEME=https`, restart, and use the HTTPS hostname. |
| Old photos missing | Merge original photo folders; restoring SQL records does not restore images. |

## Official references

- [fnOS](https://fnnas.com/) and [fnOS help](https://help.fnnas.com/).
- [Docker Compose builds](https://docs.docker.com/reference/compose-file/build/).
- [Flask deployment](https://flask.palletsprojects.com/en/stable/deploying/) and
  [trusted proxies](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/).
- [SQLite WAL storage and copying considerations](https://sqlite.org/wal.html).
