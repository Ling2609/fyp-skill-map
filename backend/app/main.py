from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import auth, modules, jobs, recommend, skillgap
from app.models import user, module, job


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.get("/")
def root():
    return {"status": "ok", "message": "FYP Skill Map API running"}