from __future__ import annotations

from copy import deepcopy


SEED_TIMESTAMP = "2026-06-30T00:00:00.000Z"
PROJECTION_MONTHS = [
    "Jan-26",
    "Feb-26",
    "Mar-26",
    "Apr-26",
    "May-26",
    "Jun-26",
    "Jul-26",
    "Aug-26",
    "Sep-26",
    "Oct-26",
    "Nov-26",
    "Dec-26",
]


def _empty_monthly_records():
    return [
        {"month": month, "credit": 0, "outflows": {}, "invest": 0, "savings": 0}
        for month in PROJECTION_MONTHS
    ]


def _investment_allocation_records(monthly_amounts: list[float]):
    return [
        {
            "month": month,
            "credit": 0,
            "outflows": {},
            "invest": monthly_amounts[index],
            "savings": 0,
        }
        for index, month in enumerate(PROJECTION_MONTHS)
    ]


SEED_USERS = [
    {
        "id": "user-steve",
        "email": "steveborgra@gmail.com",
        "displayName": "Steve Borgra",
        "identitySubject": None,
        "identityObjectId": None,
        "identityTenantId": None,
        "pictureUrl": None,
    }
]

SEED_INCOME_SOURCES = {
    "user-steve": [
        {
            "id": "income-source-primary",
            "name": "Primary job",
            "type": "Salary",
            "cadence": "Bi-weekly",
            "periods": [
                {
                    "id": "primary-period",
                    "startDate": "2026-01-01",
                    "yearlyGrossAmount": 120000,
                    "netPercentage": 75,
                }
            ],
            "status": "Active",
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "income-source-side",
            "name": "Consulting income",
            "type": "Salary",
            "cadence": "Bi-weekly",
            "periods": [
                {
                    "id": "side-period",
                    "startDate": "2026-01-01",
                    "yearlyGrossAmount": 30000,
                    "netPercentage": 50,
                }
            ],
            "status": "Active",
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "income-source-bonus",
            "name": "Annual performance bonus",
            "type": "Bonus",
            "cadence": "Annual",
            "periods": [
                {
                    "id": "bonus-period",
                    "startDate": "2026-04-01",
                    "yearlyGrossAmount": 18000,
                    "netPercentage": 62,
                }
            ],
            "status": "Active",
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "income-source-dividends",
            "name": "Dividend income",
            "type": "Investment",
            "cadence": "Monthly",
            "periods": [
                {
                    "id": "dividend-period",
                    "startDate": "2026-01-01",
                    "yearlyGrossAmount": 3600,
                    "netPercentage": 85,
                }
            ],
            "status": "Active",
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
    ]
}

SEED_BUDGET_CATEGORIES = {
    "user-steve": [
        {
            "id": "cat-housing",
            "name": "Housing",
            "colorHex": "#38bdf8",
            "icon": "home",
            "isEssential": True,
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
            "subCategories": [
                {
                    "id": "sub-house",
                    "categoryId": "cat-housing",
                    "name": "Rent",
                    "monthlyAmountUsd": 1350,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-hoa",
                    "categoryId": "cat-housing",
                    "name": "HOA",
                    "monthlyAmountUsd": 100,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
            ],
        },
        {
            "id": "cat-utilities",
            "name": "Utilities",
            "colorHex": "#a78bfa",
            "icon": "bolt",
            "isEssential": True,
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
            "subCategories": [
                {
                    "id": "sub-electric",
                    "categoryId": "cat-utilities",
                    "name": "Electricity",
                    "monthlyAmountUsd": 90,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-internet",
                    "categoryId": "cat-utilities",
                    "name": "Internet",
                    "monthlyAmountUsd": 70,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-water",
                    "categoryId": "cat-utilities",
                    "name": "Water",
                    "monthlyAmountUsd": 30,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
            ],
        },
        {
            "id": "cat-groceries",
            "name": "Groceries",
            "colorHex": "#f59e0b",
            "icon": "shopping_cart",
            "isEssential": True,
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
            "subCategories": [
                {
                    "id": "sub-groceries",
                    "categoryId": "cat-groceries",
                    "name": "Groceries",
                    "monthlyAmountUsd": 450,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-household",
                    "categoryId": "cat-groceries",
                    "name": "Household",
                    "monthlyAmountUsd": 80,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
            ],
        },
        {
            "id": "cat-transport",
            "name": "Transportation",
            "colorHex": "#14b8a6",
            "icon": "directions_car",
            "isEssential": True,
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
            "subCategories": [
                {
                    "id": "sub-gas",
                    "categoryId": "cat-transport",
                    "name": "Gas",
                    "monthlyAmountUsd": 150,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-transit",
                    "categoryId": "cat-transport",
                    "name": "Transit",
                    "monthlyAmountUsd": 60,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
            ],
        },
        {
            "id": "cat-health",
            "name": "Healthcare",
            "colorHex": "#fb7185",
            "icon": "health_and_safety",
            "isEssential": True,
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
            "subCategories": [
                {
                    "id": "sub-insurance",
                    "categoryId": "cat-health",
                    "name": "Insurance",
                    "monthlyAmountUsd": 200,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-meds",
                    "categoryId": "cat-health",
                    "name": "Meds",
                    "monthlyAmountUsd": 40,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
            ],
        },
        {
            "id": "cat-lifestyle",
            "name": "Lifestyle",
            "colorHex": "#f97316",
            "icon": "restaurant",
            "isEssential": False,
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
            "subCategories": [
                {
                    "id": "sub-dining",
                    "categoryId": "cat-lifestyle",
                    "name": "Dining",
                    "monthlyAmountUsd": 160,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
                {
                    "id": "sub-entertain",
                    "categoryId": "cat-lifestyle",
                    "name": "Entertainment",
                    "monthlyAmountUsd": 120,
                    "createdAt": "2026-06-30T00:00:00.000Z",
                    "updatedAt": "2026-06-30T00:00:00.000Z",
                },
            ],
        },
        {
            "id": "cat-debt",
            "name": "Debt Payments",
            "colorHex": "#fb7185",
            "icon": "payments",
            "isEssential": True,
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
            "subCategories": [
                {
                    "id": "sub-student-loan",
                    "categoryId": "cat-debt",
                    "name": "Student loan",
                    "monthlyAmountUsd": 325,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
                {
                    "id": "sub-auto-loan",
                    "categoryId": "cat-debt",
                    "name": "Auto loan",
                    "monthlyAmountUsd": 410,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
            ],
        },
        {
            "id": "cat-insurance",
            "name": "Insurance",
            "colorHex": "#38bdf8",
            "icon": "health_and_safety",
            "isEssential": True,
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
            "subCategories": [
                {
                    "id": "sub-auto-insurance",
                    "categoryId": "cat-insurance",
                    "name": "Auto insurance",
                    "monthlyAmountUsd": 135,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
                {
                    "id": "sub-life-insurance",
                    "categoryId": "cat-insurance",
                    "name": "Life insurance",
                    "monthlyAmountUsd": 42,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
            ],
        },
        {
            "id": "cat-subscriptions",
            "name": "Subscriptions",
            "colorHex": "#a78bfa",
            "icon": "subscriptions",
            "isEssential": False,
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
            "subCategories": [
                {
                    "id": "sub-streaming",
                    "categoryId": "cat-subscriptions",
                    "name": "Streaming",
                    "monthlyAmountUsd": 55,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
                {
                    "id": "sub-software",
                    "categoryId": "cat-subscriptions",
                    "name": "Software",
                    "monthlyAmountUsd": 48,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
            ],
        },
        {
            "id": "cat-savings",
            "name": "Savings Goals",
            "colorHex": "#00e676",
            "icon": "savings",
            "isEssential": False,
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
            "subCategories": [
                {
                    "id": "sub-emergency-fund",
                    "categoryId": "cat-savings",
                    "name": "Emergency fund",
                    "monthlyAmountUsd": 600,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
                {
                    "id": "sub-travel-fund",
                    "categoryId": "cat-savings",
                    "name": "Travel fund",
                    "monthlyAmountUsd": 250,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
            ],
        },
        {
            "id": "cat-giving",
            "name": "Giving",
            "colorHex": "#f59e0b",
            "icon": "volunteer_activism",
            "isEssential": False,
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
            "subCategories": [
                {
                    "id": "sub-charity",
                    "categoryId": "cat-giving",
                    "name": "Charity",
                    "monthlyAmountUsd": 200,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
                {
                    "id": "sub-family-support",
                    "categoryId": "cat-giving",
                    "name": "Family support",
                    "monthlyAmountUsd": 150,
                    "createdAt": SEED_TIMESTAMP,
                    "updatedAt": SEED_TIMESTAMP,
                },
            ],
        },
    ]
}

SEED_ACCOUNTS = {
    "user-steve": [
        {
            "id": "acc-lfcu",
            "name": "Liberty Federal Credit Union",
            "type": "Checking",
            "startingBalance": 30564,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": ["income-source-primary", "income-source-side"],
            "savingsAccountId": "acc-hys",
            "columns": [
                {"id": "house", "name": "House", "icon": "home"},
                {"id": "chase", "name": "Chase", "icon": "credit_card"},
                {"id": "amex-p", "name": "Amex - P", "icon": "credit_card"},
                {"id": "amex-c", "name": "Amex - C", "icon": "credit_card"},
                {"id": "rh", "name": "RH", "icon": "trending_up"},
                {"id": "misc", "name": "Misc", "icon": "payments"},
            ],
            "monthlyRecords": [
                {"month": "Jan-26", "credit": 11752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3159, "amex-c": 1293, "rh": 1220, "misc": 35}, "invest": 2700, "savings": 0},
                {"month": "Feb-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3536, "amex-c": 1700, "rh": 1138, "misc": -2112}, "invest": 2700, "savings": 0},
                {"month": "Mar-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 2560, "amex-c": 1363, "rh": 0, "misc": -351}, "invest": 2700, "savings": 350},
                {"month": "Apr-26", "credit": 18252, "outflows": {"house": 3030, "chase": 0, "amex-p": 9897, "amex-c": 1427, "rh": 0, "misc": 10068}, "invest": 1700, "savings": 0},
                {"month": "May-26", "credit": 16128, "outflows": {"house": 3030, "chase": 0, "amex-p": 3000, "amex-c": 1432, "rh": 1352, "misc": -860}, "invest": 2700, "savings": 0},
                {"month": "Jun-26", "credit": 10752, "outflows": {"house": 3030, "chase": 1878, "amex-p": 2457, "amex-c": 1175, "rh": 797, "misc": -434}, "invest": 2700, "savings": 0},
                {"month": "Jul-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3988, "amex-c": 1071, "rh": 0, "misc": 500}, "invest": 2000, "savings": 0},
                {"month": "Aug-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3250, "amex-c": 1500, "rh": 1500, "misc": 500}, "invest": 2000, "savings": 0},
                {"month": "Sep-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3250, "amex-c": 1500, "rh": 1500, "misc": 500}, "invest": 2000, "savings": 0},
                {"month": "Oct-26", "credit": 16128, "outflows": {"house": 3030, "chase": 0, "amex-p": 3250, "amex-c": 1500, "rh": 1500, "misc": 500}, "invest": 2000, "savings": 0},
                {"month": "Nov-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3250, "amex-c": 1500, "rh": 1500, "misc": 500}, "invest": 2000, "savings": 0},
                {"month": "Dec-26", "credit": 10752, "outflows": {"house": 3030, "chase": 0, "amex-p": 3250, "amex-c": 1500, "rh": 1500, "misc": 500}, "invest": 2000, "savings": 0},
            ],
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "acc-secondary",
            "name": "Secondary Checking",
            "type": "Checking",
            "startingBalance": 5000,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": [],
            "columns": [
                {"id": "utilities", "name": "Utilities", "icon": "bolt"},
                {"id": "misc", "name": "Misc", "icon": "payments"},
            ],
            "monthlyRecords": [
                {"month": "Jan-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Feb-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Mar-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Apr-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "May-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Jun-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Jul-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Aug-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Sep-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Oct-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Nov-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Dec-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
            ],
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "acc-hys",
            "name": "High-Yield Savings",
            "type": "Savings",
            "startingBalance": 15000,
            "startDate": "2026-01-01",
            "yieldRate": 4.5,
            "assignedIncomeSourceIds": [],
            "columns": [],
            "monthlyRecords": [
                {"month": "Jan-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Feb-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Mar-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Apr-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "May-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Jun-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Jul-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Aug-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Sep-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Oct-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Nov-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
                {"month": "Dec-26", "credit": 0, "outflows": {}, "invest": 0, "savings": 0},
            ],
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "acc-taxable-brokerage",
            "name": "Fidelity Taxable Brokerage",
            "type": "Investment",
            "startingBalance": 48500,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": [],
            "investmentAccountType": "Taxable",
            "investmentBrokerage": "Fidelity",
            "manageHoldings": True,
            "yearlyContribution": 14400,
            "employerIncomeSourceId": None,
            "employerMatchRatePercent": 0,
            "employerMatchCapPercent": 0,
            "employerMatchStartDate": None,
            "employerMatchAmount": 0,
            "employerMatchPercent": 0,
            "columns": [],
            "monthlyRecords": _investment_allocation_records(
                [1800, 1800, 1800, 1200, 1800, 1800, 1300, 1300, 1300, 1300, 1300, 1300]
            ),
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "acc-401k",
            "name": "Employer 401k",
            "type": "Investment",
            "startingBalance": 126000,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": [],
            "investmentAccountType": "401k",
            "investmentBrokerage": "Fidelity",
            "manageHoldings": False,
            "yearlyContribution": 23000,
            "employerIncomeSourceId": "income-source-primary",
            "employerMatchRatePercent": 100,
            "employerMatchCapPercent": 4,
            "employerMatchStartDate": "2026-01-01",
            "employerMatchAmount": 0,
            "employerMatchPercent": 0,
            "columns": [],
            "monthlyRecords": _empty_monthly_records(),
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "acc-roth-ira",
            "name": "Roth IRA",
            "type": "Investment",
            "startingBalance": 32500,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": [],
            "investmentAccountType": "IRA",
            "investmentBrokerage": "eTrade",
            "manageHoldings": True,
            "yearlyContribution": 7000,
            "employerIncomeSourceId": None,
            "employerMatchRatePercent": 0,
            "employerMatchCapPercent": 0,
            "employerMatchStartDate": None,
            "employerMatchAmount": 0,
            "employerMatchPercent": 0,
            "columns": [],
            "monthlyRecords": _investment_allocation_records(
                [900, 900, 900, 500, 900, 900, 700, 700, 700, 700, 700, 700]
            ),
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "acc-hsa",
            "name": "Health Savings Account",
            "type": "Investment",
            "startingBalance": 9200,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": [],
            "investmentAccountType": "HSA",
            "investmentBrokerage": "Fidelity",
            "manageHoldings": True,
            "yearlyContribution": 4150,
            "employerIncomeSourceId": "income-source-primary",
            "employerMatchRatePercent": 0,
            "employerMatchCapPercent": 0,
            "employerMatchStartDate": "2026-01-01",
            "employerMatchAmount": 1000,
            "employerMatchPercent": 0,
            "columns": [],
            "monthlyRecords": _empty_monthly_records(),
            "createdAt": SEED_TIMESTAMP,
            "updatedAt": SEED_TIMESTAMP,
        },
    ]
}

SEED_HOLDINGS = {
    "user-steve": [
        {
            "id": "holding-msft",
            "security": {
                "symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ",
                "assetType": "Equity", "currency": "USD", "price": 510,
                "payoutDetails": [
                    {"exDividendDate": "2026-05-14", "paymentDate": "2026-06-12", "amount": 0.83, "source": "seed"},
                    {"exDividendDate": "2025-11-20", "paymentDate": "2025-12-12", "amount": 0.83, "source": "seed"},
                ],
            },
            "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 12, "costBasis": None}],
            "createdAt": SEED_TIMESTAMP, "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "holding-schd",
            "security": {
                "symbol": "SCHD", "name": "Schwab U.S. Dividend Equity ETF", "exchange": "NYSE Arca",
                "assetType": "ETF", "currency": "USD", "price": 29,
                "payoutDetails": [
                    {"exDividendDate": "2026-06-24", "paymentDate": "2026-06-29", "amount": 0.2525, "source": "seed"},
                    {"exDividendDate": "2026-03-25", "paymentDate": "2026-03-30", "amount": 0.2569, "source": "seed"},
                    {"exDividendDate": "2025-12-10", "paymentDate": "2025-12-15", "amount": 0.2782, "source": "seed"},
                    {"exDividendDate": "2025-09-24", "paymentDate": "2025-09-29", "amount": 0.2604, "source": "seed"},
                    {"exDividendDate": "2025-06-25", "paymentDate": "2025-06-30", "amount": 0.2602, "source": "seed"},
                    {"exDividendDate": "2025-03-26", "paymentDate": "2025-03-31", "amount": 0.2488, "source": "seed"},
                    {"exDividendDate": "2024-12-11", "paymentDate": "2024-12-16", "amount": 0.2645, "source": "seed"},
                    {"exDividendDate": "2024-09-25", "paymentDate": "2024-09-30", "amount": 0.7545, "source": "seed"},
                    {"exDividendDate": "2024-06-26", "paymentDate": "2024-07-01", "amount": 0.8241, "source": "seed"},
                    {"exDividendDate": "2024-03-20", "paymentDate": "2024-03-25", "amount": 0.6110, "source": "seed"},
                    {"exDividendDate": "2023-12-06", "paymentDate": "2023-12-11", "amount": 0.7423, "source": "seed"},
                    {"exDividendDate": "2023-09-20", "paymentDate": "2023-09-25", "amount": 0.6545, "source": "seed"},
                    {"exDividendDate": "2023-06-21", "paymentDate": "2023-06-26", "amount": 0.6647, "source": "seed"},
                    {"exDividendDate": "2023-03-22", "paymentDate": "2023-03-27", "amount": 0.5965, "source": "seed"},
                    {"exDividendDate": "2022-12-07", "paymentDate": "2022-12-12", "amount": 0.7034, "source": "seed"},
                    {"exDividendDate": "2022-09-21", "paymentDate": "2022-09-26", "amount": 0.6367, "source": "seed"},
                    {"exDividendDate": "2022-06-22", "paymentDate": "2022-06-27", "amount": 0.7038, "source": "seed"},
                    {"exDividendDate": "2022-03-23", "paymentDate": "2022-03-28", "amount": 0.5176, "source": "seed"},
                    {"exDividendDate": "2021-12-08", "paymentDate": "2021-12-13", "amount": 0.6198, "source": "seed"},
                    {"exDividendDate": "2021-09-22", "paymentDate": "2021-09-27", "amount": 0.5870, "source": "seed"},
                    {"exDividendDate": "2021-06-23", "paymentDate": "2021-06-28", "amount": 0.5396, "source": "seed"},
                    {"exDividendDate": "2021-03-24", "paymentDate": "2021-03-29", "amount": 0.5026, "source": "seed"},
                ],
                "corporateActions": [
                    {"id": "schd-split-2024", "effectiveDate": "2024-10-10", "type": "stock_split", "oldShares": 1, "newShares": 3},
                ],
            },
            "accountPositions": [{"accountId": "acc-roth-ira", "quantity": 40, "costBasis": None}],
            "createdAt": SEED_TIMESTAMP, "updatedAt": SEED_TIMESTAMP,
        },
        {
            "id": "holding-jepq",
            "security": {
                "symbol": "JEPQ", "name": "JPMorgan Nasdaq Equity Premium Income ETF", "exchange": "NASDAQ",
                "assetType": "ETF", "currency": "USD", "price": 61,
                "payoutDetails": [
                    {"exDividendDate": "2026-07-01", "paymentDate": "2026-07-06", "amount": 0.63658, "source": "seed"},
                    {"exDividendDate": "2025-09-02", "paymentDate": None, "amount": 0.44195, "source": "seed"},
                ],
            },
            "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 25, "costBasis": None}],
            "createdAt": SEED_TIMESTAMP, "updatedAt": SEED_TIMESTAMP,
        },
    ]
}


def clone_seed_data(allowed_email: str | None = None):
    users = deepcopy(SEED_USERS)
    if allowed_email and users:
        users[0]["email"] = allowed_email

    return {
        "users": users,
        "income_sources": deepcopy(SEED_INCOME_SOURCES),
        "budget_categories": deepcopy(SEED_BUDGET_CATEGORIES),
        "accounts": deepcopy(SEED_ACCOUNTS),
        "holdings": deepcopy(SEED_HOLDINGS),
    }
