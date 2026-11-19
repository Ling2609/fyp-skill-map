"""20 Nov: other profile links (e.g. Google Scholar): saved, cleaned, checked, and shown to employers."""


def test_links_are_saved_and_cleaned(client, users):
    s = users.student()
    r = client.put("/profile/about", headers=users.h(s), json={"other_links": [
        {"label": "  Google   Scholar ", "url": "https://scholar.google.com/citations?user=abc"},
        {"label": "", "url": ""}]})
    assert r.status_code == 200, r.text
    assert client.get("/profile/about", headers=users.h(s)).json()["other_links"] == [
        {"label": "Google Scholar", "url": "https://scholar.google.com/citations?user=abc"}]


def test_bad_links_are_refused(client, users):
    h = users.h(users.student())
    assert client.put("/profile/about", headers=h, json={"other_links": [{"label": "", "url": "https://a.com"}]}).status_code == 400
    assert client.put("/profile/about", headers=h, json={"other_links": [{"label": "Blog", "url": "my blog"}]}).status_code == 400
    twice = [{"label": "A", "url": "https://a.com"}, {"label": "B", "url": "https://A.com"}]
    assert client.put("/profile/about", headers=h, json={"other_links": twice}).status_code == 400
    six = [{"label": f"L{i}", "url": f"https://site{i}.com"} for i in range(6)]
    assert client.put("/profile/about", headers=h, json={"other_links": six}).status_code == 400


def test_leaving_them_out_keeps_them(client, users):
    s = users.student()
    client.put("/profile/about", headers=users.h(s), json={"other_links": [{"label": "ORCID", "url": "https://orcid.org/0000"}]})
    client.put("/profile/about", headers=users.h(s), json={"headline": "Final-year student"})
    assert client.get("/profile/about", headers=users.h(s)).json()["other_links"][0]["label"] == "ORCID"
