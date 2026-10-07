from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import admin, auth, modules, jobs, recommend, skillgap, chatbot, profile
from app.models import user, module, job, programme  # noqa: F401
from app.models import profile as profile_model  # noqa: F401 — registers tables with Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.routers.auth import check_account_schema, delete_old_codes
    check_account_schema()   # stops with a clear message if migrate_account_security.py hasn't been run
    from app.routers.profile import check_profile_schema
    check_profile_schema()   # the same for migrate_profile_skill_evidence.py
    from app.routers.jobs import check_jobs_schema
    check_jobs_schema()      # the same for migrate_add_job_gone_at.py
    from app.routers.admin import check_admin_schema
    check_admin_schema()     # the same for migrate_admin_structure.py (7 Oct)
    delete_old_codes()
    from app.mongo import history_ok
    if not history_ok():     # a warning, not a stop: the chatbot works without MongoDB, chats are just not saved
        print("WARNING: MongoDB is not running, so chat history won't be saved. Start the MongoDB service.")
    from app.routers.recommend import build_job_cache
    build_job_cache()
    yield


Base.metadata.create_all(bind=engine)

app = FastAPI(title="FYP Skill Map API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
app.include_router(admin.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "FYP Skill Map API running"}