"""Package deployment source only; never include databases, secrets or photos."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'compose.fnos.yaml', 'fnos.env.example', 'docs/FNOS_DEPLOYMENT.md',
    'compose.fnos-mssql.yaml', 'docs/FNOS_SQLSERVER.md',
    'docs/FNOS_PRODUCTION_UPGRADE.md', 'docs/DEPLOY_2026-10-16.md',
    'backend/Dockerfile.fnos', 'backend/.dockerignore', 'backend/requirements.txt',
    'backend/requirements-fnos.txt', 'backend/config.py', 'backend/nas_wsgi.py',
    'backend/create_admin.py', 'backend/upgrade_sqlserver.py', 'backend/repair_historical_receipts.py', 'frontend/Dockerfile.fnos', 'frontend/.dockerignore',
    'frontend/nginx.fnos.conf.template', 'frontend/package.json',
    'frontend/package-lock.json', 'frontend/postcss.config.js',
    'frontend/tailwind.config.js', 'scripts/package-fnos.py',
]
DIRECTORIES = ['backend/app', 'backend/migrations', 'frontend/src', 'frontend/public']


def source_path(name):
    """Support the reorganized local workspace; keep deployment paths unchanged."""
    path = ROOT / name
    if not path.exists() and Path(name).parts[0] in ('frontend', 'docs'):
        path = ROOT / 'RAM System' / name
    return path


def main():
    paths = {name: source_path(name) for name in FILES}
    for directory in DIRECTORIES:
        source = source_path(directory)
        if not source.is_dir():
            raise FileNotFoundError(source)
        paths.update((str(Path(directory) / path.relative_to(source)).replace('\\', '/'), path)
                     for path in source.rglob('*')
                     if path.is_file() and not path.is_symlink()
                     and '__pycache__' not in path.parts
                     and path.suffix not in ('.pyc', '.pyo'))
    # Fail before opening the output if a required source file is missing.
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    output_root = ROOT / 'RAM System' if not (ROOT / 'frontend').exists() and (ROOT / 'RAM System/frontend').is_dir() else ROOT
    destination = output_root / 'dist' / 'rma-fnos-source.zip'
    destination.parent.mkdir(exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for name, path in sorted(paths.items()):
            archive.write(path, name)
    with ZipFile(destination) as archive:
        bad_file = archive.testzip()
        if bad_file:
            raise RuntimeError(f'Archive verification failed: {bad_file}')
        print(f'{destination}: {len(archive.namelist())} source files, {destination.stat().st_size:,} bytes')
        print('No database, session key, uploaded photos, or installed dependencies included.')


if __name__ == '__main__':
    main()
