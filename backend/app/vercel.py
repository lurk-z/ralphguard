"""Same-origin mount for the FastAPI service in Vercel Services."""

from starlette.applications import Starlette
from starlette.routing import Mount

from app.main import app as api


app = Starlette(routes=[Mount("/backend", app=api)], lifespan=api.router.lifespan_context)
