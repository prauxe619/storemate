import os
import getpass

from app import app
from models import db, User
from werkzeug.security import generate_password_hash


def create_superadmin():
    print("=== StoreMate Super Admin Creator ===")

    email = input("Admin email: ").strip().lower()
    password = getpass.getpass("Admin password: ")
    confirm = getpass.getpass("Confirm password: ")

    if not email:
        print("❌ Email is required.")
        return

    if not password:
        print("❌ Password is required.")
        return

    if password != confirm:
        print("❌ Passwords do not match.")
        return

    if len(password) < 12:
        print("❌ Password must be at least 12 characters.")
        return

    with app.app_context():

        existing = User.query.filter_by(email=email).first()

        if existing:
            print(f"⚠️ User already exists: {email}")

            update = input(
                "Make this existing user SUPERADMIN and reset password? (yes/no): "
            ).strip().lower()

            if update != "yes":
                print("❌ Cancelled.")
                return

            existing.password_hash = generate_password_hash(password)
            existing.role = "SUPERADMIN"

            if hasattr(existing, "is_active"):
                existing.is_active = True

            db.session.commit()

            print("✅ Existing user promoted to SUPERADMIN.")
            print(f"📧 Email: {email}")
            return

        admin = User(
            email=email,
            password_hash=generate_password_hash(password),
            role="SUPERADMIN",
            shop_name="StoreMate"
        )

        if hasattr(admin, "is_active"):
            admin.is_active = True

        db.session.add(admin)
        db.session.commit()

        print()
        print("================================")
        print("✅ SUPER ADMIN CREATED")
        print("================================")
        print(f"Email: {email}")
        print("Password: [not displayed]")
        print("Role: SUPERADMIN")
        print("================================")


if __name__ == "__main__":
    create_superadmin()
