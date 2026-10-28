"""fnOS entry point; reachable only through the Compose frontend proxy."""
import os
from pathlib import Path

from werkzeug.middleware.proxy_fix import ProxyFix

from app import create_app


def create_nas_app():
    backend = os.environ.get('DATABASE_BACKEND', '').lower()
    if backend not in ('sqlite', 'mssql'):
        raise RuntimeError('Set DATABASE_BACKEND to sqlite or mssql.')
    if backend == 'sqlite':
        database = Path(os.environ.get('SQLITE_PATH', '/data/rma.sqlite3'))
        if not database.is_file() or database.stat().st_size == 0:
            raise RuntimeError(
                'The existing database is missing. Copy your stopped app storage to '
                'RMA_DATA_DIR, including rma.sqlite3, before starting this deployment.'
            )
    else:
        required = ('SQL_SERVER', 'SQL_DATABASE', 'SQL_USER', 'SQL_PASSWORD')
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError('Missing SQL Server settings: ' + ', '.join(missing))

    app = create_app()
    if backend == 'mssql':
        from app.sqlserver_check import check_schema
        with app.app_context():
            check_schema()
    # The frontend overwrites these headers. The backend has no published port.
    # Preserve Host, including the public port, instead of trusting forwarded Host.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1,
                            x_host=0, x_port=0, x_prefix=1)
    return app
