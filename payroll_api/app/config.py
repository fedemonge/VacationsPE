from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vacaciones_pe"
    database_schema: str = "payroll"

    # App
    app_name: str = "Payroll API - Peru"
    app_version: str = "0.1.0"
    debug: bool = False
    api_prefix: str = "/api/v1/payroll"
    cors_origins: list[str] = ["http://localhost:3000"]
    timezone: str = "America/Lima"

    # Default company (single-tenant mode)
    default_company_ruc: str = "20100000001"

    # AWS S3
    s3_bucket: str = "payroll-pe-files"
    s3_region: str = "us-east-1"
    s3_prefix_payslips: str = "boletas/"
    s3_prefix_bbva: str = "bbva/"
    s3_prefix_reports: str = "reportes/"

    # Odoo
    odoo_url: str = ""
    odoo_db: str = ""
    odoo_user: str = ""
    odoo_password: str = ""

    # Auth (shared with Next.js)
    webhook_signing_secret: str = ""

    # Email (via Power Automate or SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "nomina@woden.com.pe"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
