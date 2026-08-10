from app import app, db
from models import Feedback

with app.app_context():
    db.create_all()
    print("✅ SUCCESS: Feedback table created!")