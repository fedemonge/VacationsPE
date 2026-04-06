from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class ConceptCreate(BaseModel):
    code: str
    name: str
    category: str  # INGRESO, DESCUENTO, APORTE_EMPLEADOR, INFORMATIVO
    subcategory: str | None = None
    affects_essalud: bool = False
    affects_pension: bool = False
    affects_5ta_cat: bool = False
    affects_gratification: bool = False
    affects_cts: bool = False
    affects_vacation_pay: bool = False
    display_order: int = 0


class ConceptResponse(BaseModel):
    id: UUID
    company_id: UUID
    code: str
    name: str
    category: str
    subcategory: str | None
    affects_essalud: bool
    affects_pension: bool
    affects_5ta_cat: bool
    affects_gratification: bool
    affects_cts: bool
    affects_vacation_pay: bool
    is_system: bool
    is_active: bool
    display_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ConceptRuleCreate(BaseModel):
    concept_id: UUID
    valid_from: date
    valid_to: date | None = None
    calc_type: str  # FIXED, PERCENTAGE, FORMULA, LOOKUP, EXTERNAL
    calc_base: str | None = None
    calc_value: Decimal | None = None
    calc_formula: str | None = None
    parameters: dict = {}
    description: str | None = None
    legal_reference: str | None = None


class ConceptRuleResponse(BaseModel):
    id: UUID
    concept_id: UUID
    valid_from: date
    valid_to: date | None
    calc_type: str
    calc_base: str | None
    calc_value: Decimal | None
    calc_formula: str | None
    parameters: dict
    description: str | None
    legal_reference: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
