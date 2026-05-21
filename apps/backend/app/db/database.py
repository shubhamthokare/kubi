from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def connect_to_mongo():
    import asyncio
    max_retries = 5
    retry_delay = 2
    for attempt in range(1, max_retries + 1):
        logger.info(f"Connecting to MongoDB (attempt {attempt}/{max_retries})...")
        try:
            db.client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
            # Ping the database
            await db.client.admin.command('ping')
            logger.info("Successfully connected to MongoDB!")
            return
        except Exception as e:
            logging.exception(f"MongoDB connection attempt {attempt} failed: {e}")
            if attempt < max_retries:
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                # Exponential backoff
                retry_delay *= 2
            else:
                logger.critical("Could not establish connection to MongoDB after maximum retries.")
                raise e

async def close_mongo_connection():
    if db.client:
        logger.info("Closing MongoDB connection...")
        db.client.close()

def get_db():
    if db.client is None:
        raise Exception("Database client not initialized")
    return db.client[settings.DATABASE_NAME]
