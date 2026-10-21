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


MIGRATIONS = ("migrate_add_formatted_description", "migrate_phase1", "migrate_add_live_job_columns",
              "migrate_drop_user_skills_cache", "migrate_add_job_skill_evidence", "migrate_account_security",
              "migrate_profile_skill_evidence", "migrate_add_job_gone_at", "migrate_admin_structure",
              "migrate_admin_actions", "migrate_profile_showcase", "migrate_career_goal", "migrate_all_programmes",
              "migrate_intake_modules", "migrate_employer_jobs", "migrate_applications", "migrate_privacy_contact",
              "migrate_transparency", "migrate_record_keeping",
              "migrate_github_accounts", "migrate_job_requirements", "migrate_profile_more_evidence", "migrate_application_copy")
BACKUP = {"modules": "id", "module_skills": "module_id", "programme_modules": "module_id", "intake_modules": "module_id"}


def _row_counts(db) -> dict:
    tables = [r[0] for r in sql(db, "select table_name from information_schema.tables where table_schema='public' "
                                    "and table_name not like 'bk\\_%'")]
    return {t: sql(db, f'select count(*) from "{t}"').scalar() for t in tables}


def test_every_migration_is_safe_to_run_again(client, db):
    """Rerunning every migration on a database in use changes no row in any table, and keeps the career office's
    edits (14 Oct: rerunning on a full database found migrate_admin_structure linking every module to SE and
    migrate_all_programmes putting back modules the career office had removed; this test compared 3 tables then)."""
    se = sql(db, "select id from programmes where code='SE'").scalar()
    gone, unlinked = [r[0] for r in sql(db, "select pm.module_id from programme_modules pm where pm.programme_id=:p "
                                            "order by pm.module_id limit 2", p=se)]
    # the career office deletes one module altogether and takes another out of SE's list (kept for other lists)
    for table, col in BACKUP.items():
        sql(db, f"create table bk_{table} as select * from {table} where {col}=:m", m=gone)
    sql(db, "create table bk_unlinked as select * from programme_modules where programme_id=:p and module_id=:m",
        p=se, m=unlinked)
    try:
        for table, col in reversed(list(BACKUP.items())):
            sql(db, f"delete from {table} where {col}=:m", m=gone)
        sql(db, "delete from programme_modules where programme_id=:p and module_id=:m", p=se, m=unlinked)
        before = _row_counts(db)
        for name in MIGRATIONS:
            run_migration(name)
        assert _row_counts(db) == before, "running the migrations again changed the data"
        assert sql(db, "select count(*) from modules where id=:m", m=gone).scalar() == 0
        assert sql(db, "select count(*) from programme_modules where programme_id=:p and module_id=:m",
                   p=se, m=unlinked).scalar() == 0
    finally:                                   # put the module and the link back for the other tests
        for table in BACKUP:
            sql(db, f"insert into {table} select * from bk_{table}")
            sql(db, f"drop table bk_{table}")
        sql(db, "insert into programme_modules select * from bk_unlinked")
        sql(db, "drop table bk_unlinked")
