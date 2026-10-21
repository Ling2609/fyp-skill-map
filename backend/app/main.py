from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine
from app.routers import admin, admin_academic, applications, auth, employer, modules, jobs, recommend, skillgap, chatbot, profile, experience, github_connect
from app.models import user, module, job, programme, application  # noqa: F401
from app.models import profile as profile_model  # noqa: F401 — registers tables with Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.skill_profile import limit_blas_threads
    limit_blas_threads()     # 18 Oct (E5): small matrix products are faster on one core
    from app.routers.auth import check_account_schema, delete_old_codes
    check_account_schema()   # stops with a clear message if migrate_account_security.py hasn't been run
    from app.routers.profile import check_profile_schema
    check_profile_schema()   # the same for migrate_profile_skill_evidence.py
    from app.routers.jobs import check_jobs_schema
    check_jobs_schema()      # the same for migrate_add_job_gone_at.py
    from app.routers.applications import check_applications_schema
    check_applications_schema()   # the same for migrate_applications.py (11 Oct)
    from app.routers.admin import check_admin_schema
    check_admin_schema()     # the same for migrate_admin_structure.py (7 Oct)
    delete_old_codes()
    from app.mongo import history_ok
    if not history_ok():     # a warning, not a stop: the chatbot works without MongoDB, chats are just not saved
        print("WARNING: MongoDB is not running, so chat history won't be saved. Start the MongoDB service.")
    from app.routers.recommend import build_job_cache
    build_job_cache()
    # Load the skill relationship model in the background (8 Oct): the API is ready at once, and the first student
    # after a restart no longer waits for the model to load (a request that comes earlier simply waits for it)
    import threading
    from app.services import skill_relation
    threading.Thread(target=skill_relation.warm_up, name="relation-warm-up", daemon=True).start()
    yield


Base.metadata.create_all(bind=engine)

app = FastAPI(title="FYP Skill Map API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],   # CORS_ORIGINS in .env
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(modules.router)
app.include_router(jobs.router)
app.include_router(recommend.router)
app.include_router(skillgap.router)
app.include_router(chatbot.router)
app.include_router(profile.router)
app.include_router(experience.router)
app.include_router(github_connect.router)
app.include_router(admin.router)
app.include_router(admin_academic.router)
app.include_router(employer.router)
app.include_router(applications.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "FYP Skill Map API running"}