import os

if os.environ.get("VERCEL_ENV") == "production":
    os.environ.pop("VERCEL_IPC_PATH", None)
