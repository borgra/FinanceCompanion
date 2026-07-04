from __future__ import annotations

from copy import deepcopy


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
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
        },
        {
            "id": "income-source-side",
            "name": "Side income",
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
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
        },
    ]
}

SEED_BUDGET_CATEGORIES = {
    "user-steve": [
        {
            "id": "cat-housing",
            "name": "Housing",
            "colorHex": "#4de3ff",
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
            "colorHex": "#9d7bff",
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
            "colorHex": "#ffd06a",
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
            "colorHex": "#5cff9a",
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
            "colorHex": "#ff6db1",
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
            "colorHex": "#ff8f4d",
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
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
        },
        {
            "id": "acc-secondary",
            "name": "Secondary Checking",
            "type": "Checking",
            "startingBalance": 5000,
            "startDate": "2026-01-01",
            "yieldRate": 0,
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
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
        },
        {
            "id": "acc-hys",
            "name": "High-Yield Savings",
            "type": "Savings",
            "startingBalance": 15000,
            "startDate": "2026-01-01",
            "yieldRate": 4.5,
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
            "createdAt": "2026-06-30T00:00:00.000Z",
            "updatedAt": "2026-06-30T00:00:00.000Z",
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
    }
