"""Create an administrator without allowing public admin registration."""
import argparse
import secrets
from werkzeug.security import generate_password_hash
from app import create_app
from app.models import db_connection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--username', default='admin')
    args = parser.parse_args()
    username = args.username.strip()
    if not username or len(username) > 255:
        parser.error('Choose a username of 1–255 characters.')
    password = secrets.token_urlsafe(18)
    app = create_app()
    with app.app_context(), db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT username FROM RMA_users WHERE username = ?', username)
        if cursor.fetchone():
            parser.error('That username already exists. Choose another; existing accounts are never overwritten.')
        cursor.execute('INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)',
                       username, generate_password_hash(password), 'admin', 'IT')
    print('Username: ' + username)
    print('Password: ' + password)


if __name__ == '__main__':
    main()
