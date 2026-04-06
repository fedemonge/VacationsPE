"""Initial payroll schema.

Revision ID: 001
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA = "payroll"


def upgrade() -> None:
    # Create schema
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    # Company
    op.create_table(
        "company",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ruc", sa.String(11), unique=True, nullable=False),
        sa.Column("business_name", sa.String(200), nullable=False),
        sa.Column("trade_name", sa.String(200)),
        sa.Column("address", sa.String(500)),
        sa.Column("country_code", sa.String(2), server_default="PE"),
        sa.Column("currency_code", sa.String(3), server_default="PEN"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )

    # Cost Center
    op.create_table(
        "cost_center",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "code", name="uq_cost_center_code"),
        schema=SCHEMA,
    )

    # Payroll Employee
    op.create_table(
        "payroll_employee",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("employee_code", sa.String(20), nullable=False),
        sa.Column("external_employee_id", sa.String(100)),
        sa.Column("document_type", sa.String(3), nullable=False),
        sa.Column("document_number", sa.String(20), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("paternal_surname", sa.String(100), nullable=False),
        sa.Column("maternal_surname", sa.String(100)),
        sa.Column("full_name", sa.String(300), nullable=False),
        sa.Column("email", sa.String(200)),
        sa.Column("phone", sa.String(20)),
        sa.Column("birth_date", sa.Date),
        sa.Column("gender", sa.String(1)),
        sa.Column("address", sa.String(500)),
        sa.Column("bank_code", sa.String(10), server_default="BBVA"),
        sa.Column("bank_account_number", sa.String(20)),
        sa.Column("bank_cci", sa.String(20)),
        sa.Column("account_currency", sa.String(3), server_default="PEN"),
        sa.Column("employment_status", sa.String(20), server_default="ACTIVO"),
        sa.Column("hire_date", sa.Date, nullable=False),
        sa.Column("termination_date", sa.Date),
        sa.Column("pension_system", sa.String(10), nullable=False),
        sa.Column("pension_provider", sa.String(50)),
        sa.Column("cuspp", sa.String(20)),
        sa.Column("has_5ta_cat_exemption", sa.Boolean, server_default="false"),
        sa.Column("has_dependents", sa.Boolean, server_default="false"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_payroll_employee_status", "payroll_employee", ["company_id", "employment_status"], schema=SCHEMA)
    op.create_index("idx_payroll_employee_external", "payroll_employee", ["external_employee_id"], schema=SCHEMA)

    # Employment Contract
    op.create_table(
        "employment_contract",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("contract_type", sa.String(30), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date),
        sa.Column("base_salary", sa.Numeric(12, 2), nullable=False),
        sa.Column("cost_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.cost_center.id"), nullable=False),
        sa.Column("position_title", sa.String(200)),
        sa.Column("work_schedule", sa.String(20), server_default="48H"),
        sa.Column("daily_hours", sa.Numeric(4, 2), server_default="8.0"),
        sa.Column("is_current", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_contract_employee", "employment_contract", ["employee_id", "is_current"], schema=SCHEMA)

    # Payroll Concept
    op.create_table(
        "payroll_concept",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("subcategory", sa.String(50)),
        sa.Column("affects_essalud", sa.Boolean, server_default="false"),
        sa.Column("affects_pension", sa.Boolean, server_default="false"),
        sa.Column("affects_5ta_cat", sa.Boolean, server_default="false"),
        sa.Column("affects_gratification", sa.Boolean, server_default="false"),
        sa.Column("affects_cts", sa.Boolean, server_default="false"),
        sa.Column("affects_vacation_pay", sa.Boolean, server_default="false"),
        sa.Column("is_system", sa.Boolean, server_default="false"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("display_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "code", name="uq_concept_code"),
        schema=SCHEMA,
    )

    # Concept Rule
    op.create_table(
        "concept_rule",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("concept_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("valid_to", sa.Date),
        sa.Column("calc_type", sa.String(20), nullable=False),
        sa.Column("calc_base", sa.String(100)),
        sa.Column("calc_value", sa.Numeric(12, 6)),
        sa.Column("calc_formula", sa.Text),
        sa.Column("parameters", postgresql.JSONB, server_default="{}"),
        sa.Column("description", sa.Text),
        sa.Column("legal_reference", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_concept_rule_validity", "concept_rule", ["concept_id", "valid_from", "valid_to"], schema=SCHEMA)

    # Legal Parameter
    op.create_table(
        "legal_parameter",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("country_code", sa.String(2), server_default="PE"),
        sa.Column("param_key", sa.String(50), nullable=False),
        sa.Column("param_value", sa.Numeric(15, 6), nullable=False),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("valid_to", sa.Date),
        sa.Column("description", sa.String(200)),
        sa.Column("legal_reference", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "country_code", "param_key", "valid_from", name="uq_legal_param"),
        schema=SCHEMA,
    )

    # Payroll Period
    op.create_table(
        "payroll_period",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("period_year", sa.Integer, nullable=False),
        sa.Column("period_month", sa.Integer, nullable=False),
        sa.Column("period_type", sa.String(20), server_default="MENSUAL"),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("payment_date", sa.Date),
        sa.Column("status", sa.String(20), server_default="ABIERTO"),
        sa.Column("calculated_at", sa.DateTime(timezone=True)),
        sa.Column("calculated_by", sa.String(200)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("closed_by", sa.String(200)),
        sa.Column("rules_snapshot", postgresql.JSONB),
        sa.Column("legal_params_snapshot", postgresql.JSONB),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "period_year", "period_month", "period_type", name="uq_period"),
        schema=SCHEMA,
    )
    op.create_index("idx_period_status", "payroll_period", ["company_id", "status"], schema=SCHEMA)

    # Import Batch
    op.create_table(
        "import_batch",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("import_type", sa.String(30), nullable=False),
        sa.Column("file_name", sa.String(200)),
        sa.Column("file_hash", sa.String(64)),
        sa.Column("total_records", sa.Integer),
        sa.Column("processed_records", sa.Integer, server_default="0"),
        sa.Column("error_records", sa.Integer, server_default="0"),
        sa.Column("errors_detail", postgresql.JSONB, server_default="[]"),
        sa.Column("status", sa.String(20), server_default="PROCESANDO"),
        sa.Column("imported_by", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )

    # Payroll Detail
    op.create_table(
        "payroll_detail",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.employment_contract.id"), nullable=False),
        sa.Column("cost_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.cost_center.id"), nullable=False),
        sa.Column("base_salary", sa.Numeric(12, 2), nullable=False),
        sa.Column("days_worked", sa.Numeric(5, 2), server_default="30"),
        sa.Column("total_ingresos", sa.Numeric(12, 2), server_default="0"),
        sa.Column("total_descuentos", sa.Numeric(12, 2), server_default="0"),
        sa.Column("total_aportes_empleador", sa.Numeric(12, 2), server_default="0"),
        sa.Column("neto_a_pagar", sa.Numeric(12, 2), server_default="0"),
        sa.Column("bank_account_snapshot", sa.String(20)),
        sa.Column("bank_cci_snapshot", sa.String(20)),
        sa.Column("status", sa.String(20), server_default="CALCULADO"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("period_id", "employee_id", name="uq_detail_period_employee"),
        schema=SCHEMA,
    )
    op.create_index("idx_detail_period", "payroll_detail", ["period_id"], schema=SCHEMA)
    op.create_index("idx_detail_cost_center", "payroll_detail", ["cost_center_id"], schema=SCHEMA)

    # Payroll Detail Line
    op.create_table(
        "payroll_detail_line",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("detail_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_detail.id"), nullable=False),
        sa.Column("concept_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False),
        sa.Column("concept_code", sa.String(20), nullable=False),
        sa.Column("concept_name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("calc_base_amount", sa.Numeric(12, 2)),
        sa.Column("calc_rate", sa.Numeric(12, 6)),
        sa.Column("calc_formula_used", sa.Text),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.concept_rule.id")),
        sa.Column("rule_snapshot", postgresql.JSONB),
        sa.Column("display_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_detail_line_detail", "payroll_detail_line", ["detail_id"], schema=SCHEMA)
    op.create_index("idx_detail_line_concept", "payroll_detail_line", ["concept_code"], schema=SCHEMA)

    # Attendance
    op.create_table(
        "attendance",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("attendance_date", sa.Date, nullable=False),
        sa.Column("clock_in", sa.Time),
        sa.Column("clock_out", sa.Time),
        sa.Column("hours_worked", sa.Numeric(5, 2)),
        sa.Column("status", sa.String(20), server_default="PRESENTE"),
        sa.Column("tardiness_minutes", sa.Integer, server_default="0"),
        sa.Column("absence_reason", sa.Text),
        sa.Column("source", sa.String(30), server_default="BIOMETRICO"),
        sa.Column("import_batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.import_batch.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "employee_id", "attendance_date", name="uq_attendance"),
        schema=SCHEMA,
    )
    op.create_index("idx_attendance_date", "attendance", ["company_id", "attendance_date"], schema=SCHEMA)

    # Overtime
    op.create_table(
        "overtime",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("overtime_date", sa.Date, nullable=False),
        sa.Column("hours_25", sa.Numeric(5, 2), server_default="0"),
        sa.Column("hours_35", sa.Numeric(5, 2), server_default="0"),
        sa.Column("hours_100", sa.Numeric(5, 2), server_default="0"),
        sa.Column("is_approved", sa.Boolean, server_default="false"),
        sa.Column("approved_by", sa.String(200)),
        sa.Column("source", sa.String(30), server_default="MANUAL"),
        sa.Column("import_batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.import_batch.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "employee_id", "overtime_date", name="uq_overtime"),
        schema=SCHEMA,
    )
    op.create_index("idx_overtime_date", "overtime", ["company_id", "overtime_date"], schema=SCHEMA)

    # Commission
    op.create_table(
        "commission",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("period_year", sa.Integer, nullable=False),
        sa.Column("period_month", sa.Integer, nullable=False),
        sa.Column("concept_code", sa.String(20), server_default="COMISION"),
        sa.Column("description", sa.String(200)),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_remunerative", sa.Boolean, server_default="true"),
        sa.Column("source", sa.String(30), server_default="MANUAL"),
        sa.Column("import_batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.import_batch.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_commission_period", "commission", ["company_id", "period_year", "period_month"], schema=SCHEMA)

    # Payroll Variable
    op.create_table(
        "payroll_variable",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("period_year", sa.Integer, nullable=False),
        sa.Column("period_month", sa.Integer, nullable=False),
        sa.Column("concept_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(200)),
        sa.Column("source", sa.String(30), server_default="MANUAL"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "employee_id", "period_year", "period_month", "concept_id", name="uq_payroll_variable"),
        schema=SCHEMA,
    )

    # Payroll Adjustment
    op.create_table(
        "payroll_adjustment",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("concept_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_concept.id"), nullable=False),
        sa.Column("adjustment_type", sa.String(20), nullable=False),
        sa.Column("original_amount", sa.Numeric(12, 2)),
        sa.Column("adjusted_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("adjusted_by", sa.String(200), nullable=False),
        sa.Column("approved_by", sa.String(200)),
        sa.Column("applied_in_period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_period.id")),
        sa.Column("status", sa.String(20), server_default="PENDIENTE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_adjustment_period", "payroll_adjustment", ["period_id"], schema=SCHEMA)

    # Payment File Layout
    op.create_table(
        "payment_file_layout",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("layout_code", sa.String(50), nullable=False),
        sa.Column("layout_name", sa.String(200), nullable=False),
        sa.Column("bank_code", sa.String(10), nullable=False),
        sa.Column("file_extension", sa.String(10), server_default=".txt"),
        sa.Column("encoding", sa.String(20), server_default="UTF-8"),
        sa.Column("line_separator", sa.String(10), server_default="CRLF"),
        sa.Column("header_fields", postgresql.JSONB, server_default="[]"),
        sa.Column("detail_fields", postgresql.JSONB, nullable=False),
        sa.Column("footer_fields", postgresql.JSONB, server_default="[]"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("company_id", "layout_code", name="uq_layout_code"),
        schema=SCHEMA,
    )

    # Payment File
    op.create_table(
        "payment_file",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False),
        sa.Column("layout_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payment_file_layout.id"), nullable=False),
        sa.Column("file_name", sa.String(200), nullable=False),
        sa.Column("file_hash", sa.String(64), nullable=False),
        sa.Column("file_size_bytes", sa.Integer),
        sa.Column("total_records", sa.Integer, nullable=False),
        sa.Column("total_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("s3_key", sa.String(500)),
        sa.Column("file_content", sa.Text),
        sa.Column("status", sa.String(20), server_default="GENERADO"),
        sa.Column("generated_by", sa.String(200), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
        sa.Column("metadata_json", postgresql.JSONB, server_default="{}"),
        schema=SCHEMA,
    )
    op.create_index("idx_payment_file_period", "payment_file", ["period_id"], schema=SCHEMA)

    # Odoo Outbox
    op.create_table(
        "odoo_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("idempotency_key", sa.String(100), unique=True, nullable=False),
        sa.Column("status", sa.String(20), server_default="PENDIENTE"),
        sa.Column("attempts", sa.Integer, server_default="0"),
        sa.Column("max_attempts", sa.Integer, server_default="5"),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("odoo_entry_id", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_outbox_status", "odoo_outbox", ["status", "last_attempt_at"], schema=SCHEMA)

    # Payslip
    op.create_table(
        "payslip",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.company.id"), nullable=False),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_period.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_employee.id"), nullable=False),
        sa.Column("detail_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.payroll_detail.id"), nullable=False),
        sa.Column("pdf_s3_key", sa.String(500)),
        sa.Column("pdf_hash", sa.String(64)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("sent_to_email", sa.String(200)),
        sa.Column("downloaded_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("period_id", "employee_id", name="uq_payslip"),
        schema=SCHEMA,
    )

    # Audit Event
    op.create_table(
        "audit_event",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), unique=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("old_values", postgresql.JSONB),
        sa.Column("new_values", postgresql.JSONB),
        sa.Column("user_email", sa.String(200), nullable=False),
        sa.Column("user_role", sa.String(50)),
        sa.Column("endpoint", sa.String(200)),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        schema=SCHEMA,
    )
    op.create_index("idx_audit_entity", "audit_event", ["entity_type", "entity_id"], schema=SCHEMA)
    op.create_index("idx_audit_user", "audit_event", ["user_email"], schema=SCHEMA)
    op.create_index("idx_audit_date", "audit_event", ["created_at"], schema=SCHEMA)
    op.create_index("idx_audit_company", "audit_event", ["company_id", "created_at"], schema=SCHEMA)


def downgrade() -> None:
    tables = [
        "audit_event", "payslip", "odoo_outbox", "payment_file", "payment_file_layout",
        "payroll_adjustment", "payroll_variable", "commission", "overtime", "attendance",
        "payroll_detail_line", "payroll_detail", "import_batch", "payroll_period",
        "legal_parameter", "concept_rule", "payroll_concept",
        "employment_contract", "payroll_employee", "cost_center", "company",
    ]
    for table in tables:
        op.drop_table(table, schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
