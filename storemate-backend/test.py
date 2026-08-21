from app import app, db
from sqlalchemy import text

def migrate():
    with app.app_context():
        try:
            # Inject the new columns directly into the PostgreSQL database
            db.session.execute(text("ALTER TABLE users ADD COLUMN last_ip VARCHAR(45);"))
            db.session.execute(text("ALTER TABLE users ADD COLUMN city VARCHAR(100) DEFAULT 'Unknown City';"))
            db.session.execute(text("ALTER TABLE users ADD COLUMN state VARCHAR(100) DEFAULT 'Unknown State';"))
            db.session.execute(text("ALTER TABLE users ADD COLUMN country VARCHAR(100) DEFAULT 'India';"))
            
            db.session.commit()
            print("✅ Migration successful! New location columns added to 'users' table.")
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Migration failed (or columns already exist): {e}")

if __name__ == "__main__":
    migrate()