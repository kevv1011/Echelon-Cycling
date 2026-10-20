"""Per-rider storage and revocable database sessions, separate from legacy owner data."""
import hashlib
import secrets
import time
import uuid
from sqlalchemy import BigInteger, ForeignKey, JSON, String, delete, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from server.security import IDLE_TIMEOUT, ABSOLUTE_TIMEOUT


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'account_users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    google_sub: Mapped[str] = mapped_column(String(255), unique=True)
    email: Mapped[str] = mapped_column(String(320))
    name: Mapped[str] = mapped_column(String(200))


class UserProfile(Base):
    __tablename__ = 'account_profiles'
    user_id: Mapped[str] = mapped_column(ForeignKey('account_users.id'), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class UserPlan(Base):
    __tablename__ = 'account_plans'
    user_id: Mapped[str] = mapped_column(ForeignKey('account_users.id'), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[int] = mapped_column(BigInteger, default=lambda: int(time.time()))


class AccountSession(Base):
    __tablename__ = 'account_sessions'
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('account_users.id'), index=True)
    expires: Mapped[int] = mapped_column(BigInteger)
    active: Mapped[int] = mapped_column(BigInteger)


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


class SessionStore:
    def __init__(self, engine):
        self.engine = engine

    def issue(self, claims, previous=''):
        # Claims must come from Authlib's validated ID token, never request JSON.
        if not claims or claims.get('email_verified') is not True:
            raise ValueError('A verified Google email is required')
        sub, email = claims.get('sub'), claims.get('email')
        if not isinstance(sub, str) or not 1 <= len(sub) <= 255 or not isinstance(email, str) or not 1 <= len(email) <= 320:
            raise ValueError('Invalid identity claims')
        now = int(time.time())
        token = secrets.token_urlsafe(32)
        with Session(self.engine()) as db:
            user = db.scalar(select(User).where(User.google_sub == sub))
            if user is None:
                user = User(google_sub=sub, email=email, name=str(claims.get('name') or email)[:200])
                db.add(user)
                db.flush()
            else:
                user.email, user.name = email, str(claims.get('name') or email)[:200]
            db.execute(delete(AccountSession).where(
                (AccountSession.expires <= now) | (AccountSession.active <= now - IDLE_TIMEOUT) |
                (AccountSession.digest == digest(previous))))
            # Bound each account's active sessions; remove oldest when signing in again.
            old = list(db.scalars(select(AccountSession).where(AccountSession.user_id == user.id).order_by(AccountSession.active.desc())))
            for session in old[9:]:
                db.delete(session)
            db.add(AccountSession(digest=digest(token), user_id=user.id, expires=now + ABSOLUTE_TIMEOUT, active=now))
            db.commit()
        return token

    def get(self, token):
        if not token or len(token) > 256:
            return None
        now = int(time.time())
        with Session(self.engine()) as db:
            row = db.get(AccountSession, digest(token))
            if row is None or row.expires <= now or row.active + IDLE_TIMEOUT <= now:
                return None
            user = db.get(User, row.user_id)
            if user is None:
                return None
            return {'id': user.id, 'email': user.email, 'name': user.name,
                    'remaining': min(row.expires - now, row.active + IDLE_TIMEOUT - now)}

    def logout(self, token):
        with Session(self.engine()) as db:
            db.execute(delete(AccountSession).where(AccountSession.digest == digest(token)))
            db.commit()

    def touch(self, token):
        now = int(time.time())
        with Session(self.engine()) as db:
            result = db.execute(update(AccountSession).where(AccountSession.digest == digest(token),
                AccountSession.expires > now, AccountSession.active > now - IDLE_TIMEOUT).values(active=now))
            db.commit()
            return bool(result.rowcount)
