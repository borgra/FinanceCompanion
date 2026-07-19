from test_api_contracts import authenticate, build_test_client


def test_budget_category_draft_saves_parent_edits_upserts_additions_and_removals_atomically():
    client = build_test_client()
    authenticate(client)
    housing = next(item for item in client.get("/api/v1/budget/categories").json() if item["id"] == "cat-housing")
    rent = next(item for item in housing["subCategories"] if item["id"] == "sub-house")

    saved = client.put("/api/v1/budget/categories/cat-housing/draft", json={
        "name": "Home",
        "colorHex": "#123456",
        "icon": "cottage",
        "isEssential": False,
        "subCategories": [
            {"id": rent["id"], "name": "Mortgage", "monthlyAmountUsd": 1600},
            {"name": "Repairs", "monthlyAmountUsd": 125},
        ],
    })
    assert saved.status_code == 200
    payload = saved.json()
    assert (payload["name"], payload["colorHex"], payload["icon"], payload["isEssential"]) == ("Home", "#123456", "cottage", False)
    assert [(item["name"], item["monthlyAmountUsd"]) for item in payload["subCategories"]] == [("Mortgage", 1600), ("Repairs", 125)]
    assert payload["subCategories"][0]["id"] == "sub-house"
    assert payload["subCategories"][1]["id"].startswith("sub-")

    rejected = client.put("/api/v1/budget/categories/cat-housing/draft", json={
        "name": "Should not persist", "colorHex": "#000000", "icon": "home", "isEssential": True,
        "subCategories": [{"id": "sub-missing", "name": "Missing", "monthlyAmountUsd": 1}],
    })
    assert rejected.status_code == 404
    persisted = next(item for item in client.get("/api/v1/budget/categories").json() if item["id"] == "cat-housing")
    assert persisted == payload
