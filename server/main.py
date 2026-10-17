"""Echelon single-owner API. Local by default; authenticated HTTPS for public hosts."""
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
import httpx
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import Field, model_validator
from server.security import Security, SecurityMiddleware
from server.routing import router as routing_router, StrictModel, Point
from sqlalchemy import JSON, DateTime, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./echelon.db')
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}, pool_pre_ping=True)

class Base(DeclarativeBase):
    pass

class RiderRecord(Base):
    __tablename__ = 'rider_profiles'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)

class PlanRecord(Base):
    __tablename__ = 'ride_plans'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class RiderProfile(StrictModel):
    riderWeight: float = Field(default=68, ge=35, le=180)
    bikeWeight: float = Field(default=8.5, ge=4, le=30)
    tireWidth: Literal[25, 28, 30, 32] = 28
    tubeless: bool = True
    ftp: int = Field(default=240, ge=50, le=600)

class RouteStats(StrictModel):
    cyclewayPct: float = Field(ge=0, le=100)
    majorRoadPct: float = Field(ge=0, le=100)
    highSpeedPct: float = Field(ge=0, le=100)
    litPct: float = Field(ge=0, le=100)
    unknownPct: float = Field(ge=0, le=100)
    unknownSurfacePct: float = Field(ge=0, le=100)
    unknownSpeedPct: float = Field(ge=0, le=100)
    unpavedPct: float = Field(ge=0, le=100)

class CustomRoute(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    geometry: list[tuple[Annotated[float, Field(ge=-85, le=85)], Annotated[float, Field(ge=-180, le=180)]]] = Field(min_length=2, max_length=12000)
    waypoints: list[Point] = Field(min_length=2, max_length=8)
    stats: RouteStats
    warnings: list[Annotated[str, Field(max_length=1000)]] = Field(max_length=10)
    fetchedAt: datetime
    kind: Literal['shortest', 'quieter']
    lat: float = Field(ge=-85, le=85)
    lon: float = Field(ge=-180, le=180)
    bearing: float = Field(ge=0, le=360)

class RideConfig(StrictModel):
    routeId: Literal['clark', 'arayat', 'subic', 'monasterio', 'custom']
    distance: float = Field(ge=0.1, le=500)
    elevation: float = Field(ge=0, le=10000)
    date: date
    time: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    effort: Literal['z2', 'tempo', 'race']
    condition: Literal['auto', 'dry', 'wet']
    customRoute: CustomRoute | None = None

    @model_validator(mode='after')
    def consistent_custom_route(self):
        if (self.routeId == 'custom') != (self.customRoute is not None):
            raise ValueError('A custom route must have valid mapped geometry; preset routes must not contain it')
        return self

class WeatherHour(StrictModel):
    time: str = Field(max_length=32)
    temp: float
    feels: float
    rain: float = Field(ge=0, le=100)
    wind: float = Field(ge=0)
    direction: float = Field(ge=0, le=360)

class RidePlan(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9-]+$')
    name: str = Field(min_length=1, max_length=160)
    date: date
    createdAt: datetime
    ride: RideConfig
    profile: RiderProfile
    weather: list[WeatherHour] = Field(max_length=100)
    source: Literal['live', 'cached', 'demo']
    forecastFetchedAt: datetime | None = None
    plan: dict[str, float | str | bool] = Field(max_length=32)
    briefing: str = Field(max_length=16000)

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    yield
    engine.dispose()

security = Security()
app = FastAPI(title='Echelon Cycling API', version='1.1.0', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(routing_router)
app.add_middleware(SecurityMiddleware, security=security)
app.add_middleware(CORSMiddleware, allow_origins=security.origins, allow_credentials=True, allow_methods=['GET', 'PUT', 'POST', 'DELETE'], allow_headers=['Content-Type'])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=security.hosts)

class LoginRequest(StrictModel):
    password: str = Field(min_length=1, max_length=256)

@app.get('/api/auth/status')
def auth_status(request: Request):
    token = request.cookies.get('echelon_session', '')
    authenticated = security.permitted(request.client.host, token)
    return {'passwordRequired': bool(security.password), 'authenticated': authenticated, 'sessionRemainingSeconds': security.remaining(token) if authenticated and security.password else None, 'serverTime': datetime.now(timezone.utc).isoformat()}

@app.post('/api/auth/login')
def login(payload: LoginRequest, response: Response, request: Request):
    token = security.login(payload.password)
    if not token:
        raise HTTPException(401, 'Invalid credentials')
    security.logout(request.cookies.get('echelon_session', ''))
    response.set_cookie('echelon_session', token, httponly=True, secure=security.secure_cookie, samesite='strict', max_age=8 * 3600, path='/api')
    return {'authenticated': True}

@app.post('/api/auth/activity')
def activity(request: Request):
    if not security.touch(request.client.host, request.cookies.get('echelon_session', '')):
        raise HTTPException(401, 'Session expired. Sign in again.')
    return {'sessionRemainingSeconds': security.remaining(request.cookies.get('echelon_session', ''))}

@app.post('/api/auth/logout', status_code=204)
def logout(request: Request, response: Response):
    security.logout(request.cookies.get('echelon_session', ''))
    response.delete_cookie('echelon_session', path='/api', secure=security.secure_cookie, httponly=True, samesite='strict')

@app.get('/api/health')
def health():
    with Session(engine) as db:
        db.execute(select(1))
    return {'status': 'ok', 'service': 'echelon-cycling'}

@app.get('/api/profile', response_model=RiderProfile)
def get_profile():
    with Session(engine) as db:
        row = db.get(RiderRecord, 1)
        return row.data if row else RiderProfile()

@app.put('/api/profile', response_model=RiderProfile)
def put_profile(profile: RiderProfile):
    with Session(engine) as db:
        db.merge(RiderRecord(id=1, data=profile.model_dump()))
        db.commit()
    return profile

@app.get('/api/plans', response_model=list[RidePlan])
def get_plans(limit: int = Query(default=50, ge=1, le=100)):
    with Session(engine) as db:
        return [row.data for row in db.scalars(select(PlanRecord).order_by(PlanRecord.created_at.desc()).limit(limit))]

@app.post('/api/plans', response_model=RidePlan, status_code=201)
def post_plan(plan: RidePlan):
    with Session(engine) as db:
        if db.get(PlanRecord, plan.id):
            raise HTTPException(409, 'A ride plan with this ID already exists')
        db.add(PlanRecord(id=plan.id, data=plan.model_dump(mode='json')))
        db.commit()
    return plan

@app.delete('/api/plans/{plan_id}', status_code=204)
def delete_plan(plan_id: str):
    with Session(engine) as db:
        row = db.get(PlanRecord, plan_id)
        if row is None:
            raise HTTPException(404, 'Ride plan not found')
        db.delete(row)
        db.commit()

@app.get('/api/weather')
async def weather(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180), start_date: date = Query(), end_date: date = Query()):
    today = datetime.now(timezone(timedelta(hours=8))).date()
    if not today <= start_date <= end_date <= today + timedelta(days=15):
        raise HTTPException(422, 'Select a forecast window within the next 16 days')
    params = {'latitude': latitude, 'longitude': longitude, 'start_date': str(start_date), 'end_date': str(end_date), 'timezone': 'Asia/Manila', 'wind_speed_unit': 'kmh', 'hourly': 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,wind_direction_10m'}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get('https://api.open-meteo.com/v1/forecast', params=params)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, 'Open-Meteo forecast unavailable') from error
