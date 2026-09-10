from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import auth, modules, jobs, recommend
from app.models import user, module, job

Base.metadata.create_all(bind=engine)

app = FastAPI(title="FYP Skill Map API", version="0.1.0")

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

@app.get("/")
def root():
    return {"status": "ok", "message": "FYP Skill Map API running"}