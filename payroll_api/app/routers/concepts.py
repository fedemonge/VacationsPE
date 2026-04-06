"""Payroll concept and rule management endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import AuditContext, require_roles
from app.models.concept import ConceptRule, PayrollConcept
from app.routers.employees import _get_company_id
from app.schemas.concept import ConceptCreate, ConceptResponse, ConceptRuleCreate, ConceptRuleResponse
from app.services import audit_service

router = APIRouter(prefix="/concepts", tags=["Conceptos de Nómina"])


@router.get("/", response_model=list[ConceptResponse])
async def list_concepts(
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "FINANZAS", "AUDITOR")),
):
    company_id = await _get_company_id(db)
    result = await db.execute(
        select(PayrollConcept)
        .where(PayrollConcept.company_id == company_id)
        .order_by(PayrollConcept.display_order, PayrollConcept.code)
    )
    return [ConceptResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/", response_model=ConceptResponse, status_code=201)
async def create_concept(
    data: ConceptCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN")),
):
    company_id = await _get_company_id(db)
    concept = PayrollConcept(company_id=company_id, **data.model_dump())
    db.add(concept)
    await db.flush()
    await audit_service.log_event(
        db, ctx, entity_type="CONCEPT", entity_id=concept.id,
        action="CREATE", new_values=data.model_dump(), company_id=company_id,
    )
    return ConceptResponse.model_validate(concept)


@router.get("/{concept_id}/rules", response_model=list[ConceptRuleResponse])
async def get_concept_rules(
    concept_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN", "RRHH", "AUDITOR")),
):
    result = await db.execute(
        select(ConceptRule)
        .where(ConceptRule.concept_id == concept_id)
        .order_by(ConceptRule.valid_from.desc())
    )
    return [ConceptRuleResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/rules", response_model=ConceptRuleResponse, status_code=201)
async def create_concept_rule(
    data: ConceptRuleCreate,
    db: AsyncSession = Depends(get_db),
    ctx: AuditContext = Depends(require_roles("ADMIN")),
):
    company_id = await _get_company_id(db)
    rule = ConceptRule(**data.model_dump())
    db.add(rule)
    await db.flush()
    await audit_service.log_event(
        db, ctx, entity_type="CONCEPT_RULE", entity_id=rule.id,
        action="CREATE", new_values=data.model_dump(mode="json"), company_id=company_id,
    )
    return ConceptRuleResponse.model_validate(rule)
