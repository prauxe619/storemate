import os
import sys

from sqlalchemy import text, inspect
from app import app
from models import db


def column_exists(
    connection,
    table_name,
    column_name
):
    inspector = inspect(
        connection
    )

    columns = inspector.get_columns(
        table_name
    )

    return any(
        column["name"] == column_name
        for column in columns
    )


def table_exists(
    connection,
    table_name
):
    inspector = inspect(
        connection
    )

    return table_name in inspector.get_table_names()


def add_column_if_missing(
    connection,
    table_name,
    column_name,
    sql_type
):
    if not table_exists(
        connection,
        table_name
    ):
        print(
            f"⚠️ Table does not exist: "
            f"{table_name}"
        )
        return

    if column_exists(
        connection,
        table_name,
        column_name
    ):
        print(
            f"✓ {table_name}.{column_name} "
            f"already exists"
        )
        return

    print(
        f"➕ Adding "
        f"{table_name}.{column_name}"
    )

    connection.execute(
        text(
            f"""
            ALTER TABLE {table_name}
            ADD COLUMN {column_name} {sql_type}
            """
        )
    )


def run_migration():

    print("=" * 60)
    print("StoreMate PostgreSQL Migration")
    print("=" * 60)

    with app.app_context():

        connection = db.engine.connect()

        transaction = connection.begin()

        try:

            # ==================================================
            # CHECK DATABASE
            # ==================================================

            print(
                "\nDatabase:"
            )

            print(
                db.engine.url.render_as_string(
                    hide_password=True
                )
            )


            # ==================================================
            # INVENTORY
            # ==================================================

            print(
                "\n--- INVENTORY ---"
            )


            # owner_id
            add_column_if_missing(
                connection,
                "inventory_items",
                "owner_id",
                "VARCHAR(255)"
            )


            # unit
            add_column_if_missing(
                connection,
                "inventory_items",
                "unit",
                "VARCHAR(30)"
            )


            # category
            add_column_if_missing(
                connection,
                "inventory_items",
                "category",
                "VARCHAR(100)"
            )


            # image_url
            add_column_if_missing(
                connection,
                "inventory_items",
                "image_url",
                "VARCHAR(1000)"
            )


            # is_synced
            add_column_if_missing(
                connection,
                "inventory_items",
                "is_synced",
                "BOOLEAN"
            )


            # created_at
            add_column_if_missing(
                connection,
                "inventory_items",
                "created_at",
                "BIGINT"
            )


            # ==================================================
            # INVENTORY DEFAULTS
            # ==================================================

            print(
                "\nUpdating inventory defaults..."
            )


            connection.execute(
                text(
                    """
                    UPDATE inventory_items
                    SET unit = 'PCS'
                    WHERE unit IS NULL
                    """
                )
            )


            connection.execute(
                text(
                    """
                    UPDATE inventory_items
                    SET is_synced = TRUE
                    WHERE is_synced IS NULL
                    """
                )
            )


            connection.execute(
                text(
                    """
                    UPDATE inventory_items
                    SET created_at = updated_at
                    WHERE created_at IS NULL
                    """
                )
            )


            # ==================================================
            # INVENTORY QUANTITY
            # ==================================================

            print(
                "\nChecking inventory quantity type..."
            )

            connection.execute(
                text(
                    """
                    ALTER TABLE inventory_items
                    ALTER COLUMN quantity
                    TYPE DOUBLE PRECISION
                    USING quantity::DOUBLE PRECISION
                    """
                )
            )

            print(
                "✓ inventory_items.quantity "
                "converted to DOUBLE PRECISION"
            )


            # ==================================================
            # INVENTORY OWNER MIGRATION
            # ==================================================

            if column_exists(
                connection,
                "inventory_items",
                "user_id"
            ):

                print(
                    "\nMigrating inventory "
                    "user_id → owner_id..."
                )

                connection.execute(
                    text(
                        """
                        UPDATE inventory_items
                        SET owner_id = user_id::VARCHAR
                        WHERE owner_id IS NULL
                        """
                    )
                )

            else:

                print(
                    "\nNo inventory_items.user_id "
                    "column found."
                )


            # ==================================================
            # INVENTORY INDEX
            # ==================================================

            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS
                    ix_inventory_items_owner_id
                    ON inventory_items(owner_id)
                    """
                )
            )


            # ==================================================
            # LEDGER
            # ==================================================

            print(
                "\n--- LEDGER ---"
            )


            add_column_if_missing(
                connection,
                "ledger_entries",
                "owner_id",
                "VARCHAR(255)"
            )


            add_column_if_missing(
                connection,
                "ledger_entries",
                "customer_phone",
                "VARCHAR(50)"
            )


            add_column_if_missing(
                connection,
                "ledger_entries",
                "note",
                "TEXT"
            )


            add_column_if_missing(
                connection,
                "ledger_entries",
                "is_synced",
                "BOOLEAN"
            )


            # ==================================================
            # LEDGER OWNER MIGRATION
            # ==================================================

            if column_exists(
                connection,
                "ledger_entries",
                "user_id"
            ):

                print(
                    "\nMigrating ledger "
                    "user_id → owner_id..."
                )

                connection.execute(
                    text(
                        """
                        UPDATE ledger_entries
                        SET owner_id = user_id::VARCHAR
                        WHERE owner_id IS NULL
                        """
                    )
                )

            else:

                print(
                    "\nNo ledger_entries.user_id "
                    "column found."
                )


            # ==================================================
            # LEDGER DEFAULTS
            # ==================================================

            connection.execute(
                text(
                    """
                    UPDATE ledger_entries
                    SET is_synced = TRUE
                    WHERE is_synced IS NULL
                    """
                )
            )


            # ==================================================
            # LEDGER INDEX
            # ==================================================

            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS
                    ix_ledger_entries_owner_id
                    ON ledger_entries(owner_id)
                    """
                )
            )


            # ==================================================
            # SALES
            # ==================================================

            print(
                "\n--- SALES ---"
            )


            add_column_if_missing(
                connection,
                "sales_transactions",
                "owner_id",
                "VARCHAR(255)"
            )


            add_column_if_missing(
                connection,
                "sales_transactions",
                "is_synced",
                "BOOLEAN"
            )


            # ==================================================
            # SALES OWNER MIGRATION
            # ==================================================

            if column_exists(
                connection,
                "sales_transactions",
                "user_id"
            ):

                print(
                    "\nMigrating sales "
                    "user_id → owner_id..."
                )

                connection.execute(
                    text(
                        """
                        UPDATE sales_transactions
                        SET owner_id = user_id::VARCHAR
                        WHERE owner_id IS NULL
                        """
                    )
                )

            else:

                print(
                    "\nNo sales_transactions.user_id "
                    "column found."
                )


            # ==================================================
            # SALES DEFAULTS
            # ==================================================

            connection.execute(
                text(
                    """
                    UPDATE sales_transactions
                    SET is_synced = TRUE
                    WHERE is_synced IS NULL
                    """
                )
            )


            # ==================================================
            # SALES INDEX
            # ==================================================

            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS
                    ix_sales_transactions_owner_id
                    ON sales_transactions(owner_id)
                    """
                )
            )


            # ==================================================
            # COMMIT
            # ==================================================

            transaction.commit()


            print("\n" + "=" * 60)
            print(
                "✅ MIGRATION COMPLETED SUCCESSFULLY"
            )
            print("=" * 60)


        except Exception as error:

            transaction.rollback()

            print("\n" + "=" * 60)
            print(
                "❌ MIGRATION FAILED"
            )
            print("=" * 60)

            print(
                f"\nError: {error}"
            )

            print(
                "\nDatabase changes were rolled back."
            )

            raise

        finally:

            connection.close()


if __name__ == "__main__":

    run_migration()