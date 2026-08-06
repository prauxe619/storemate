from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# This URL matches the exact username, password, and database name from your docker-compose file
DATABASE_URL = "postgresql://storemate_admin:secretpassword123@localhost:5433/storemate_dev"

# The engine handles the active socket connection to PostgreSQL
engine = create_engine(DATABASE_URL)

# SessionLocal instances will be the actual database transactions we perform
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# This Base class will be inherited by our future database tables (Models)
Base = declarative_base()

# This helper function will safely open a database connection whenever an API needs it, and close it when done
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()