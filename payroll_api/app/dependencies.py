from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, Request

from app.config import settings


@dataclass
class AuditContext:
    user_email: str
    user_role: str
    ip_address: str
    endpoint: str


@dataclass
class PaginationParams:
    page: int
    page_size: int
    offset: int


PAYROLL_ROLES = {"ADMIN", "RRHH", "FINANZAS", "JEFE_AREA", "AUDITOR"}

# Maps existing VacationsPE roles to payroll roles
ROLE_MAPPING = {
    "ADMINISTRADOR": "ADMIN",
    "GERENTE_PAIS": "ADMIN",
    "RRHH": "RRHH",
    "SUPERVISOR": "JEFE_AREA",
    "USUARIO": None,  # No payroll access
}


async def get_audit_context(
    request: Request,
    x_user_email: str = Header(..., description="Email del usuario autenticado"),
    x_user_role: str = Header(..., description="Rol del usuario"),
) -> AuditContext:
    client_ip = request.client.host if request.client else "unknown"
    endpoint = f"{request.method} {request.url.path}"
    payroll_role = ROLE_MAPPING.get(x_user_role, x_user_role)
    if payroll_role is None:
        raise HTTPException(status_code=403, detail="No tiene acceso al módulo de nómina")
    return AuditContext(
        user_email=x_user_email,
        user_role=payroll_role,
        ip_address=client_ip,
        endpoint=endpoint,
    )


def require_roles(*allowed_roles: str):
    async def _check(ctx: AuditContext = Depends(get_audit_context)) -> AuditContext:
        if ctx.user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Rol '{ctx.user_role}' no tiene permiso para esta operación",
            )
        return ctx
    return _check


async def get_pagination(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size, offset=(page - 1) * page_size)


async def validate_webhook_or_session(
    request: Request,
    x_webhook_secret: str | None = Header(None),
    x_user_email: str | None = Header(None),
    x_user_role: str | None = Header(None),
) -> AuditContext:
    if x_webhook_secret and x_webhook_secret == settings.webhook_signing_secret:
        return AuditContext(
            user_email="power_automate@system",
            user_role="ADMIN",
            ip_address=request.client.host if request.client else "unknown",
            endpoint=f"{request.method} {request.url.path}",
        )
    if x_user_email and x_user_role:
        return await get_audit_context(request, x_user_email, x_user_role)
    raise HTTPException(status_code=401, detail="No autenticado")
