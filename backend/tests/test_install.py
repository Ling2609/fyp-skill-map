"""A brand-new install: the API starts on an empty database, and the data migrations can be run again safely."""
from conftest import run_migration, sql


def test_api_starts_on_an_empty_database(client):
    assert client.get("/").json()["status"] == "ok"


def test_new_install_has_the_programmes_modules_and_intakes(client, db):
    counts = sql(db, "select (select count(*) from programmes), (select count(*) from modules), "
                     "(select count(*) from intakes), (select count(*) from intake_modules)").one()
    assert counts[0] == 17 and counts[1] == 198 and counts[2] > 0 and counts[3] > 0, counts


def test_new_tables_and_unique_rules_exist(client, db):
    tables = {r[0] for r in sql(db, "select table_name from information_schema.tables where table_schema='public'")}
    assert {"applications", "application_events", "job_invitations", "login_attempts", "admin_actions"} <= tables
    uniques = {r[0] for r in sql(db, "select conname from pg_constraint where contype='u'")}
    assert {"uq_application_job_student", "uq_invitation_job_student"} <= uniques


def test_every_migration_is_safe_to_run_again(client, db):
    before = sql(db, "select (select count(*) from programmes), (select count(*) from modules), "
                     "(select count(*) from intake_modules)").one()
    for name in ("migrate_add_formatted_description", "migrate_phase1", "migrate_add_live_job_columns",
                 "migrate_drop_user_skills_cache", "migrate_add_job_skill_evidence", "migrate_account_security",
                 "migrate_profile_skill_evidence", "migrate_add_job_gone_at", "migrate_admin_structure",
                 "migrate_admin_actions", "migrate_profile_showcase", "migrate_career_goal", "migrate_all_programmes",
                 "migrate_intake_modules", "migrate_employer_jobs", "migrate_applications", "migrate_privacy_contact", "migrate_transparency",
                 "migrate_record_keeping"):
        run_migration(name)
    after = sql(db, "select (select count(*) from programmes), (select count(*) from modules), "
                    "(select count(*) from intake_modules)").one()
    assert tuple(before) == tuple(after), "running the migrations again changed the data"
