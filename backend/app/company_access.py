"""Company grants share the existing department permission store.

Company names are hashed into bounded permission keys (SQL Server permits 100
characters). No receiving records or company names are copied into new tables.
"""
import hashlib
from flask import g

ALL_COMPANIES = 'company.all'
COMPANY_PREFIX = 'company.allowed.'


def company_key(name):
    return COMPANY_PREFIX + hashlib.sha256(name.strip().casefold().encode()).hexdigest()


def unrestricted():
    user = getattr(g, 'session_account', None)
    return bool(user and (user['role'] == 'admin' or ALL_COMPANIES in user['permissions']))


def can_access(company):
    user = getattr(g, 'session_account', None)
    return unrestricted() or bool(user and company and company_key(company) in user['permissions'])


def require_company(company):
    if not can_access(company):
        raise PermissionError('Your department cannot access this company. Contact an admin to update company access.')


def company_names(cursor):
    cursor.execute("SELECT name FROM RMA_return_companies UNION SELECT Company AS name FROM RMA_return_receiving WHERE Company <> ''")
    return sorted({row[0] for row in cursor.fetchall()})


def scope_sql(cursor, column='Company'):
    if unrestricted():
        return '1 = 1', []
    names = [name for name in company_names(cursor) if can_access(name)]
    if not names:
        return '1 = 0', []
    return column + ' IN (' + ','.join('?' for _ in names) + ')', names


def require_private_pallet(cursor, pallet):
    """A customer cannot assign to, or change the status of, a shared pallet."""
    if unrestricted() or not pallet:
        return
    cursor.execute('SELECT DISTINCT Company FROM RMA_return_receiving WITH (UPDLOCK, HOLDLOCK) WHERE LOWER(pallet) = LOWER(?)', pallet)
    if any(not can_access(row[0]) for row in cursor.fetchall()):
        raise PermissionError('This pallet is unavailable. Choose another pallet or contact warehouse staff.')


def photo_access(cursor, kind, folder, filename=None):
    if unrestricted():
        return True
    if kind == 'return_units':
        import json
        prefix = '/images/return_units/' + folder + '/'
        pattern = '%' + prefix.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
        cursor.execute("SELECT Company, images, unitImages FROM RMA_return_receiving WHERE images LIKE ? ESCAPE '!' OR unitImages LIKE ? ESCAPE '!'", pattern, pattern)
        matches = []
        for company, shared, individual in cursor.fetchall():
            urls = json.loads(shared or '[]') + json.loads(individual or '[]')
            if any(url == prefix + filename if filename else url.startswith(prefix) for url in urls):
                matches.append(company)
        return bool(matches) and all(can_access(company) for company in matches)
    if kind == 'return_receiving':
        from urllib.parse import quote
        cursor.execute('SELECT DISTINCT Company FROM RMA_return_receiving WHERE TrackingNumber = ?', folder)
        owners = [row[0] for row in cursor.fetchall()]
        # Correcting tracking keeps references to the original label folder.
        import json
        prefix = '/images/return_receiving/' + quote(folder, safe='') + '/'
        pattern = '%' + prefix.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
        cursor.execute("SELECT Company, images FROM RMA_return_receiving WHERE images LIKE ? ESCAPE '!'", pattern)
        for company, saved in cursor.fetchall():
            if any(url == prefix + quote(filename, safe='') if filename else url.startswith(prefix) for url in json.loads(saved or '[]')):
                owners.append(company)
        return bool(owners) and all(can_access(company) for company in owners)
    return False
