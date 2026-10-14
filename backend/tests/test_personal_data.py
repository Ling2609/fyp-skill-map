"""Personal data (14 Oct; PDPA 2010): optional contact details with checks, and "Download my data" with everything
SkillMap holds about the user except security data."""
import json


def test_contact_details_are_checked(client, users):
    student = users.student()
    h = users.h(student)
    assert client.put("/profile/about", headers=h, json={"phone": "call me"}).status_code == 400
    assert client.put("/profile/about", headers=h, json={"available_from": "Jan 2027"}).status_code == 400
    r = client.put("/profile/about", headers=h, json={"phone": " +60 12-345  6789 ", "city": " Kuala  Lumpur ",
                                                     "available_from": "2027-01"})
    assert r.status_code == 200
    assert (r.json()["phone"], r.json()["city"], r.json()["available_from"]) == ("+60 12-345 6789", "Kuala Lumpur", "2027-01")
    # clearing them is allowed (all optional)
    r = client.put("/profile/about", headers=h, json={})
    assert (r.json()["phone"], r.json()["city"]) == ("", "")


def test_download_my_data(client, users, post_job):
    employer, student = users.employer(), users.student(skills=("Python",))
    job = post_job(employer)
    client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]})
    r = client.get("/auth/me/export", headers=users.h(student))
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = json.loads(r.content)
    assert data["account"]["email"] == student and data["account"]["privacy_accepted_at"]
    assert "hashed_password" not in data["account"] and "$2b$" not in r.text          # no password hash
    assert data["projects"][0]["name"] == "Shop API" and "Python" in data["projects"][0]["extracted_skills"]
    assert data["applications"][0]["job"] == job["title"] and data["applications"][0]["status"] == "applied"
    assert "ai_assistant_chats" in data                    # a list, or a note when MongoDB can't be reached
    assert client.get("/auth/me/export").status_code == 401
