from fastapi import APIRouter, Depends, HTTPException, status
from dataclasses import asdict

from app.domain.models import ContributionPlan, ExpenseChange, RetirementPlan, SocialSecurityPlan
from app.infrastructure.in_memory_repositories import now_iso
from app.presentation.http.dependencies import get_container, require_session_user
from app.presentation.http.retirement_schemas import RetirementPlanPayload, RetirementPlanPutRequest

router = APIRouter()


def _to_payload(plan: RetirementPlan) -> RetirementPlanPayload:
    return RetirementPlanPayload.model_validate(asdict(plan))


@router.get("/retirement-plan", response_model=RetirementPlanPayload)
def get_retirement_plan(
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> RetirementPlanPayload:
    plan = container.get_retirement_plan.execute(user.user_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Retirement plan has not been configured.",
        )
    return _to_payload(plan)


@router.put("/retirement-plan", response_model=RetirementPlanPayload)
def put_retirement_plan(
    request: RetirementPlanPutRequest,
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> RetirementPlanPayload:
    plan = RetirementPlan(
        id="base-plan",
        name="Base Plan",
        current_age=request.current_age,
        retirement_age=request.retirement_age,
        longevity_age=request.longevity_age,
        annual_roi_percent=request.annual_roi_percent,
        withdrawal_rate_percent=request.withdrawal_rate_percent,
        annual_retirement_expense=request.annual_retirement_expense,
        withdrawal_mode=request.withdrawal_mode,
        taxable_contribution=ContributionPlan(
            monthly_amount=request.taxable_contribution.monthly_amount,
            annual_increase_percent=request.taxable_contribution.annual_increase_percent,
            end_age=request.taxable_contribution.end_age,
        ),
        retirement_contribution=ContributionPlan(
            monthly_amount=request.retirement_contribution.monthly_amount,
            annual_increase_percent=request.retirement_contribution.annual_increase_percent,
            end_age=request.retirement_contribution.end_age,
        ),
        expense_changes=[
            ExpenseChange(age=item.age, percent_change=item.percent_change, label=item.label)
            for item in request.expense_changes
        ],
        social_security=SocialSecurityPlan(
            enabled=request.social_security.enabled,
            claim_age=request.social_security.claim_age,
            monthly_benefit=request.social_security.monthly_benefit,
            annual_cola_percent=request.social_security.annual_cola_percent,
        ),
        include_hsa_in_retirement=request.include_hsa_in_retirement,
        updated_at=now_iso(),
    )
    return _to_payload(container.put_retirement_plan.execute(user.user_id, plan))
