"""Create a local MotoX database on PostgreSQL 18 without storing admin credentials."""

from getpass import getpass
from pathlib import Path
import os
import secrets
import subprocess


PSQL = Path(r"C:\Program Files\PostgreSQL\bin\psql.exe")
BACKEND = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = "5433"
ROLE = "motox_app"
DATABASE = "motox_dev"


def query(sql: str, password: str) -> str:
    environment = os.environ.copy()
    environment["PGPASSWORD"] = password
    result = subprocess.run(
        [str(PSQL), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
         "-h", HOST, "-p", PORT, "-U", "postgres", "-d", "postgres"],
        input=sql,
        text=True,
        capture_output=True,
        env=environment,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "Falló la operación de PostgreSQL")
    return result.stdout.strip()


def main() -> None:
    if not PSQL.is_file():
        raise RuntimeError(f"No se encontró PostgreSQL 18 en {PSQL}")

    admin_password = getpass("Contraseña local de postgres (no se mostrará): ")
    version = int(query("SELECT current_setting('server_version_num');", admin_password))
    if version // 10000 != 18:
        raise RuntimeError(f"El puerto {PORT} no corresponde a PostgreSQL 18")

    app_password = secrets.token_urlsafe(32)
    role_exists = query(f"SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{ROLE}');", admin_password)
    if role_exists == "t":
        query(f"ALTER ROLE {ROLE} WITH LOGIN PASSWORD '{app_password}';", admin_password)
    else:
        query(f"CREATE ROLE {ROLE} WITH LOGIN PASSWORD '{app_password}';", admin_password)

    database_exists = query(
        f"SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '{DATABASE}');",
        admin_password,
    )
    if database_exists == "f":
        query(f"CREATE DATABASE {DATABASE} OWNER {ROLE};", admin_password)
    else:
        query(f"ALTER DATABASE {DATABASE} OWNER TO {ROLE};", admin_password)

    env_path = BACKEND / ".env.local"
    env_path.write_text(
        f"PORT=3000\nDB_HOST={HOST}\nDB_PORT={PORT}\nDB_NAME={DATABASE}\n"
        f"DB_USER={ROLE}\nDB_PASSWORD={app_password}\n",
        encoding="utf-8",
    )
    print("PostgreSQL 18 conectado. Base y cuenta local listas; configuración guardada en .env.local.")


if __name__ == "__main__":
    main()
