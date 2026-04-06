"""FastAPI application — Payroll API for Peru."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    adjustments,
    attendance,
    audit,
    bbva,
    commissions,
    concepts,
    contracts,
    cost_centers,
    employees,
    legal_params,
    odoo,
    overtime,
    payslips,
    periods,
    reports,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url=f"{settings.api_prefix}/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
prefix = settings.api_prefix
app.include_router(employees.router, prefix=prefix)
app.include_router(contracts.router, prefix=prefix)
app.include_router(cost_centers.router, prefix=prefix)
app.include_router(attendance.router, prefix=prefix)
app.include_router(overtime.router, prefix=prefix)
app.include_router(commissions.router, prefix=prefix)
app.include_router(concepts.router, prefix=prefix)
app.include_router(legal_params.router, prefix=prefix)
app.include_router(periods.router, prefix=prefix)
app.include_router(adjustments.router, prefix=prefix)
app.include_router(payslips.router, prefix=prefix)
app.include_router(reports.router, prefix=prefix)
app.include_router(bbva.router, prefix=prefix)
app.include_router(odoo.router, prefix=prefix)
app.include_router(audit.router, prefix=prefix)


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok", "version": settings.app_version}
