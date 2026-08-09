from app import app, db
from sqlalchemy import inspect, text

with app.app_context():
    inspector = inspect(db.engine)
    
    # Auto-detect if your table is named 'user' or 'users'
    table_name = 'user' if 'user' in inspector.get_table_names() else 'users'
    
    # Get all current columns in the table
    existing_columns = [col['name'] for col in inspector.get_columns(table_name)]
    
    if 'is_active' not in existing_columns:
        # 🚀 FIX: Changed 'DEFAULT 1' to 'DEFAULT TRUE' for PostgreSQL strict typing
        db.session.execute(text(f'ALTER TABLE {table_name} ADD COLUMN is_active BOOLEAN DEFAULT TRUE;'))
        db.session.commit()
        print(f'✅ SUCCESS: Added "is_active" column to the {table_name} table!')
    else:
        print(f'⚠️ The "is_active" column already exists in the {table_name} table.')